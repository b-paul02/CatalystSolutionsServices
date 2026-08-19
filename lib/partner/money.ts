// All money in the partner portal is integer MINOR units (paise / cents).
// No float ever touches this path. IN and US are independent books — there is
// deliberately no conversion function here and there must never be one.

export type Market = "IN" | "US";
export type Currency = "INR" | "USD";

export const CURRENCY_OF: Record<Market, Currency> = { IN: "INR", US: "USD" };

/** Major units (rupees/dollars) → minor units. Used only at seed/import time. */
export function toMinor(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

/**
 * base × rateBp / 10000, rounded half-up. Integer arithmetic throughout.
 * rateBp is basis points: 3000 = 30%.
 */
export function commissionAmount(base: bigint, rateBp: number): bigint {
  if (!Number.isInteger(rateBp) || rateBp < 0) throw new Error("rateBp must be a non-negative integer.");
  if (base < 0n) throw new Error("base must be non-negative.");
  const scaled = base * BigInt(rateBp);
  // half-up: add half the divisor before dividing
  return (scaled + 5000n) / 10000n;
}

/**
 * Pro-rata slice: what share of `total` corresponds to collecting `collected`
 * out of `invoiced`. A 40/40/20 deal pays commission in three slices.
 */
export function proRata(total: bigint, collected: bigint, invoiced: bigint): bigint {
  if (invoiced <= 0n) throw new Error("invoiced must be positive.");
  if (collected < 0n) throw new Error("collected must be non-negative.");
  return (total * collected + invoiced / 2n) / invoiced;
}

const LOCALE: Record<Currency, string> = { INR: "en-IN", USD: "en-US" };

/** The only place minor units become a display string. */
export function formatMoney(minor: bigint, currency: Currency): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const major = Number(abs / 100n);
  const cents = Number(abs % 100n);
  const body = new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: cents === 0 ? 0 : 2,
    maximumFractionDigits: cents === 0 ? 0 : 2,
  }).format(major + cents / 100);
  return neg ? `-${body}` : body;
}

export function formatRate(rateBp: number): string {
  const pct = rateBp / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
