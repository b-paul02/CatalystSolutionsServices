// Outbound webhooks: HMAC-signed, delivered via the job queue (its retry +
// dead-letter semantics apply). Zapier/Make/n8n connect here.
import { createHmac } from "node:crypto";
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler, runPendingJobs } from "./jobs";

export const WEBHOOK_JOB = "leados:webhook-deliver";

export type WebhookEvent = "lead.created" | "lead.status_changed" | "leads.delivered";

registerJobHandler(WEBHOOK_JOB, async (payload) => {
  const { webhookId, event, data } = payload as { webhookId: string; event: string; data: unknown };
  const hook = await db.losWebhook.findUnique({ where: { id: webhookId } });
  if (!hook || !hook.active) return;
  const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() });
  const signature = createHmac("sha256", hook.secret).update(body).digest("hex");
  let status = "error";
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LeadOS-Signature": `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = String(res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await db.losWebhook.update({ where: { id: hook.id }, data: { failCount: 0, lastStatus: status, lastFiredAt: new Date() } });
  } catch (err) {
    await db.losWebhook.update({
      where: { id: hook.id },
      data: { failCount: { increment: 1 }, lastStatus: status, lastFiredAt: new Date() },
    });
    throw err; // job queue retries with backoff, then dead-letters
  }
});

/** Fan out an event to every matching active webhook of the org. */
export async function dispatchWebhookEvent(orgId: string, event: WebhookEvent, data: unknown): Promise<void> {
  const hooks = await db.losWebhook.findMany({ where: { orgId, active: true } });
  let enqueued = 0;
  for (const hook of hooks) {
    const events = JSON.parse(hook.events) as string[];
    if (!events.includes(event)) continue;
    await enqueueJob({ type: WEBHOOK_JOB, payload: { webhookId: hook.id, event, data }, maxAttempts: 6 });
    enqueued++;
  }
  if (enqueued > 0) runPendingJobs(enqueued).catch(() => {});
}

/** Slack notification via the org's incoming-webhook URL (config, not OAuth). */
export async function notifySlack(orgId: string, text: string): Promise<void> {
  const config = await db.losIntegrationConfig.findUnique({ where: { orgId } });
  const url = config ? (JSON.parse(config.config) as { slackWebhookUrl?: string }).slackWebhookUrl : undefined;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => {});
}
