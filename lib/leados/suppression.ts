// Suppression + consent-ledger operations. Suppression is keyed on a hash of
// the normalized contact point so it survives lead deletion and spans tenants.
import { db } from "@/lib/audit/db";
import { sha256 } from "./crypto";
import { normalizeEmail, normalizePhone } from "./leads";

export function contactHashes(email?: string | null, phone?: string | null): string[] {
  const out: string[] = [];
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  if (e) out.push(sha256(`email:${e}`));
  if (p) out.push(sha256(`phone:${p}`));
  return out;
}

/** Is any of these contact hashes suppressed for this org (or globally)? */
export async function isSuppressed(hashes: string[], orgId?: string | null): Promise<boolean> {
  if (hashes.length === 0) return false;
  const hit = await db.losSuppressionEntry.findFirst({
    where: {
      contactHash: { in: hashes },
      OR: [{ scope: "global" }, ...(orgId ? [{ scope: "org", orgId }] : [])],
    },
    select: { id: true },
  });
  return Boolean(hit);
}

/**
 * Suppress a contact and propagate: marks every matching B2C lead (in the org,
 * or platform-wide for global scope) as suppressed, and writes ledger events.
 */
export async function suppressContact(opts: {
  email?: string | null;
  phone?: string | null;
  scope: "org" | "global";
  orgId?: string | null;
  reason: string;
  note?: string;
  createdById?: string | null;
}): Promise<{ suppressed: number }> {
  const hashes = contactHashes(opts.email, opts.phone);
  if (hashes.length === 0) return { suppressed: 0 };

  for (const contactHash of hashes) {
    // Not upsert: the unique key includes a nullable orgId (global scope), which
    // Prisma's compound-unique where cannot express with null.
    const orgId = opts.scope === "org" ? opts.orgId ?? null : null;
    const existing = await db.losSuppressionEntry.findFirst({
      where: { contactHash, scope: opts.scope, orgId },
    });
    if (existing) {
      await db.losSuppressionEntry.update({
        where: { id: existing.id },
        data: { reason: opts.reason, note: opts.note ?? null },
      });
    } else {
      await db.losSuppressionEntry.create({
        data: { contactHash, scope: opts.scope, orgId, reason: opts.reason, note: opts.note ?? null, createdById: opts.createdById ?? null },
      });
    }
  }

  const normalizedEmail = normalizeEmail(opts.email);
  const normalizedPhone = normalizePhone(opts.phone);
  const leads = await db.losLead.findMany({
    where: {
      leadType: "b2c",
      deletedAt: null,
      ...(opts.scope === "org" ? { orgId: opts.orgId ?? "" } : {}),
      OR: [
        ...(normalizedEmail ? [{ normalizedEmail }] : []),
        ...(normalizedPhone ? [{ normalizedPhone }] : []),
      ],
    },
    select: { id: true, orgId: true },
  });
  const now = new Date();
  if (leads.length > 0) {
    await db.losLeadB2c.updateMany({
      where: { leadId: { in: leads.map((l) => l.id) } },
      data: { suppressedAt: now },
    });
  }
  for (const contactHash of hashes) {
    await db.losConsentEvent.create({
      data: {
        contactHash,
        orgId: opts.scope === "org" ? opts.orgId ?? null : null,
        kind: "suppression",
        data: JSON.stringify({ reason: opts.reason, scope: opts.scope, leadsAffected: leads.length }),
      },
    });
  }
  return { suppressed: leads.length };
}

/** Consent withdrawal for one lead: ledger + lead flags + org-scope suppression. */
export async function withdrawConsent(opts: {
  leadId: string;
  orgId: string;
  sourceApp?: string;
}): Promise<void> {
  const lead = await db.losLead.findFirst({
    where: { id: opts.leadId, orgId: opts.orgId, leadType: "b2c" },
  });
  if (!lead) return;
  await db.losLeadB2c.update({
    where: { leadId: lead.id },
    data: { withdrawnAt: new Date() },
  });
  for (const contactHash of contactHashes(lead.normalizedEmail, lead.normalizedPhone)) {
    await db.losConsentEvent.create({
      data: { contactHash, orgId: opts.orgId, leadId: lead.id, kind: "withdrawal", sourceApp: opts.sourceApp ?? null },
    });
  }
  await suppressContact({
    email: lead.normalizedEmail, phone: lead.normalizedPhone,
    scope: "org", orgId: opts.orgId, reason: "withdrawal",
  });
}
