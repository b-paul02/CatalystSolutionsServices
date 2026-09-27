// AI credit accounting. Integer units, org-owned wallet, append-only ledger. These are NOT LeadOS lead
// tokens (LosTokenLedger) and nothing here touches them.
//
// Invariants — enforced transactionally, each mutation under a row lock on the wallet (FOR UPDATE):
//   I1  sum(ledger.delta) = sum(grant.remaining) + sum(active reservation.amount) − wallet.deficit
//   I2  available = sum(remaining of UNEXPIRED grants) ≥ 0 — a reservation is refused, never goes negative
//   I3  one reservation per operation (unique operationId): reserve / settle / release happen at most once
//   I4  settlement ≤ the reserved (quoted, accepted) maximum
//   I5  ledger rows are never updated or deleted; corrections are compensating entries
//   I6  expiry only ever removes `remaining` — credits held by an active reservation are out of its reach
//   I7  every ledger row carries tenant, reason and a source reference (grant / operation / order)
// ponytail: one lock per wallet serialises an org's AI spend. Fine for human-paced tools; shard by grant if a
// single tenant ever needs hundreds of reservations a second.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/audit/db";
import { WorkError } from "./work";

type Tx = Prisma.TransactionClient;
export const GRANT_KINDS = ["purchased", "included", "promotional", "adjustment"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export class CreditError extends WorkError {
  constructor(public code: "insufficient" | "member_cap" | "restricted" | "quote" | "unpriced" | "invalid" | "auth_cap", message: string, public detail: Record<string, number> = {}) { super(message); this.name = "CreditError"; }
}

const posInt = (n: unknown, what: string): number => { if (typeof n !== "number" || !Number.isInteger(n) || n <= 0 || n > 100_000_000) throw new CreditError("invalid", `${what} must be a whole number above zero.`); return n; };

/** Creates the wallet on first use and takes the row lock every mutation runs under. */
export async function lockWallet(tx: Tx, orgId: string): Promise<{ deficit: number; lowBalanceAt: number | null }> {
  await tx.$executeRaw`INSERT INTO "CosCreditWallet" ("orgId", "updatedAt") VALUES (${orgId}, now()) ON CONFLICT ("orgId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ deficit: number; lowBalanceAt: number | null }[]>`SELECT "deficit", "lowBalanceAt" FROM "CosCreditWallet" WHERE "orgId" = ${orgId} FOR UPDATE`;
  return rows[0];
}

// soonest-expiring first, never-expiring last; included/promotional before purchased at the same expiry
const KIND_ORDER: Record<string, number> = { promotional: 0, included: 1, adjustment: 2, purchased: 3 };
async function spendable(tx: Tx, orgId: string, now: Date) {
  const grants = await tx.cosCreditGrant.findMany({ where: { orgId, remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  return grants.sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.getTime() - b.createdAt.getTime());
}

/** Outstanding deficit (credits used, then clawed back) is paid from whatever is spendable. Ledger-neutral: I1 holds. */
async function payDownDeficit(tx: Tx, orgId: string, now: Date) {
  let { deficit } = await lockWallet(tx, orgId);
  if (deficit <= 0) return;
  for (const g of await spendable(tx, orgId, now)) {
    const pay = Math.min(deficit, g.remaining);
    await tx.cosCreditGrant.update({ where: { id: g.id }, data: { remaining: { decrement: pay } } });
    deficit -= pay;
    if (deficit === 0) break;
  }
  await tx.cosCreditWallet.update({ where: { orgId }, data: { deficit } });
}

export type GrantInput = { orgId: string; kind: GrantKind; amount: number; /** explicit: a date, or null for "does not expire" */ expiresAt: Date | null; sourceRef: string; reason: string; createdBy?: string | null; orderId?: string | null; demo?: boolean };

/** Idempotent on sourceRef: the same purchase / contract / admin action can never grant twice. */
export async function grantCredits(input: GrantInput, outer?: Tx, now = new Date()): Promise<{ grantId: string; duplicate: boolean }> {
  posInt(input.amount, "Credits");
  if (!(GRANT_KINDS as readonly string[]).includes(input.kind)) throw new CreditError("invalid", "Unknown grant kind.");
  if (!input.reason.trim()) throw new CreditError("invalid", "A reason is required.");
  if (input.expiresAt && input.expiresAt <= now) throw new CreditError("invalid", "The expiry date is in the past.");
  const work = async (tx: Tx) => {
    await lockWallet(tx, input.orgId);
    const existing = await tx.cosCreditGrant.findUnique({ where: { sourceRef: input.sourceRef } });
    if (existing) return { grantId: existing.id, duplicate: true };
    const g = await tx.cosCreditGrant.create({ data: { orgId: input.orgId, kind: input.kind, amount: input.amount, remaining: input.amount, expiresAt: input.expiresAt, sourceRef: input.sourceRef, reason: input.reason.trim().slice(0, 300), createdBy: input.createdBy ?? null, demo: input.demo ?? false } });
    await tx.cosCreditLedger.create({ data: { orgId: input.orgId, kind: "grant", delta: input.amount, reason: `${input.kind}: ${input.reason.trim().slice(0, 260)}`, grantId: g.id, orderId: input.orderId ?? null, actorId: input.createdBy ?? null } });
    await payDownDeficit(tx, input.orgId, now);
    return { grantId: g.id, duplicate: false };
  };
  return outer ? work(outer) : db.$transaction(work);
}

export type ReserveInput = { orgId: string; userId: string; operationId: string; amount: number; /** start of the member-cap period (calendar month, workspace zone) */ periodStart: Date; billingAuthId?: string | null; now?: Date };

/** Atomic: balance check + member cap + staff-billing ceiling + hold, all under the wallet lock. */
export async function reserve(tx: Tx, input: ReserveInput): Promise<{ reservationId: string; duplicate: boolean }> {
  const now = input.now ?? new Date();
  posInt(input.amount, "The reservation");
  const wallet = await lockWallet(tx, input.orgId);
  const existing = await tx.cosCreditReservation.findUnique({ where: { operationId: input.operationId } });
  if (existing) return { reservationId: existing.id, duplicate: true };
  if (wallet.deficit > 0) throw new CreditError("restricted", "AI tools are paused on this workspace while a refunded or disputed credit purchase is settled. Your content, reports and assets are unaffected.", { deficit: wallet.deficit });
  const grants = await spendable(tx, input.orgId, now);
  const available = grants.reduce((a, g) => a + g.remaining, 0);
  if (available < input.amount) throw new CreditError("insufficient", `This needs up to ${input.amount} credits and ${available} are available.`, { available, needed: input.amount });
  const cap = await tx.cosCreditMemberLimit.findUnique({ where: { orgId_userId: { orgId: input.orgId, userId: input.userId } } });
  if (cap) {
    const mine = await tx.cosCreditReservation.findMany({ where: { orgId: input.orgId, userId: input.userId, createdAt: { gte: input.periodStart }, status: { in: ["active", "settled"] } }, select: { status: true, amount: true, settledCredits: true } });
    const used = mine.reduce((a, r) => a + (r.status === "active" ? r.amount : r.settledCredits ?? 0), 0);
    if (used + input.amount > cap.monthlyCredits) throw new CreditError("member_cap", `Your monthly AI limit is ${cap.monthlyCredits} credits and ${used} are used or held. Ask a workspace admin to raise it.`, { cap: cap.monthlyCredits, used });
  }
  if (input.billingAuthId) {
    const auth = await tx.cosAiBillingAuth.findFirst({ where: { id: input.billingAuthId, orgId: input.orgId, revokedAt: null, expiresAt: { gt: now } } });
    if (!auth) throw new CreditError("auth_cap", "The client's authorisation to bill this to their credits has ended.");
    if (auth.usedCredits + input.amount > auth.maxCredits) throw new CreditError("auth_cap", `The client authorised ${auth.maxCredits} credits for staff-assisted work; ${auth.usedCredits} are used or held.`);
    await tx.cosAiBillingAuth.update({ where: { id: auth.id }, data: { usedCredits: { increment: input.amount } } });
  }
  let left = input.amount;
  const allocations: { grantId: string; amount: number }[] = [];
  for (const g of grants) {
    const take = Math.min(left, g.remaining);
    await tx.cosCreditGrant.update({ where: { id: g.id }, data: { remaining: { decrement: take } } });
    allocations.push({ grantId: g.id, amount: take });
    left -= take;
    if (left === 0) break;
  }
  const r = await tx.cosCreditReservation.create({ data: { orgId: input.orgId, operationId: input.operationId, userId: input.userId, amount: input.amount, allocations: JSON.stringify(allocations) } });
  return { reservationId: r.id, duplicate: false };
}

async function closeReservation(tx: Tx, operationId: string, credits: number, releaseReason: string | null, billingAuthId: string | null, reason: string, now: Date) {
  const found = await tx.cosCreditReservation.findUnique({ where: { operationId }, select: { orgId: true } });
  if (!found) return { charged: 0, already: true };
  await lockWallet(tx, found.orgId);
  const r = await tx.cosCreditReservation.findUniqueOrThrow({ where: { operationId } }); // re-read under the lock
  if (r.status !== "active") return { charged: r.settledCredits ?? 0, already: true };
  if (!Number.isInteger(credits) || credits < 0) throw new CreditError("invalid", "A charge must be a whole number of credits.");
  if (credits > r.amount) throw new CreditError("invalid", `Settlement of ${credits} credits is above the accepted maximum of ${r.amount} — refused.`);
  // the charge consumes the soonest-expiring allocations first; what is left goes back to its own grant
  let toCharge = credits;
  for (const a of JSON.parse(r.allocations) as { grantId: string; amount: number }[]) {
    const consumed = Math.min(toCharge, a.amount);
    toCharge -= consumed;
    if (a.amount - consumed > 0) await tx.cosCreditGrant.update({ where: { id: a.grantId }, data: { remaining: { increment: a.amount - consumed } } });
  }
  await tx.cosCreditReservation.update({ where: { id: r.id }, data: { status: releaseReason === null ? "settled" : "released", settledCredits: credits, releaseReason, closedAt: now } });
  if (credits > 0) await tx.cosCreditLedger.create({ data: { orgId: r.orgId, kind: "debit", delta: -credits, reason: reason.slice(0, 300), operationId, actorId: r.userId } });
  if (billingAuthId && r.amount - credits > 0) await tx.cosAiBillingAuth.update({ where: { id: billingAuthId }, data: { usedCredits: { decrement: r.amount - credits } } });
  await payDownDeficit(tx, r.orgId, now);
  return { charged: credits, already: false };
}

/** Charge ≤ the reserved maximum; the unused part returns to its grants. Second call is a no-op. */
export const settle = (tx: Tx, o: { operationId: string; credits: number; reason: string; billingAuthId?: string | null; now?: Date }) => closeReservation(tx, o.operationId, o.credits, null, o.billingAuthId ?? null, o.reason, o.now ?? new Date());
/** No charge; everything held goes back. Second call is a no-op. */
export const release = (tx: Tx, o: { operationId: string; reason: string; billingAuthId?: string | null; now?: Date }) => closeReservation(tx, o.operationId, 0, o.reason.slice(0, 300), o.billingAuthId ?? null, o.reason, o.now ?? new Date());

/** Expire what is left of lapsed grants. Held credits are untouched (I6); anything a reservation later returns to a lapsed grant goes on the next sweep. */
export async function expireGrants(now = new Date()): Promise<number> {
  const due = await db.cosCreditGrant.findMany({ where: { remaining: { gt: 0 }, expiresAt: { lte: now } }, select: { id: true, orgId: true } });
  let expired = 0;
  for (const d of due) {
    await db.$transaction(async (tx) => {
      await lockWallet(tx, d.orgId);
      const g = await tx.cosCreditGrant.findUniqueOrThrow({ where: { id: d.id } });
      if (g.remaining <= 0) return;
      await tx.cosCreditGrant.update({ where: { id: g.id }, data: { remaining: 0 } });
      await tx.cosCreditLedger.create({ data: { orgId: g.orgId, kind: "expire", delta: -g.remaining, reason: `${g.kind} credits expired ${g.expiresAt!.toISOString().slice(0, 10)}`, grantId: g.id } });
      expired += g.remaining;
    });
  }
  return expired;
}

/**
 * Claw back credits from one purchase (refund / dispute). Takes what is still unspent from THAT grant; the rest
 * was already used, so it becomes a recorded deficit — usage history stays, nothing is charged automatically.
 */
export async function reverseOrderCredits(tx: Tx, o: { orgId: string; orderId: string; credits: number; reason: string; now?: Date }) {
  posInt(o.credits, "The reversal");
  const wallet = await lockWallet(tx, o.orgId);
  const g = await tx.cosCreditGrant.findUnique({ where: { sourceRef: `order:${o.orderId}` } });
  const take = Math.min(g?.remaining ?? 0, o.credits);
  if (g && take > 0) await tx.cosCreditGrant.update({ where: { id: g.id }, data: { remaining: { decrement: take } } });
  await tx.cosCreditWallet.update({ where: { orgId: o.orgId }, data: { deficit: wallet.deficit + (o.credits - take) } });
  await tx.cosCreditLedger.create({ data: { orgId: o.orgId, kind: "reversal", delta: -o.credits, reason: o.reason.slice(0, 300), grantId: g?.id ?? null, orderId: o.orderId } });
  await payDownDeficit(tx, o.orgId, o.now ?? new Date());
  return { takenFromGrant: take, deficitAdded: o.credits - take };
}

/** Operator correction. Positive = an `adjustment` grant; negative = a compensating debit, never below zero. Reason is mandatory. */
export async function adjustCredits(o: { orgId: string; delta: number; reason: string; actorId: string | null; ref: string; expiresAt?: Date | null }, now = new Date()) {
  if (!o.reason.trim()) throw new CreditError("invalid", "A reason is required for every adjustment.");
  if (o.delta > 0) return grantCredits({ orgId: o.orgId, kind: "adjustment", amount: o.delta, expiresAt: o.expiresAt ?? null, sourceRef: `admin:${o.ref}`, reason: o.reason, createdBy: o.actorId }, undefined, now);
  const amount = posInt(-o.delta, "The adjustment");
  return db.$transaction(async (tx) => {
    await lockWallet(tx, o.orgId);
    if (await tx.cosCreditLedger.findFirst({ where: { orgId: o.orgId, kind: "adjustment", reason: { endsWith: `[${o.ref}]` } } })) return { duplicate: true };
    const grants = await spendable(tx, o.orgId, now);
    if (grants.reduce((a, g) => a + g.remaining, 0) < amount) throw new CreditError("insufficient", "That is more than the wallet's available credits — held credits cannot be removed.");
    let left = amount;
    for (const g of grants) { const take = Math.min(left, g.remaining); await tx.cosCreditGrant.update({ where: { id: g.id }, data: { remaining: { decrement: take } } }); left -= take; if (!left) break; }
    await tx.cosCreditLedger.create({ data: { orgId: o.orgId, kind: "adjustment", delta: -amount, reason: `${o.reason.trim().slice(0, 240)} [${o.ref}]`, actorId: o.actorId } });
    return { duplicate: false };
  });
}

export type WalletSummary = { available: number; reserved: number; deficit: number; restricted: boolean; lowBalanceAt: number | null; low: boolean; byKind: Record<GrantKind, number>; expiring: { kind: string; remaining: number; expiresAt: Date }[] };

export async function walletSummary(orgId: string, now = new Date()): Promise<WalletSummary> {
  const [w, grants, held] = await Promise.all([
    db.cosCreditWallet.findUnique({ where: { orgId } }),
    db.cosCreditGrant.findMany({ where: { orgId, remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { expiresAt: "asc" } }),
    db.cosCreditReservation.aggregate({ where: { orgId, status: "active" }, _sum: { amount: true } }),
  ]);
  const byKind = { purchased: 0, included: 0, promotional: 0, adjustment: 0 } as Record<GrantKind, number>;
  for (const g of grants) byKind[g.kind as GrantKind] = (byKind[g.kind as GrantKind] ?? 0) + g.remaining;
  const available = grants.reduce((a, g) => a + g.remaining, 0);
  return { available, reserved: held._sum.amount ?? 0, deficit: w?.deficit ?? 0, restricted: (w?.deficit ?? 0) > 0, lowBalanceAt: w?.lowBalanceAt ?? null, low: w?.lowBalanceAt != null && available <= w.lowBalanceAt, byKind, expiring: grants.filter((g) => g.expiresAt).map((g) => ({ kind: g.kind, remaining: g.remaining, expiresAt: g.expiresAt! })) };
}

/** I1, computed from rows. Used by tests and the operator reconciliation view. */
export async function walletInvariant(orgId: string) {
  const [ledger, grants, held, w] = await Promise.all([
    db.cosCreditLedger.aggregate({ where: { orgId }, _sum: { delta: true } }),
    db.cosCreditGrant.aggregate({ where: { orgId }, _sum: { remaining: true } }),
    db.cosCreditReservation.aggregate({ where: { orgId, status: "active" }, _sum: { amount: true } }),
    db.cosCreditWallet.findUnique({ where: { orgId } }),
  ]);
  const l = ledger._sum.delta ?? 0, r = grants._sum.remaining ?? 0, h = held._sum.amount ?? 0, d = w?.deficit ?? 0;
  return { ok: l === r + h - d && r >= 0 && h >= 0 && d >= 0, ledger: l, remaining: r, reserved: h, deficit: d };
}

/**
 * Credits INCLUDED in a signed scope. The number is typed by the operator on the proposal and shown to the client before
 * they sign (never the old tier placeholder `aiCredits`). Granted once per contract: sourceRef `contract:<id>` makes a
 * double click, a retry or a re-run harmless. Expiry is explicit: N days after signing, or none.
 */
export function includedCreditsOf(allowancesJson: string): { credits: number; expireDays: number | null } {
  try {
    const a = JSON.parse(allowancesJson) as { includedAiCredits?: unknown; includedAiCreditsExpireDays?: unknown };
    const credits = typeof a.includedAiCredits === "number" && Number.isInteger(a.includedAiCredits) && a.includedAiCredits > 0 ? a.includedAiCredits : 0;
    const days = typeof a.includedAiCreditsExpireDays === "number" && Number.isInteger(a.includedAiCreditsExpireDays) && a.includedAiCreditsExpireDays > 0 ? a.includedAiCreditsExpireDays : null;
    return { credits, expireDays: days };
  } catch { return { credits: 0, expireDays: null }; }
}
export async function grantIncludedForContract(contract: { id: string; orgId: string; allowances: string; demo: boolean }, signedById: string, tx?: Tx, now = new Date()) {
  const { credits, expireDays } = includedCreditsOf(contract.allowances);
  if (credits === 0) return null;
  return grantCredits({ orgId: contract.orgId, kind: "included", amount: credits, expiresAt: expireDays ? new Date(now.getTime() + expireDays * 86_400_000) : null, sourceRef: `contract:${contract.id}`, reason: "Included with your signed scope", createdBy: signedById, demo: contract.demo }, tx, now);
}

// ── rate cards ───────────────────────────────────────────────────────────────

export type Rate = { base: number; perKOutputTokens: number };
export type Rates = Record<string, Rate>;

export function parseRates(json: string): Rates {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new CreditError("invalid", "Rates must be valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CreditError("invalid", "Rates must be an object keyed by tool.");
  const out: Rates = {};
  for (const [k, v] of Object.entries(raw as Record<string, Partial<Rate>>)) {
    const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1_000_000;
    if (!ok(v?.base) || !ok(v?.perKOutputTokens) || v.base! + v.perKOutputTokens! === 0) throw new CreditError("invalid", `Rate for "${k}" needs whole-number "base" and "perKOutputTokens", not both zero.`);
    out[k] = { base: v.base!, perKOutputTokens: v.perKOutputTokens! };
  }
  return out;
}

/** The accepted MAXIMUM for a request: what gets reserved. */
export const priceMax = (rate: Rate, maxOutputTokens: number): number => rate.base + Math.ceil((maxOutputTokens / 1000) * rate.perKOutputTokens);
/** The actual charge, from what the provider reports (or an estimate when it reports nothing) — never above max. */
export const priceActual = (rate: Rate, outputTokens: number, max: number): number => Math.min(max, rate.base + Math.ceil((Math.max(0, outputTokens) / 1000) * rate.perKOutputTokens));

/** The one active card. A synthetic (dev/test) card is refused in production, so nothing sells at made-up prices. */
export async function activeRateCard() {
  const card = await db.cosCreditRateCard.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } });
  if (!card || (card.synthetic && process.env.NODE_ENV === "production")) return null;
  return { id: card.id, version: card.version, synthetic: card.synthetic, rates: parseRates(card.rates) };
}

export async function createRateCard(ratesJson: string, note: string, createdBy: string | null, synthetic = false) {
  parseRates(ratesJson);
  const last = await db.cosCreditRateCard.aggregate({ _max: { version: true } });
  return db.cosCreditRateCard.create({ data: { version: (last._max.version ?? 0) + 1, rates: ratesJson, note: note.slice(0, 300) || null, createdBy, synthetic } });
}

/**
 * Activation never edits a card: the old one is retired, quotes already issued keep the version they pinned.
 * A REAL card must also pass the profitability check (lib/os/pricing.ts): every tool's worst-case margin, against the
 * configured provider prices and the cheapest real pack, at or above AI_MIN_MARGIN_PCT. Unknown cost = not allowed.
 */
export async function activateRateCard(id: string) {
  const draft = await db.cosCreditRateCard.findUnique({ where: { id } });
  if (draft && !draft.synthetic) {
    const { creditValueMicros, marginReport, minMarginPct, profitabilityProblems, providerPrices } = await import("./pricing");
    const packs = await db.cosCreditPack.findMany({ where: { active: true, synthetic: false } });
    const problems = profitabilityProblems(marginReport(parseRates(draft.rates), providerPrices(), creditValueMicros(packs).micros), minMarginPct());
    if (problems.length) throw new CreditError("invalid", `Not activated — profitability check failed. ${problems.join(" ")}`);
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cos.ratecard'))`;
    const card = await tx.cosCreditRateCard.findUnique({ where: { id } });
    if (!card || card.status !== "draft") throw new CreditError("invalid", "Only a draft rate card can be activated.");
    if (card.synthetic && process.env.NODE_ENV === "production") throw new CreditError("invalid", "Synthetic rate cards cannot be activated in production.");
    await tx.cosCreditRateCard.updateMany({ where: { status: "active" }, data: { status: "retired" } });
    await tx.cosCreditRateCard.update({ where: { id }, data: { status: "active", activatedAt: new Date() } });
  });
}

/** Stable hash of a tool's inputs: key order never matters, any value change does. */
export function inputHash(toolKey: string, inputs: Record<string, string>): string {
  const canon = JSON.stringify(Object.keys(inputs).sort().map((k) => [k, inputs[k]]));
  return createHash("sha256").update(`${toolKey}\n${canon}`).digest("hex");
}
