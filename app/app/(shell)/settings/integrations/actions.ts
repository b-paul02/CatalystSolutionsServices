"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { randomToken } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";
import type { FormState } from "../../../(auth)/actions";

export async function addWebhook(_prev: FormState, form: FormData): Promise<FormState & { secret?: string }> {
  const actor = await requireOrg("org.manage");
  const url = String(form.get("url") ?? "").trim();
  if (!/^https:\/\/.+/.test(url)) return { error: "Webhook URLs must be https://." };
  const events = form.getAll("events").map(String).filter((e) => ["lead.created", "lead.status_changed", "leads.delivered"].includes(e));
  if (events.length === 0) return { error: "Pick at least one event." };
  const secret = `whsec_${randomToken(24)}`;
  await db.losWebhook.create({
    data: { orgId: actor.orgId, url: url.slice(0, 500), secret, events: JSON.stringify(events) },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "webhook.create", entity: "LosWebhook", data: { events } });
  revalidatePath("/app/settings/integrations");
  return { ok: "Webhook added. Copy the signing secret now — it won't be shown again.", secret };
}

export async function deleteWebhook(id: string): Promise<void> {
  const actor = await requireOrg("org.manage");
  await db.losWebhook.deleteMany({ where: { id, orgId: actor.orgId } });
  revalidatePath("/app/settings/integrations");
}

export async function toggleWebhook(id: string): Promise<void> {
  const actor = await requireOrg("org.manage");
  const hook = await db.losWebhook.findFirst({ where: { id, orgId: actor.orgId } });
  if (!hook) return;
  await db.losWebhook.update({ where: { id }, data: { active: !hook.active, failCount: 0 } });
  revalidatePath("/app/settings/integrations");
}

export async function saveSlack(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("org.manage");
  const url = String(form.get("slackWebhookUrl") ?? "").trim();
  if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
    return { error: "That doesn't look like a Slack incoming-webhook URL (https://hooks.slack.com/…)." };
  }
  await db.losIntegrationConfig.upsert({
    where: { orgId: actor.orgId },
    update: { config: JSON.stringify({ slackWebhookUrl: url || undefined }) },
    create: { orgId: actor.orgId, config: JSON.stringify({ slackWebhookUrl: url || undefined }) },
  });
  revalidatePath("/app/settings/integrations");
  return { ok: url ? "Slack notifications on — new leads will ping your channel." : "Slack notifications off." };
}
