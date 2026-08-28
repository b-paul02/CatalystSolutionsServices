"use server";

// Templates + sequences management.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import type { FormState } from "../../(auth)/actions";

export async function saveTemplate(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.contact");
  const id = String(form.get("id") ?? "") || null;
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const channel = String(form.get("channel"));
  const subject = String(form.get("subject") ?? "").trim().slice(0, 200) || null;
  const body = String(form.get("body") ?? "").trim().slice(0, 3000);
  if (!name || !body) return { error: "Name and body are required." };
  if (!["whatsapp", "sms", "email"].includes(channel)) return { error: "Pick a channel." };
  if (id) {
    await db.losMessageTemplate.updateMany({ where: { id, orgId: actor.orgId }, data: { name, channel, subject, body } });
  } else {
    await db.losMessageTemplate.create({ data: { orgId: actor.orgId, name, channel, subject, body } });
  }
  revalidatePath("/app/outreach");
  return { ok: "Template saved." };
}

export async function deleteTemplate(id: string): Promise<void> {
  const actor = await requireOrg("leads.contact");
  await db.losMessageTemplate.deleteMany({ where: { id, orgId: actor.orgId } });
  revalidatePath("/app/outreach");
}

export async function createSequence(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("pipeline.manage");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!name) return { error: "Name the sequence." };
  // steps come as parallel arrays step-template / step-delay
  const templateIds = form.getAll("stepTemplate").map(String).filter(Boolean);
  const delays = form.getAll("stepDelay").map((d) => Math.max(1, parseInt(String(d), 10) || 24));
  if (templateIds.length === 0) return { error: "Add at least one step." };
  const templates = await db.losMessageTemplate.findMany({ where: { orgId: actor.orgId, id: { in: templateIds } } });
  const sequence = await db.losSequence.create({
    data: {
      orgId: actor.orgId, name,
      steps: {
        create: templateIds.map((templateId, i) => {
          const t = templates.find((x) => x.id === templateId);
          return { order: i, channel: t?.channel ?? "whatsapp", templateId, delayHours: delays[i] ?? 24 };
        }),
      },
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "sequence.create", entity: "LosSequence", entityId: sequence.id });
  revalidatePath("/app/outreach");
  return { ok: `Sequence "${name}" created.` };
}

export async function setSequenceStatus(id: string, status: "active" | "paused"): Promise<void> {
  const actor = await requireOrg("pipeline.manage");
  await db.losSequence.updateMany({ where: { id, orgId: actor.orgId }, data: { status } });
  revalidatePath("/app/outreach");
}
