import type { Prisma } from "@prisma/client";
import { db } from "@/lib/audit/db";
import type { Currency } from "./money";

export const COMMISSION_STATES = ["pending", "accrued", "payable", "paid", "adjusted", "void"] as const;
export type CommissionState = (typeof COMMISSION_STATES)[number];

export type LedgerFilters = {
  partnerId?: string;
  state?: string;
  market?: string;
  from?: string; // yyyy-mm-dd
  to?: string;
};

export function ledgerWhere(f: LedgerFilters): Prisma.CommissionWhereInput {
  const and: Prisma.CommissionWhereInput[] = [];
  if (f.partnerId) and.push({ partnerId: f.partnerId });
  if (f.state && (COMMISSION_STATES as readonly string[]).includes(f.state)) and.push({ state: f.state });
  if (f.market) and.push({ deal: { market: f.market } });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ createdAt: { lte: new Date(`${f.to}T23:59:59Z`) } });
  return and.length ? { AND: and } : {};
}

export function ledgerRows(f: LedgerFilters, take = 500) {
  return db.commission.findMany({
    where: ledgerWhere(f),
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, baseAmount: true, rateBp: true, amount: true, currency: true, state: true,
      accruedAt: true, payableAt: true, paidAt: true, payoutRef: true,
      adjustmentOfId: true, adjustmentReasonCode: true, adjustmentReason: true, createdAt: true,
      partner: { select: { id: true, legalName: true } },
      deal: {
        select: {
          id: true, market: true, stage: true, wonAt: true, onboardingFee: true,
          client: { select: { legalName: true } },
          invoices: { select: { id: true, amount: true, status: true, reference: true }, orderBy: { issuedAt: "asc" } },
        },
      },
    },
  });
}

export type SummaryRow = {
  partnerId: string;
  partnerName: string;
  currency: Currency;
  totals: Record<CommissionState, bigint>;
};

/**
 * Per-partner totals by state. Keyed by partner AND currency — a partner selling
 * in both markets gets one row per currency, because rupees and dollars are
 * never added together.
 */
export async function ledgerSummary(f: LedgerFilters): Promise<SummaryRow[]> {
  const rows = await db.commission.findMany({
    where: ledgerWhere(f),
    select: { amount: true, currency: true, state: true, partnerId: true, partner: { select: { legalName: true } } },
  });

  const by = new Map<string, SummaryRow>();
  for (const r of rows) {
    const key = `${r.partnerId}:${r.currency}`;
    let entry = by.get(key);
    if (!entry) {
      entry = {
        partnerId: r.partnerId,
        partnerName: r.partner.legalName,
        currency: r.currency as Currency,
        totals: Object.fromEntries(COMMISSION_STATES.map((s) => [s, 0n])) as Record<CommissionState, bigint>,
      };
      by.set(key, entry);
    }
    if ((COMMISSION_STATES as readonly string[]).includes(r.state)) {
      entry.totals[r.state as CommissionState] += r.amount;
    }
  }
  return [...by.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName) || a.currency.localeCompare(b.currency));
}

/** RFC-4180 style: quote everything, double any inner quotes. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Minor units → a plain decimal string, so spreadsheets get a real number. */
export function minorToDecimalString(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${cents}`;
}
