// WP-31 · per-workspace sending domain on Resend (add → DNS records shown → verify), bounce / complaint webhook →
// suppression, and the From address used by outreach once verified. Plain REST; the API key stays platform-level.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { suppressContact } from "@/lib/leados/suppression";
import { assertWritable, WorkError, type WorkActor } from "./work";

const API = "https://api.resend.com";
const headers = () => ({ Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" });
export type DnsRecord = { type: string; name: string; value: string; status?: string };

export async function addSendingDomain(actor: WorkActor, domain: string) {
  if (!can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  if (!process.env.RESEND_API_KEY) throw new WorkError("Email transport is not configured on this server (RESEND_API_KEY).");
  const d = domain.trim().toLowerCase();
  if (!/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) throw new WorkError("Enter a domain like mail.yourcompany.com.");
  const res = await fetch(`${API}/domains`, { method: "POST", headers: headers(), body: JSON.stringify({ name: d }), signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { id?: string; records?: DnsRecord[]; message?: string };
  if (!res.ok || !j.id) throw new WorkError(`Resend refused the domain${j.message ? ` (${j.message})` : ""}.`);
  await db.cosWorkspace.update({ where: { orgId: actor.orgId }, data: { emailDomain: d, emailDomainId: j.id, emailDomainStatus: "pending", emailDomainRecords: JSON.stringify(j.records ?? []) } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "email_domain.added", entity: "CosWorkspace", entityId: actor.orgId, data: { domain: d } });
  return { domain: d, records: j.records ?? [] };
}

/** Ask Resend to verify, then read back the status. */
export async function checkSendingDomain(actor: WorkActor) {
  if (!can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  const ws = await db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } });
  if (!ws?.emailDomainId) throw new WorkError("No sending domain yet.");
  await fetch(`${API}/domains/${ws.emailDomainId}/verify`, { method: "POST", headers: headers(), signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  const res = await fetch(`${API}/domains/${ws.emailDomainId}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as { status?: string; records?: DnsRecord[] };
  const status = j.status === "verified" ? "verified" : j.status === "failed" ? "failed" : "pending";
  await db.cosWorkspace.update({ where: { orgId: actor.orgId }, data: { emailDomainStatus: status, ...(j.records ? { emailDomainRecords: JSON.stringify(j.records) } : {}) } });
  return { status, records: j.records ?? (ws.emailDomainRecords ? (JSON.parse(ws.emailDomainRecords) as DnsRecord[]) : []) };
}

/** From address for outreach: the verified workspace domain, else the platform default (null). */
export async function senderFor(orgId: string): Promise<string | null> {
  const [ws, org] = await Promise.all([db.cosWorkspace.findUnique({ where: { orgId }, select: { emailDomain: true, emailDomainStatus: true } }), db.losOrg.findUnique({ where: { id: orgId }, select: { name: true } })]);
  if (!ws?.emailDomain || ws.emailDomainStatus !== "verified") return null;
  return `${(org?.name ?? "Team").replace(/["<>]/g, "").slice(0, 60)} <hello@${ws.emailDomain}>`;
}

// ── webhook (Svix-style signature: v1 = base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`, key = base64 after "whsec_") ──
export function verifyResendWebhook(raw: string, h: { id: string | null; timestamp: string | null; signature: string | null }, secret = process.env.RESEND_WEBHOOK_SECRET, now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  if (Math.abs(now / 1000 - Number(h.timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${raw}`).digest("base64");
  return h.signature.split(" ").some((part) => { const sig = part.replace(/^v1,/, ""); const a = Buffer.from(sig), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); });
}

/** email.bounced / email.complained → suppress that address for the workspace that sent it (looked up by our message tag). */
export async function handleResendEvent(event: { type?: string; data?: { to?: string[] | string; email_id?: string; tags?: { name: string; value: string }[]; bounce?: { type?: string } } }) {
  const type = event.type ?? "";
  if (!/^email\.(bounced|complained)$/.test(type)) return { applied: false, reason: "ignored" };
  const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  if (!to) return { applied: false, reason: "no recipient" };
  const orgId = event.data?.tags?.find((t) => t.name === "orgId")?.value ?? null;
  const reason = type === "email.complained" ? "complaint" : event.data?.bounce?.type === "Transient" ? "soft_bounce" : "hard_bounce";
  if (reason === "soft_bounce") return { applied: false, reason: "transient bounce — not suppressed" };
  await suppressContact({ email: to, scope: orgId ? "org" : "global", orgId, reason, note: `Resend ${type}` });
  return { applied: true, reason, orgId };
}
