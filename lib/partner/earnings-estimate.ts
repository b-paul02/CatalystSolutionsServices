import { db } from "@/lib/audit/db";
import { commissionAmount, type Market } from "./money";

/**
 * The headline earnings estimate on /partners.
 *
 * Computed from the live price book so it can never drift from what partners
 * actually sell. Two deals a month is the top of the "1–2 a month" band in the
 * application form — a good partner, not an outlier.
 */

/** The advertised default only. A real partner's rate lives in CommissionRate. */
export const ADVERTISED_RATE_BP = 3000;

export const DEALS_PER_MONTH_LOW = 1;
export const DEALS_PER_MONTH_HIGH = 2;

export type MarketEstimate = {
  perDeal: bigint;      // commission on one mid-tier deal, minor units
  yearLow: bigint;      // one deal a month
  yearHigh: bigint;     // two deals a month
  medianFee: bigint;    // the mid-tier onboarding fee it is based on
  topPerDeal: bigint;   // commission on the largest package
};

function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2n;
}

async function forMarket(market: Market): Promise<MarketEstimate> {
  const rows = await db.priceBook.findMany({
    where: { market, OR: [{ activeTo: null }, { activeTo: { gt: new Date() } }] },
    select: { onboardingFee: true },
  });
  const fees = rows.map((r) => r.onboardingFee);
  const medianFee = median(fees);
  const perDeal = commissionAmount(medianFee, ADVERTISED_RATE_BP);
  const top = fees.reduce((a, b) => (b > a ? b : a), 0n);

  return {
    perDeal,
    yearLow: perDeal * BigInt(DEALS_PER_MONTH_LOW * 12),
    yearHigh: perDeal * BigInt(DEALS_PER_MONTH_HIGH * 12),
    medianFee,
    topPerDeal: commissionAmount(top, ADVERTISED_RATE_BP),
  };
}

export async function earningsEstimate(): Promise<Record<Market, MarketEstimate>> {
  const [IN, US] = await Promise.all([forMarket("IN"), forMarket("US")]);
  return { IN, US };
}

/** "₹8.1 lakh" — how Indian readers actually say these numbers. */
export function inrShort(minor: bigint): string {
  const rupees = Number(minor / 100n);
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(rupees % 10_000_000 === 0 ? 0 : 1)} crore`;
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(rupees % 100_000 === 0 ? 0 : 1)} lakh`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

/** "$41,400" — no abbreviation, US readers expect the full figure. */
export function usdShort(minor: bigint): string {
  return `$${Number(minor / 100n).toLocaleString("en-US")}`;
}
