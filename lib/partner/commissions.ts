import { db } from "@/lib/audit/db";
import { writeAudit } from "./audit";
import { commissionAmount, proRata, CURRENCY_OF, type Market } from "./money";
import { lockedRateBpForWin } from "./rates";
import type { Actor } from "./auth";

/**
 * The ONLY reasons a commission may be adjusted.
 *
 * There is no retention clawback. A client declining, cancelling or lapsing the
 * monthly Growth Plan must never reduce a partner's commission — the partner is
 * paid on the onboarding fee they sold, and recurring revenue was never theirs
 * to lose. This list is deliberately closed: nothing outside it can be passed,
 * and no other code path creates an `adjusted` row.
 */
export const ADJUSTMENT_REASONS = ["refund", "chargeback", "misselling"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  refund: "Refund to the client",
  chargeback: "Chargeback",
  misselling: "Recorded misselling",
};

export class CommissionError extends Error {}

const CLOSED_STAGES = ["won", "lost", "lapsed"];

/**
 * Deal won → one pending commission, computed from the rate LOCKED onto the
 * deal at this moment. Later rate changes cannot move it.
 */
export async function winDeal(opts: { actor: Actor; dealId: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const deal = await db.deal.findUnique({
    where: { id: opts.dealId },
    select: { id: true, partnerId: true, stage: true, market: true, onboardingFee: true, commissionRateBpLocked: true },
  });
  if (!deal) throw new CommissionError("Deal not found.");
  if (deal.stage === "won") throw new CommissionError("This deal is already won.");
  if (CLOSED_STAGES.includes(deal.stage)) throw new CommissionError("This deal is closed.");
  if (!deal.onboardingFee) throw new CommissionError("Attach a package from the price book before winning the deal.");

  // The rate is read once, here, and frozen onto the deal.
  const rateBp = await lockedRateBpForWin(deal.partnerId, now);
  const base = deal.onboardingFee;
  const amount = commissionAmount(base, rateBp);
  const currency = CURRENCY_OF[deal.market as Market];

  await db.deal.update({
    where: { id: deal.id },
    data: { stage: "won", wonAt: now, commissionRateBpLocked: rateBp, lastActivityAt: now },
  });
  const commission = await db.commission.create({
    data: { dealId: deal.id, partnerId: deal.partnerId, baseAmount: base, rateBp, amount, currency, state: "pending" },
  });

  await writeAudit({
    actor: opts.actor, entity: "deal", entityId: deal.id, action: "won",
    before: { stage: deal.stage }, after: { stage: "won", commissionRateBpLocked: rateBp },
    reason: "Deal won — commission rate locked",
  });
  await writeAudit({
    actor: opts.actor, entity: "commission", entityId: commission.id, action: "created",
    after: { state: "pending", baseAmount: base, rateBp, amount }, reason: "Deal won",
  });

  return commission;
}

/** Invoice recorded → the deal's pending commission accrues. */
export async function recordInvoice(opts: {
  actor: Actor; dealId: string; amount: bigint; tax?: bigint; dueAt?: Date | null; reference?: string; now?: Date;
}) {
  const now = opts.now ?? new Date();
  if (opts.amount <= 0n) throw new CommissionError("An invoice must be for a positive amount.");
  const deal = await db.deal.findUnique({ where: { id: opts.dealId }, select: { id: true, stage: true } });
  if (!deal) throw new CommissionError("Deal not found.");
  if (deal.stage !== "won") throw new CommissionError("Only a won deal can be invoiced.");

  const invoice = await db.invoice.create({
    data: { dealId: deal.id, amount: opts.amount, tax: opts.tax ?? 0n, issuedAt: now, dueAt: opts.dueAt ?? null, reference: opts.reference ?? null },
  });

  const pending = await db.commission.findMany({ where: { dealId: deal.id, state: "pending" }, select: { id: true } });
  for (const c of pending) {
    await db.commission.update({ where: { id: c.id }, data: { state: "accrued", accruedAt: now } });
    await writeAudit({
      actor: opts.actor, entity: "commission", entityId: c.id, action: "accrued",
      before: { state: "pending" }, after: { state: "accrued", invoiceId: invoice.id }, reason: "Invoice recorded",
    });
  }

  await writeAudit({
    actor: opts.actor, entity: "invoice", entityId: invoice.id, action: "created",
    after: { dealId: deal.id, amount: opts.amount }, reason: opts.reference,
  });
  return invoice;
}

/**
 * Collection recorded → a pro-rata slice of the commission becomes payable.
 *
 * Collect 40% of the invoice and exactly 40% of the commission turns payable.
 * A 40/40/20 schedule therefore pays in three slices that sum to the whole,
 * with no rounding drift: the final slice takes whatever remains.
 */
export async function recordCollection(opts: {
  actor: Actor; invoiceId: string; amount: bigint; method?: string; reference?: string; now?: Date;
}) {
  const now = opts.now ?? new Date();
  if (opts.amount <= 0n) throw new CommissionError("A collection must be for a positive amount.");

  const invoice = await db.invoice.findUnique({
    where: { id: opts.invoiceId },
    select: { id: true, dealId: true, amount: true, status: true },
  });
  if (!invoice) throw new CommissionError("Invoice not found.");
  if (invoice.status === "credited") throw new CommissionError("That invoice has been credited.");

  const already = await db.collection.findMany({ where: { invoiceId: invoice.id }, select: { amount: true } });
  const collectedBefore = already.reduce((a, c) => a + c.amount, 0n);
  if (collectedBefore + opts.amount > invoice.amount) {
    throw new CommissionError("That would collect more than the invoice is for.");
  }

  const collection = await db.collection.create({
    data: { invoiceId: invoice.id, amount: opts.amount, collectedAt: now, method: opts.method ?? null, reference: opts.reference ?? null },
  });

  // The accrued row holds what is still to be paid out on this deal.
  const accrued = await db.commission.findFirst({
    where: { dealId: invoice.dealId, state: "accrued" },
    orderBy: { createdAt: "asc" },
  });
  if (!accrued) {
    await writeAudit({
      actor: opts.actor, entity: "collection", entityId: collection.id, action: "created",
      after: { invoiceId: invoice.id, amount: opts.amount }, reason: "No accrued commission to release",
    });
    return { collection, released: null };
  }

  const fullyCollected = collectedBefore + opts.amount === invoice.amount;
  let released;

  if (fullyCollected) {
    // Last slice: whatever is left, so the parts always sum to the whole.
    released = await db.commission.update({
      where: { id: accrued.id },
      data: { state: "payable", payableAt: now, collectionId: collection.id },
    });
    await writeAudit({
      actor: opts.actor, entity: "commission", entityId: accrued.id, action: "payable",
      before: { state: "accrued", amount: accrued.amount },
      after: { state: "payable", amount: accrued.amount, collectionId: collection.id },
      reason: "Final collection recorded",
    });
  } else {
    // Partial: split off the collected share and leave the rest accrued.
    //
    // The share is taken against the deal's ORIGINAL entitlement, not against
    // what is left of the accrued row — otherwise each collection would release
    // a percentage of a shrinking remainder and a 40/40/20 deal would pay
    // 40%, 24%, 14% instead of 40%, 40%, 20%.
    const entitlement = await db.commission.findMany({
      where: { dealId: invoice.dealId, state: { in: ["pending", "accrued", "payable", "paid"] } },
      select: { amount: true, baseAmount: true },
    });
    const originalTotal = entitlement.reduce((a, c) => a + c.amount, 0n);
    const originalBase = entitlement.reduce((a, c) => a + c.baseAmount, 0n);

    let sliceAmount = proRata(originalTotal, opts.amount, invoice.amount);
    let sliceBase = proRata(originalBase, opts.amount, invoice.amount);
    // Never release more than is actually left.
    if (sliceAmount > accrued.amount) sliceAmount = accrued.amount;
    if (sliceBase > accrued.baseAmount) sliceBase = accrued.baseAmount;
    if (sliceAmount <= 0n) throw new CommissionError("That collection is too small to release any commission.");

    released = await db.commission.create({
      data: {
        dealId: accrued.dealId, partnerId: accrued.partnerId,
        baseAmount: sliceBase, rateBp: accrued.rateBp, amount: sliceAmount, currency: accrued.currency,
        state: "payable", accruedAt: accrued.accruedAt, payableAt: now, collectionId: collection.id,
      },
    });
    await db.commission.update({
      where: { id: accrued.id },
      data: { baseAmount: accrued.baseAmount - sliceBase, amount: accrued.amount - sliceAmount },
    });
    await writeAudit({
      actor: opts.actor, entity: "commission", entityId: released.id, action: "payable",
      after: { state: "payable", amount: sliceAmount, ofTotal: accrued.amount, collectionId: collection.id },
      reason: "Partial collection recorded — pro-rata slice released",
    });
    await writeAudit({
      actor: opts.actor, entity: "commission", entityId: accrued.id, action: "split",
      before: { amount: accrued.amount }, after: { amount: accrued.amount - sliceAmount },
      reason: "Slice released as payable",
    });
  }

  if (fullyCollected) await db.invoice.update({ where: { id: invoice.id }, data: { status: "paid" } });
  await writeAudit({
    actor: opts.actor, entity: "collection", entityId: collection.id, action: "created",
    after: { invoiceId: invoice.id, amount: opts.amount }, reason: opts.reference,
  });

  return { collection, released };
}

/** Finance marks a payable commission paid, with a reference. */
export async function markPaid(opts: { actor: Actor; commissionId: string; payoutRef: string; now?: Date }) {
  const now = opts.now ?? new Date();
  if (!opts.payoutRef.trim()) throw new CommissionError("A payout reference is required.");
  const c = await db.commission.findUnique({ where: { id: opts.commissionId }, select: { id: true, state: true, amount: true } });
  if (!c) throw new CommissionError("Commission not found.");
  if (c.state !== "payable") throw new CommissionError("Only a payable commission can be marked paid.");

  const updated = await db.commission.update({
    where: { id: c.id },
    data: { state: "paid", paidAt: now, payoutRef: opts.payoutRef.trim() },
  });
  await writeAudit({
    actor: opts.actor, entity: "commission", entityId: c.id, action: "paid",
    before: { state: "payable" }, after: { state: "paid", payoutRef: opts.payoutRef.trim() }, reason: "Payout recorded",
  });
  return updated;
}

/**
 * Adjust a commission. Refund, chargeback and misselling only.
 *
 * The reason code is checked against ADJUSTMENT_REASONS here, so there is no
 * way to record a Growth Plan lapse — or any other retention event — as an
 * adjustment. That is deliberate and load-bearing, not an oversight.
 */
export async function createAdjustment(opts: {
  actor: Actor; commissionId: string; reasonCode: string; reason: string; amount?: bigint; now?: Date;
}) {
  const now = opts.now ?? new Date();
  if (!ADJUSTMENT_REASONS.includes(opts.reasonCode as AdjustmentReason)) {
    throw new CommissionError(
      `A commission can only be adjusted for ${ADJUSTMENT_REASONS.join(", ")}. There is no retention clawback.`,
    );
  }
  if (opts.reason.trim().length < 10) throw new CommissionError("Give a reason of at least 10 characters.");

  const original = await db.commission.findUnique({ where: { id: opts.commissionId } });
  if (!original) throw new CommissionError("Commission not found.");
  if (original.state === "void") throw new CommissionError("That commission is void.");
  if (original.state === "adjusted") throw new CommissionError("That row is itself an adjustment.");

  const magnitude = opts.amount ?? original.amount;
  if (magnitude <= 0n) throw new CommissionError("An adjustment must be for a positive amount.");
  if (magnitude > original.amount) throw new CommissionError("An adjustment cannot exceed the commission it reverses.");

  // Recorded as a negative counter-row so the original stays intact and the
  // ledger still adds up.
  const adjustment = await db.commission.create({
    data: {
      dealId: original.dealId, partnerId: original.partnerId,
      baseAmount: -proRata(original.baseAmount, magnitude, original.amount),
      rateBp: original.rateBp, amount: -magnitude, currency: original.currency,
      state: "adjusted", adjustmentOfId: original.id,
      adjustmentReasonCode: opts.reasonCode, adjustmentReason: opts.reason.trim(),
    },
  });
  await writeAudit({
    actor: opts.actor, entity: "commission", entityId: adjustment.id, action: "adjusted",
    before: { adjustmentOf: original.id, originalAmount: original.amount },
    after: { amount: -magnitude, reasonCode: opts.reasonCode }, reason: opts.reason.trim(),
  });
  void now;
  return adjustment;
}

/** Deal cancelled before delivery, or invoice credited → void what is not yet paid. */
export async function voidCommissions(opts: { actor: Actor; dealId: string; reason: string }) {
  if (opts.reason.trim().length < 10) throw new CommissionError("Give a reason of at least 10 characters.");
  const rows = await db.commission.findMany({
    where: { dealId: opts.dealId, state: { in: ["pending", "accrued", "payable"] } },
    select: { id: true, state: true },
  });
  for (const r of rows) {
    await db.commission.update({ where: { id: r.id }, data: { state: "void" } });
    await writeAudit({
      actor: opts.actor, entity: "commission", entityId: r.id, action: "void",
      before: { state: r.state }, after: { state: "void" }, reason: opts.reason.trim(),
    });
  }
  return rows.length;
}
