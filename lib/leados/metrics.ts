// Daily metrics rollup + weekly email report (blueprint §5.12).
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "./jobs";
import { sendLosMail, APP_URL } from "./email";

export const METRICS_JOB = "leados:metrics-rollup";
export const WEEKLY_REPORT_JOB = "leados:weekly-report";

export type DayMetrics = {
  leadsCreated: number;
  bySource: Record<string, number>;
  delivered: number;
  contacted: number;
  converted: number;
  submissions: number;
  views: number;
  messagesSent: number;
  tokensSpent: number;
};

export async function rollupOrgDay(orgId: string, date: string): Promise<DayMetrics> {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const range = { gte: start, lt: end };
  const [created, delivered, contacted, converted, submissions, views, messages, tokens] = await Promise.all([
    db.losLead.groupBy({ by: ["source"], where: { orgId, createdAt: range }, _count: true }),
    db.losAllocation.count({ where: { orgId, createdAt: range } }),
    db.losLead.count({ where: { orgId, contactedAt: range } }),
    db.losLead.count({ where: { orgId, convertedAt: range } }),
    db.losFormSubmission.count({ where: { orgId, createdAt: range } }),
    db.losCampaign.findMany({ where: { orgId }, select: { id: true } }).then((cs) =>
      cs.length === 0 ? 0 : db.losAttributionEvent.count({ where: { kind: "view", createdAt: range, campaignId: { in: cs.map((c) => c.id) } } }),
    ),
    db.losOutboundMessage.count({ where: { orgId, createdAt: range, status: { in: ["sent", "dev_logged"] } } }),
    db.losTokenLedger.aggregate({ where: { orgId, createdAt: range, delta: { lt: 0 } }, _sum: { delta: true } }),
  ]);
  const metrics: DayMetrics = {
    leadsCreated: created.reduce((s, g) => s + g._count, 0),
    bySource: Object.fromEntries(created.map((g) => [g.source, g._count])),
    delivered,
    contacted,
    converted,
    submissions,
    views,
    messagesSent: messages,
    tokensSpent: -(tokens._sum.delta ?? 0),
  };
  await db.losDailyMetric.upsert({
    where: { orgId_date: { orgId, date } },
    update: { metrics: JSON.stringify(metrics) },
    create: { orgId, date, metrics: JSON.stringify(metrics) },
  });
  return metrics;
}

registerJobHandler(METRICS_JOB, async (payload) => {
  const { date } = payload as { date: string };
  const orgs = await db.losOrg.findMany({ where: { status: "active" }, select: { id: true } });
  for (const org of orgs) await rollupOrgDay(org.id, date);
});

registerJobHandler(WEEKLY_REPORT_JOB, async () => {
  const orgs = await db.losOrg.findMany({ where: { status: "active" } });
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  for (const org of orgs) {
    const rows = await db.losDailyMetric.findMany({ where: { orgId: org.id, date: { gte: since } } });
    if (rows.length === 0) continue;
    const sum = rows.reduce(
      (acc, r) => {
        const m = JSON.parse(r.metrics) as DayMetrics;
        acc.leads += m.leadsCreated; acc.delivered += m.delivered;
        acc.converted += m.converted; acc.tokens += m.tokensSpent;
        return acc;
      },
      { leads: 0, delivered: 0, converted: 0, tokens: 0 },
    );
    if (sum.leads + sum.delivered === 0) continue;
    const owner = await db.losMembership.findFirst({ where: { orgId: org.id, role: "owner" }, include: { user: true } });
    if (!owner) continue;
    await sendLosMail({
      to: owner.user.email,
      subject: `${org.name} — your LeadOS week`,
      text: `This week at ${org.name}:\n\n• ${sum.leads} new leads\n• ${sum.delivered} leads delivered\n• ${sum.converted} conversions\n• ${sum.tokens.toLocaleString()} tokens used\n\nFull reports: ${APP_URL}/reports`,
    }).catch(() => {});
  }
});

export async function enqueueMetricsJobs(now = new Date()): Promise<void> {
  // Roll up yesterday (finalized) once per day; also refresh today every ~2h.
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  await enqueueJob({ type: METRICS_JOB, payload: { date: yesterday }, idempotencyKey: `metrics-${yesterday}` });
  const window = Math.floor(now.getTime() / (2 * 3_600_000));
  await enqueueJob({ type: METRICS_JOB, payload: { date: today }, idempotencyKey: `metrics-${today}-${window}` });
  // Weekly report on Mondays.
  if (now.getUTCDay() === 1) {
    await enqueueJob({ type: WEEKLY_REPORT_JOB, idempotencyKey: `weekly-${today}` });
  }
}
