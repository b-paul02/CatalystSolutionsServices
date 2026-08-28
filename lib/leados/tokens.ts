// Token economy: append-only ledger + effective-dated rate card.
// Tokens are the internal unit; INR/USD exist only at purchase time (Phase 8).
import { db } from "@/lib/audit/db";

// Fallback when no rate row exists yet (admin can override via rate card).
export const DEFAULT_RATE = { b2c: { exclusive: 30, shared: 10 }, b2b: { exclusive: 60, shared: 20 }, verifiedBonusPct: 50 };

export async function tokenBalance(orgId: string): Promise<number> {
  const agg = await db.losTokenLedger.aggregate({ where: { orgId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

export type RateSnapshot = {
  leadType: string;
  industry: string | null;
  exclusivity: string;
  verified: boolean;
  baseTokens: number;
  verifiedBonusPct: number;
  tokens: number;
  rateId: string | null;
};

/** Latest effective rate row for (leadType, industry), industry-null fallback. */
export async function currentRate(leadType: string, industry: string | null, at = new Date()) {
  const rows = await db.losTokenRate.findMany({
    where: {
      leadType,
      effectiveFrom: { lte: at },
      OR: [{ industry: industry ?? undefined }, { industry: null }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.find((r) => r.industry === industry) ?? rows.find((r) => r.industry === null) ?? null;
}

export async function computeTokenCost(opts: {
  leadType: "b2b" | "b2c";
  industry?: string | null;
  exclusivity: "exclusive" | "shared";
  verified: boolean;
  at?: Date;
}): Promise<RateSnapshot> {
  const rate = await currentRate(opts.leadType, opts.industry ?? null, opts.at);
  const base = rate
    ? opts.exclusivity === "exclusive" ? rate.exclusiveTokens : rate.sharedTokens
    : DEFAULT_RATE[opts.leadType][opts.exclusivity];
  const bonusPct = rate?.verifiedBonusPct ?? DEFAULT_RATE.verifiedBonusPct;
  const tokens = opts.verified ? Math.round(base * (1 + bonusPct / 100)) : base;
  return {
    leadType: opts.leadType,
    industry: opts.industry ?? null,
    exclusivity: opts.exclusivity,
    verified: opts.verified,
    baseTokens: base,
    verifiedBonusPct: bonusPct,
    tokens,
    rateId: rate?.id ?? null,
  };
}

export async function creditTokens(opts: {
  orgId: string;
  amount: number; // positive
  kind: "purchase" | "grant" | "adjustment" | "replacement_credit";
  refId?: string;
  note?: string;
  createdById?: string | null;
}): Promise<void> {
  if (opts.amount <= 0) throw new Error("Credit amount must be positive.");
  await db.losTokenLedger.create({
    data: { orgId: opts.orgId, delta: opts.amount, kind: opts.kind, refId: opts.refId ?? null, note: opts.note ?? null, createdById: opts.createdById ?? null },
  });
}

/** Debit inside the caller's transaction when atomicity matters. */
export function debitTokensTx(tx: Pick<typeof db, "losTokenLedger">, opts: {
  orgId: string;
  amount: number; // positive
  kind: "allocation_debit" | "reveal_debit" | "enrichment_debit" | "adjustment";
  refId?: string;
  note?: string;
}) {
  if (opts.amount <= 0) throw new Error("Debit amount must be positive.");
  return tx.losTokenLedger.create({
    data: { orgId: opts.orgId, delta: -opts.amount, kind: opts.kind, refId: opts.refId ?? null, note: opts.note ?? null },
  });
}
