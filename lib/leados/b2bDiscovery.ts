// B2B discovery (blueprint §5.3) behind a provider abstraction.
// Providers: "internal" (approved platform B2B inventory — always available)
// and external licensed vendors (slot into PROVIDERS when credentialed).
// Results are MASKED until revealed; a reveal debits tokens once per org+record.
import { db } from "@/lib/audit/db";
import { computeTokenCost } from "./tokens";
import { debitTokensTx, tokenBalance } from "./tokens";
import { createLead, type LeadInput } from "./leadWrite";

export type B2bSearchFilters = {
  q?: string; // name / title / company free text
  title?: string;
  country?: string;
  city?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  companyDomain?: string;
};

export type B2bSearchHit = {
  recordId: string;
  provider: string;
  firstName: string | null;
  lastNameInitial: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyDomain: string | null;
  city: string | null;
  country: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  qualityScore: number;
  freshnessDays: number;
  revealed: null | { leadId: string | null; email: string | null; phone: string | null };
};

const mask = (s: string | null | undefined) => (s ? `${s[0]}${"•".repeat(Math.min(6, Math.max(2, s.length - 1)))}` : null);

/** Internal provider: search approved, unexpired B2B inventory. */
export async function searchPeople(orgId: string, filters: B2bSearchFilters, limit = 25): Promise<B2bSearchHit[]> {
  const exclusions = new Set(
    (await db.losExclusion.findMany({ where: { orgId }, select: { domain: true } })).map((e) => e.domain),
  );
  const records = await db.losInventoryRecord.findMany({
    where: {
      leadType: "b2b",
      status: { in: ["available", "allocated"] }, // shared b2b data stays searchable
      dataset: { status: "approved" },
      ...(filters.country ? { country: { contains: filters.country, mode: "insensitive" } } : {}),
      ...(filters.city ? { city: { contains: filters.city, mode: "insensitive" } } : {}),
      ...(filters.hasEmail ? { normalizedEmail: { not: null } } : {}),
      ...(filters.hasPhone ? { normalizedPhone: { not: null } } : {}),
    },
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    take: 400,
  });
  const reveals = await db.losReveal.findMany({
    where: { orgId, recordId: { in: records.map((r) => r.id) } },
  });
  const now = Date.now();
  const out: B2bSearchHit[] = [];
  for (const record of records) {
    if (out.length >= limit) break;
    const fields = JSON.parse(record.fields) as LeadInput;
    const domain = (fields.companyDomain ?? "").toLowerCase();
    if (domain && exclusions.has(domain)) continue;
    const haystack = `${fields.firstName ?? ""} ${fields.lastName ?? ""} ${fields.jobTitle ?? ""} ${fields.companyName ?? ""}`.toLowerCase();
    if (filters.q && !haystack.includes(filters.q.toLowerCase())) continue;
    if (filters.title && !(fields.jobTitle ?? "").toLowerCase().includes(filters.title.toLowerCase())) continue;
    if (filters.companyDomain && domain !== filters.companyDomain.toLowerCase()) continue;
    const reveal = reveals.find((r) => r.recordId === record.id);
    out.push({
      recordId: record.id,
      provider: "internal",
      firstName: fields.firstName ?? null,
      lastNameInitial: fields.lastName ? `${fields.lastName[0]}.` : null,
      jobTitle: fields.jobTitle ?? null,
      companyName: fields.companyName ?? null,
      companyDomain: domain || null,
      city: record.city,
      country: record.country,
      hasEmail: Boolean(record.normalizedEmail),
      hasPhone: Boolean(record.normalizedPhone),
      qualityScore: record.qualityScore,
      freshnessDays: Math.floor((now - record.createdAt.getTime()) / 86_400_000),
      revealed: reveal
        ? { leadId: reveal.leadId, email: record.normalizedEmail, phone: record.normalizedPhone }
        : null,
    });
  }
  return out;
}

export async function revealCostPreview(orgId: string, recordIds: string[]): Promise<{ perRecord: number; total: number; balance: number; alreadyRevealed: number }> {
  const [revealed, records] = await Promise.all([
    db.losReveal.findMany({ where: { orgId, recordId: { in: recordIds } }, select: { recordId: true } }),
    db.losInventoryRecord.findMany({ where: { id: { in: recordIds } }, select: { id: true, normalizedEmail: true, normalizedPhone: true } }),
  ]);
  const revealedSet = new Set(revealed.map((r) => r.recordId));
  // Same math as the charge: per-record verified surcharge included.
  let total = 0;
  let perRecord = 0;
  for (const record of records) {
    const cost = await computeTokenCost({
      leadType: "b2b", exclusivity: "shared",
      verified: Boolean(record.normalizedEmail && record.normalizedPhone),
    });
    perRecord = Math.max(perRecord, cost.tokens);
    if (!revealedSet.has(record.id)) total += cost.tokens;
  }
  return { perRecord, total, balance: await tokenBalance(orgId), alreadyRevealed: revealedSet.size };
}

export type RevealResult = { recordId: string; outcome: "revealed" | "already" | "insufficient_tokens" | "error"; leadId?: string };

/** Reveal records: debit tokens once per org+record, create the lead. */
export async function revealRecords(orgId: string, recordIds: string[], userId: string): Promise<RevealResult[]> {
  const results: RevealResult[] = [];
  for (const recordId of recordIds.slice(0, 50)) {
    const existing = await db.losReveal.findUnique({ where: { orgId_recordId: { orgId, recordId } } });
    if (existing) {
      results.push({ recordId, outcome: "already", leadId: existing.leadId ?? undefined });
      continue;
    }
    const record = await db.losInventoryRecord.findFirst({
      where: { id: recordId, leadType: "b2b", dataset: { status: "approved" } },
    });
    if (!record) {
      results.push({ recordId, outcome: "error" });
      continue;
    }
    const cost = await computeTokenCost({ leadType: "b2b", exclusivity: "shared", verified: Boolean(record.normalizedEmail && record.normalizedPhone) });
    try {
      const reveal = await db.$transaction(async (tx) => {
        const balance = (await tx.losTokenLedger.aggregate({ where: { orgId }, _sum: { delta: true } }))._sum.delta ?? 0;
        if (balance < cost.tokens) return null;
        const row = await tx.losReveal.create({
          data: { orgId, recordId, tokensCharged: cost.tokens, revealedById: userId },
        });
        await debitTokensTx(tx, { orgId, amount: cost.tokens, kind: "reveal_debit", refId: row.id, note: "B2B contact reveal" });
        return row;
      });
      if (!reveal) {
        results.push({ recordId, outcome: "insufficient_tokens" });
        continue;
      }
      const created = await createLead({
        orgId, leadType: "b2b", source: "allocation", sourceRef: `reveal:${reveal.id}`,
        input: JSON.parse(record.fields) as LeadInput, verify: false, demo: record.demo,
      });
      const leadId = created.outcome === "invalid" ? null : created.leadId;
      if (leadId) await db.losReveal.update({ where: { id: reveal.id }, data: { leadId } });
      results.push({ recordId, outcome: "revealed", leadId: leadId ?? undefined });
    } catch {
      results.push({ recordId, outcome: "error" });
    }
  }
  return results;
}

/** Company view: aggregate approved B2B inventory + org's own leads by domain. */
export async function companyProfile(orgId: string, domain: string) {
  const [inventory, companies] = await Promise.all([
    searchPeople(orgId, { companyDomain: domain }, 50),
    db.losCompany.findMany({ where: { orgId, domain } }),
  ]);
  return { domain, people: inventory, company: companies[0] ?? null };
}
