// WP-15 · silent contact check before the FIRST outreach to a contact point. Cached 90 days by contact hash.
// Email: syntax → disposable list → role address → MX lookup (dns.promises). Phone: format → Twilio Lookup (when
// configured; Catalyst-internal cost, never client credits). Verdicts: ok | risky | invalid.
// ponytail: no mailbox-level (SMTP) check — port 25 is closed on Vercel; a "valid" MX still means the mailbox may not exist.
import { promises as dns } from "node:dns";
import { db } from "@/lib/audit/db";
import { sha256 } from "./crypto";
import { normalizeEmail, normalizePhone } from "./leads";
import { DISPOSABLE_DOMAINS, ROLE_LOCAL_PARTS } from "./data/disposableDomains";

export const CHECK_TTL_DAYS = 90;
export type Verdict = "ok" | "risky" | "invalid";
export type ContactCheck = { verdict: Verdict; reason: string | null; provider: string; cached: boolean };

// swappable for tests (no real DNS in the suite)
let resolveMx: (domain: string) => Promise<{ exchange: string }[]> = (d) => dns.resolveMx(d);
export const setMxResolverForTests = (fn: typeof resolveMx) => { resolveMx = fn; };

export function checkEmailSyntax(email: string): { verdict: Verdict; reason: string | null } {
  const e = normalizeEmail(email);
  if (!e) return { verdict: "invalid", reason: "syntax" };
  const [local, domain] = e.split("@");
  if (DISPOSABLE_DOMAINS.has(domain)) return { verdict: "invalid", reason: "disposable_domain" };
  if (ROLE_LOCAL_PARTS.has(local.replace(/\+.*$/, ""))) return { verdict: "risky", reason: "role_address" };
  return { verdict: "ok", reason: null };
}

async function checkEmail(email: string): Promise<Omit<ContactCheck, "cached">> {
  const s = checkEmailSyntax(email);
  if (s.verdict === "invalid") return { ...s, provider: "syntax+list" };
  const domain = normalizeEmail(email)!.split("@")[1];
  let mx = false;
  try { mx = (await resolveMx(domain)).length > 0; } catch { mx = false; }
  if (!mx) return { verdict: "invalid", reason: "no_mx", provider: "mx" };
  return { verdict: s.verdict, reason: s.reason, provider: "mx" };
}

async function checkPhone(phone: string): Promise<Omit<ContactCheck, "cached">> {
  const p = normalizePhone(phone);
  if (!p) return { verdict: "invalid", reason: "format", provider: "format" };
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { verdict: "ok", reason: null, provider: "format" }; // no lookup vendor configured: format only
  try {
    const res = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(p.startsWith("+") ? p : `+${p}`)}?Fields=line_type_intelligence`, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(8_000) });
    if (res.status === 404) return { verdict: "invalid", reason: "not_a_number", provider: "twilio_lookup" };
    if (!res.ok) return { verdict: "ok", reason: "lookup_unavailable", provider: "format" };
    const j = (await res.json()) as { valid?: boolean; line_type_intelligence?: { type?: string } };
    if (j.valid === false) return { verdict: "invalid", reason: "not_a_number", provider: "twilio_lookup" };
    const type = j.line_type_intelligence?.type;
    return { verdict: type === "landline" || type === "tollFree" || type === "voip" ? "risky" : "ok", reason: type ? `line_type:${type}` : null, provider: "twilio_lookup" };
  } catch { return { verdict: "ok", reason: "lookup_unavailable", provider: "format" }; }
}

/** The cached verdict when fresh, else a new check (recorded). Never stores the address — the hash only. */
export async function checkContact(kind: "email" | "phone", value: string, orgId?: string | null): Promise<ContactCheck> {
  const norm = kind === "email" ? normalizeEmail(value) : normalizePhone(value);
  const contactHash = sha256(`${kind}:${norm ?? value.trim().toLowerCase()}`);
  const fresh = new Date(Date.now() - CHECK_TTL_DAYS * 86_400_000);
  const cached = await db.losContactCheck.findUnique({ where: { contactHash } });
  if (cached && cached.checkedAt > fresh) return { verdict: cached.verdict as Verdict, reason: cached.reason, provider: cached.provider, cached: true };
  const r = kind === "email" ? await checkEmail(value) : await checkPhone(value);
  await db.losContactCheck.upsert({ where: { contactHash }, update: { verdict: r.verdict, reason: r.reason, provider: r.provider, checkedAt: new Date() }, create: { contactHash, kind, verdict: r.verdict, reason: r.reason, provider: r.provider } });
  // a vendor lookup is a Catalyst-internal cost (owner decision 2026-09-27): recorded as usage, never client credits
  if (r.provider === "twilio_lookup" && orgId) {
    const price = Number(process.env.TWILIO_LOOKUP_PRICE_MICROS);
    await db.cosAiUsage.create({ data: { orgId, feature: "contact_check", modality: "lookup", model: "twilio-lookup-v2", units: 1, costMicros: Number.isFinite(price) && price > 0 ? Math.round(price) : null, ok: true, payer: "catalyst_internal", billingPurpose: "internal_delivery" } }).catch(() => undefined);
  }
  return { ...r, cached: false };
}

/** Verdicts for a lead's contact points (badge on the lead). Absent when never checked. */
export async function contactVerdicts(email: string | null, phone: string | null) {
  const e = normalizeEmail(email), p = normalizePhone(phone);
  const hashes = [e ? sha256(`email:${e}`) : null, p ? sha256(`phone:${p}`) : null];
  const rows = await db.losContactCheck.findMany({ where: { contactHash: { in: hashes.filter((h): h is string => Boolean(h)) } } });
  return { email: rows.find((r) => r.contactHash === hashes[0]) ?? null, phone: rows.find((r) => r.contactHash === hashes[1]) ?? null };
}

/** Retention sweep: checks older than the TTL go (tick.ts). */
export async function sweepContactChecks(now = new Date()): Promise<number> {
  return (await db.losContactCheck.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - CHECK_TTL_DAYS * 86_400_000) } } })).count;
}
