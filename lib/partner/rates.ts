import { db } from "@/lib/audit/db";
import { writeAudit } from "./audit";
import type { Actor } from "./auth";

// The commission rate is per-partner data with an append-only history. Nothing
// in this file ever UPDATEs or DELETEs a CommissionRate row, and no default rate
// is hardcoded anywhere — the caller must always supply one.

export const MAX_RATE_BP = 5000; // 50%
export const SECOND_APPROVAL_ABOVE_BP = 3000; // anything above 30% needs a second admin
export const MIN_REASON_LENGTH = 10;

export class RateError extends Error {}

/** Midnight-anchored so "effective from this date" means the whole day. */
function asDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The rate in force for a partner at a given moment: the latest APPROVED row
 * whose effective date has arrived. Returns null if the partner has none —
 * callers must handle that rather than falling back to an assumed rate.
 */
export async function currentRate(partnerId: string, at: Date = new Date()) {
  return db.commissionRate.findFirst({
    where: { partnerId, approvedAt: { not: null }, effectiveFrom: { lte: asDate(at) } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * PARTNER-FACING. Returns the rate in force as a bare number and nothing else.
 *
 * Partner pages must use this rather than currentRate(): a server component
 * that touches a full row puts that row into the RSC payload sent to the
 * browser, which would hand the partner the reason text, who set it, and the
 * approval trail. Allow-list at the query, not at the render.
 */
export async function currentRateBpForPartner(partnerId: string, at: Date = new Date()): Promise<number | null> {
  const row = await db.commissionRate.findFirst({
    where: { partnerId, approvedAt: { not: null }, effectiveFrom: { lte: asDate(at) } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    select: { rateBp: true },
  });
  return row?.rateBp ?? null;
}

/** Every rate row for a partner, newest first — the history table in the admin UI. */
export function rateHistory(partnerId: string) {
  return db.commissionRate.findMany({
    where: { partnerId },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

/** Rows awaiting a second admin's approval. */
export function pendingRates(partnerId: string) {
  return db.commissionRate.findMany({ where: { partnerId, approvedAt: null }, orderBy: { createdAt: "desc" } });
}

/**
 * The rate to stamp onto a deal at the moment it is won. Commissions are then
 * built from the stamped value, never from a live lookup — so a later rate
 * change cannot move money on a deal that is already won.
 *
 * Throws rather than defaulting: a partner with no rate in force must not be
 * able to win a deal that silently pays some assumed percentage.
 */
export async function lockedRateBpForWin(partnerId: string, wonAt: Date = new Date()): Promise<number> {
  const rate = await currentRate(partnerId, wonAt);
  if (!rate) throw new RateError("This partner has no commission rate in force, so the deal cannot be won yet.");
  return rate.rateBp;
}

export function validateRate(rateBp: number, reason: string) {
  if (!Number.isInteger(rateBp)) throw new RateError("The rate must be a whole number of basis points.");
  if (rateBp < 0 || rateBp > MAX_RATE_BP) throw new RateError(`The rate must be between 0% and ${MAX_RATE_BP / 100}%.`);
  if (reason.trim().length < MIN_REASON_LENGTH) throw new RateError(`Give a reason of at least ${MIN_REASON_LENGTH} characters.`);
}

/**
 * Appends a new rate row.
 *
 * - never backdated past the most recent existing rate row
 * - above 30% it is stored unapproved and does not take effect until a second
 *   admin approves it
 * - existing commissions are never touched; deals lock their rate when won
 */
export async function setRate(opts: {
  partnerId: string;
  rateBp: number;
  effectiveFrom: Date;
  reason: string;
  actor: Actor;
  /** The very first rate, written when an application is approved. */
  initial?: boolean;
}) {
  const { partnerId, rateBp, reason, actor } = opts;
  validateRate(rateBp, reason);

  const effectiveFrom = asDate(opts.effectiveFrom);
  const latest = await db.commissionRate.findFirst({
    where: { partnerId },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (latest && effectiveFrom < asDate(latest.effectiveFrom)) {
    throw new RateError("A rate cannot be backdated past the most recent rate change.");
  }

  const needsSecondAdmin = rateBp > SECOND_APPROVAL_ABOVE_BP;
  const row = await db.commissionRate.create({
    data: {
      partnerId,
      rateBp,
      effectiveFrom,
      reason: reason.trim(),
      setByUserId: actor.userId,
      // An initial rate at or below the threshold is live immediately.
      approvedAt: needsSecondAdmin ? null : new Date(),
      approvedByUserId: needsSecondAdmin ? null : actor.userId,
    },
  });

  await writeAudit({
    actor, entity: "commission_rate", entityId: row.id, action: opts.initial ? "rate_set_initial" : "rate_changed",
    before: latest ? { rateBp: latest.rateBp, effectiveFrom: latest.effectiveFrom } : null,
    after: { rateBp, effectiveFrom, pendingSecondApproval: needsSecondAdmin },
    reason: reason.trim(),
  });

  return { row, needsSecondAdmin };
}

/**
 * A second admin approves a pending high rate. The admin who set it may not
 * approve their own — that is the entire point of the rule.
 */
export async function approveRate(rateId: string, actor: Actor) {
  const row = await db.commissionRate.findUnique({ where: { id: rateId } });
  if (!row) throw new RateError("Rate change not found.");
  if (row.approvedAt) throw new RateError("That rate change is already approved.");
  if (row.setByUserId === actor.userId) throw new RateError("A second admin must approve this rate change.");

  const updated = await db.commissionRate.update({
    where: { id: rateId },
    data: { approvedAt: new Date(), approvedByUserId: actor.userId },
  });
  await writeAudit({
    actor, entity: "commission_rate", entityId: rateId, action: "rate_approved",
    before: { approvedAt: null }, after: { approvedAt: updated.approvedAt, rateBp: updated.rateBp },
    reason: `Second-admin approval of ${updated.rateBp / 100}%`,
  });
  return updated;
}
