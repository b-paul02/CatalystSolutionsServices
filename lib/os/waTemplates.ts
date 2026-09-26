// WP-45 · WhatsApp templates from the Twilio Content API: list + approval status synced into LosMessageTemplate
// (channel whatsapp, contentSid, approvalStatus, variables). Sequences pick them like any template; sending is unchanged.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { assertWritable, WorkError, type WorkActor } from "./work";

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setWaFetchForTests = (f: typeof fetch) => { fetchImpl = f; };

type Content = { sid: string; friendly_name: string; language?: string; variables?: Record<string, string>; types?: Record<string, { body?: string }> };

export function bodyOf(c: Content): string {
  const t = c.types ?? {};
  const body = t["twilio/text"]?.body ?? t["twilio/quick-reply"]?.body ?? t["twilio/call-to-action"]?.body ?? t["twilio/list-picker"]?.body ?? t["twilio/card"]?.body ?? Object.values(t)[0]?.body ?? "";
  // Twilio variables are {{1}}, {{2}}…; our renderer uses {{firstName}} etc. Keep them literal so the sequence editor shows what needs mapping.
  return body;
}

export async function syncWaTemplates(actor: WorkActor) {
  if (!can(actor.role, "leads.contact") && !can(actor.role, "campaigns.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new WorkError("WhatsApp is not configured on this server (Twilio).");
  const auth = { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` };
  const r = await fetchImpl("https://content.twilio.com/v1/Content?PageSize=100", { headers: auth, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new WorkError(`Twilio answered HTTP ${r.status}.`);
  const list = ((await r.json()) as { contents?: Content[] }).contents ?? [];
  let n = 0;
  for (const c of list) {
    let status = "unsubmitted";
    try { const a = await fetchImpl(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`, { headers: auth, signal: AbortSignal.timeout(10_000) }); if (a.ok) { const j = (await a.json()) as { whatsapp?: { status?: string } }; status = j.whatsapp?.status ?? "unsubmitted"; } } catch { /* keep unsubmitted */ }
    const existing = await db.losMessageTemplate.findFirst({ where: { orgId: actor.orgId, contentSid: c.sid } });
    const data = { name: `${c.friendly_name}${c.language ? ` (${c.language})` : ""}`.slice(0, 120), channel: "whatsapp", body: bodyOf(c).slice(0, 4000), contentSid: c.sid, approvalStatus: status, variables: JSON.stringify(c.variables ?? {}) };
    if (existing) await db.losMessageTemplate.update({ where: { id: existing.id }, data }); else await db.losMessageTemplate.create({ data: { orgId: actor.orgId, ...data } });
    n++;
  }
  return n;
}
