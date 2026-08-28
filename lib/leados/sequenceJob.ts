// Sequence runner: every cron tick, due enrollments fire their next step via
// the guarded send path. Stop-on-reply/opt-out/converted enforced here too.
import { db } from "@/lib/audit/db";
import { registerJobHandler, enqueueJob } from "./jobs";
import { sendOutreachMessage } from "./outreach";

export const SEQUENCE_JOB = "leados:sequence-tick";

function clampToWorkingHours(base: Date): Date {
  // Sends land between 09:00 and 19:00 UTC+5:30 (launch market). Coarse by design.
  const IST_OFFSET = 5.5 * 3_600_000;
  const ist = new Date(base.getTime() + IST_OFFSET);
  const hour = ist.getUTCHours();
  if (hour >= 9 && hour < 19) return base;
  const next = new Date(ist);
  next.setUTCHours(9, 0, 0, 0);
  if (hour >= 19) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - IST_OFFSET);
}

export async function runSequenceTick(): Promise<number> {
  const due = await db.losSequenceEnrollment.findMany({
    where: { status: "active", nextRunAt: { lte: new Date() }, sequence: { status: "active" } },
    include: { sequence: { include: { steps: { orderBy: { order: "asc" } } } } },
    take: 50,
  });
  let fired = 0;
  for (const enrollment of due) {
    const step = enrollment.sequence.steps[enrollment.currentStep];
    if (!step) {
      await db.losSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed" } });
      continue;
    }
    // Stop-on-conversion.
    const lead = await db.losLead.findUnique({ where: { id: enrollment.leadId }, select: { status: true } });
    if (!lead || ["converted", "lost"].includes(lead.status)) {
      await db.losSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "stopped_converted" } });
      continue;
    }
    const template = await db.losMessageTemplate.findFirst({ where: { id: step.templateId, orgId: enrollment.orgId } });
    if (!template) {
      await db.losSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "blocked" } });
      continue;
    }
    const result = await sendOutreachMessage({
      orgId: enrollment.orgId,
      leadId: enrollment.leadId,
      channel: step.channel as "whatsapp" | "sms" | "email",
      body: template.body,
      subject: template.subject ?? undefined,
      templateId: template.id,
      sequenceId: enrollment.sequenceId,
      sentById: null,
    });
    fired++;
    if (result.outcome === "blocked" && ["suppressed", "consent_withdrawn", "channel_not_permitted", "retention_expired"].includes(result.reason)) {
      await db.losSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "blocked" } });
      continue;
    }
    const nextStep = enrollment.sequence.steps[enrollment.currentStep + 1];
    if (!nextStep) {
      await db.losSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed", currentStep: enrollment.currentStep + 1 } });
    } else {
      await db.losSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: enrollment.currentStep + 1,
          nextRunAt: clampToWorkingHours(new Date(Date.now() + nextStep.delayHours * 3_600_000)),
        },
      });
    }
  }
  return fired;
}

registerJobHandler(SEQUENCE_JOB, async () => {
  await runSequenceTick();
});

/** The cron route enqueues one tick per 15-minute window. */
export async function enqueueSequenceTick(now = new Date()): Promise<void> {
  const window = Math.floor(now.getTime() / (15 * 60_000));
  await enqueueJob({ type: SEQUENCE_JOB, idempotencyKey: `seq-tick-${window}` });
}
