// WP-26 · newsletter as a channel (Loops-style). Adapter "resend:email": the audience is computed AT SEND TIME from
// consent (purpose "newsletter", channel email) and suppression through sendOutreachMessage — one lead at a time, so
// every message carries its own consent decision, cap check, opt-out link and ledger row. Sent in groups of 100.
// ponytail: one publication sends up to the daily channel cap in one attempt; a larger list needs the job chain.
import { db } from "@/lib/audit/db";
import { decideUse } from "@/lib/leados/compliance";
import { contactHashes, isSuppressed } from "@/lib/leados/suppression";
import { sendOutreachMessage } from "@/lib/leados/outreach";
import { sendLosMail } from "@/lib/leados/email";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { WorkError, type WorkActor } from "./work";
import type { PublishInput, PublishResult } from "./adapters";

export const NEWSLETTER_PURPOSE = "newsletter";
export const BATCH = 100;
export const resendReady = (): boolean => Boolean(process.env.RESEND_API_KEY);

/** The platform-level Resend connection row a newsletter variant publishes through (created on first use). */
export async function ensureResendConnection(orgId: string) {
  const existing = await db.cosConnection.findFirst({ where: { orgId, provider: "resend" } });
  const status = resendReady() ? "verified" : "failed";
  const data = { status, capabilities: ["publish"], accountLabel: "Newsletter (Resend)", accountType: "sender", externalAccountId: "resend", config: JSON.stringify({ orgId }), lastCheckedAt: new Date(), lastError: resendReady() ? null : "RESEND_API_KEY is not configured on this server." };
  if (existing) return db.cosConnection.update({ where: { id: existing.id }, data });
  return db.cosConnection.create({ data: { ...data, orgId, provider: "resend" } });
}

/** Leads who may receive a newsletter by email right now. Decided per lead, never cached. */
export async function newsletterAudience(orgId: string): Promise<{ leadId: string; email: string }[]> {
  const leads = await db.losLead.findMany({ where: { orgId, leadType: "b2c", deletedAt: null, normalizedEmail: { not: null } }, include: { b2c: true }, take: 5000 });
  const out: { leadId: string; email: string }[] = [];
  for (const l of leads) {
    const d = decideUse({ permittedPurposes: JSON.parse(l.b2c?.permittedPurposes ?? "[]"), permittedChannels: JSON.parse(l.b2c?.permittedChannels ?? "[]"), retentionExpiresAt: l.b2c?.retentionExpiresAt, withdrawnAt: l.b2c?.withdrawnAt, suppressed: Boolean(l.b2c?.suppressedAt), purpose: NEWSLETTER_PURPOSE, channel: "email" });
    if (d.decision !== "allow") continue;
    if (await isSuppressed(contactHashes(l.normalizedEmail, null), orgId)) continue;
    out.push({ leadId: l.id, email: l.normalizedEmail! });
  }
  return out;
}

/** The adapter: audience → per-lead sends in batches of 100. externalId = the publication's own tally. */
export async function publishNewsletter(i: PublishInput & { orgId?: string }): Promise<PublishResult> {
  const orgId = String(i.account.config.orgId ?? i.orgId ?? "");
  if (!orgId) throw new Error("Newsletter adapter needs the workspace.");
  const audience = await newsletterAudience(orgId);
  let sent = 0, blocked = 0;
  for (let b = 0; b < audience.length; b += BATCH) {
    for (const person of audience.slice(b, b + BATCH)) {
      const r = await sendOutreachMessage({ orgId, leadId: person.leadId, channel: "email", purpose: NEWSLETTER_PURPOSE, subject: i.title ?? "Newsletter", body: [i.text, ...i.parts].filter(Boolean).join("\n\n"), sentById: null });
      if (r.outcome === "sent") sent++; else blocked++;
    }
  }
  return { externalId: `newsletter:${Date.now().toString(36)}:${sent}`, externalUrl: null, partIds: [`sent:${sent}`, `blocked:${blocked}`, `audience:${audience.length}`] };
}

/** Test send to the signed-in member (not a lead): no consent path involved because it is their own address. */
export async function newsletterTestSend(actor: WorkActor & { email: string }, variantId: string) {
  if (!isStaffRole(actor.role) && !can(actor.role, "approvals.decide")) throw new WorkError("Forbidden.");
  const v = await db.cosContentVariant.findFirst({ where: { id: variantId, orgId: actor.orgId, channel: "email" } });
  if (!v) throw new WorkError("Newsletter version not found.");
  return sendLosMail({ to: actor.email, subject: `[TEST] ${v.title ?? "Newsletter"}`, text: `${[v.body, ...v.parts].filter(Boolean).join("\n\n")}\n\n— test send; no unsubscribe link because this is your own address.` });
}
