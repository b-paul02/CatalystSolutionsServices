import { db } from "@/lib/audit/db";
import { CURRENCY_OF, type Currency, type Market } from "./money";

// Every query here names its columns. A partner-facing server component that
// touches a full row serialises that row into the RSC payload — see F4.

/** Money is never summed across currencies: IN and US stay separate lines. */
export type MoneyByCurrency = { currency: Currency; minor: bigint }[];

const OPEN_STAGES = ["registered", "qualified", "demo_given", "proposal_sent", "negotiation"];
const DAY = 24 * 60 * 60 * 1000;

function tally(rows: { currency: string; amount: bigint }[]): MoneyByCurrency {
  const by = new Map<Currency, bigint>();
  for (const r of rows) {
    const c = r.currency as Currency;
    by.set(c, (by.get(c) ?? 0n) + r.amount);
  }
  return [...by].map(([currency, minor]) => ({ currency, minor })).sort((a, b) => (b.minor > a.minor ? 1 : -1));
}

/**
 * ponytail: payouts run on the 1st of the month. Phase 2 replaces this with
 * real payout runs; until then the date is a stated convention, not a promise.
 */
export const PAYOUT_DAY_OF_MONTH = 1;

export function nextPayoutDate(from: Date = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), PAYOUT_DAY_OF_MONTH));
  if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export async function dashboardTiles(partnerId: string) {
  const [payable, accrued, openDeals] = await Promise.all([
    db.commission.findMany({ where: { partnerId, state: "payable" }, select: { amount: true, currency: true } }),
    db.commission.findMany({ where: { partnerId, state: "accrued" }, select: { amount: true, currency: true } }),
    db.deal.findMany({
      where: { partnerId, stage: { in: OPEN_STAGES } },
      select: { market: true, onboardingFee: true, estimatedValue: true },
    }),
  ]);

  // Pipeline uses the quoted fee once a package is attached, and the partner's
  // own estimate before that. Never a commission figure — this is deal value.
  const pipeline = tally(openDeals.map((d) => ({
    currency: CURRENCY_OF[d.market as Market],
    amount: d.onboardingFee ?? d.estimatedValue ?? 0n,
  })));

  return {
    payable: tally(payable),
    accrued: tally(accrued),
    pipeline,
    openDealCount: openDeals.length,
    nextPayout: nextPayoutDate(),
  };
}

export type ActionItem = {
  dealId: string;
  clientName: string;
  kind: "stale" | "protection_expiring";
  days: number;
};

/** Deals that need the partner to do something, soonest first. */
export async function actionList(partnerId: string, now: Date = new Date()): Promise<ActionItem[]> {
  const deals = await db.deal.findMany({
    where: {
      partnerId,
      stage: { in: OPEN_STAGES },
      OR: [
        { lastActivityAt: { lt: new Date(now.getTime() - 14 * DAY) } },
        { protectedUntil: { lt: new Date(now.getTime() + 14 * DAY) } },
      ],
    },
    select: {
      id: true, lastActivityAt: true, protectedUntil: true,
      client: { select: { legalName: true } },
    },
    take: 50,
  });

  const items: ActionItem[] = [];
  for (const d of deals) {
    const idleDays = Math.floor((now.getTime() - d.lastActivityAt.getTime()) / DAY);
    const protectionDays = Math.ceil((d.protectedUntil.getTime() - now.getTime()) / DAY);
    if (protectionDays < 14) {
      items.push({ dealId: d.id, clientName: d.client.legalName, kind: "protection_expiring", days: protectionDays });
    }
    if (idleDays >= 14) {
      items.push({ dealId: d.id, clientName: d.client.legalName, kind: "stale", days: idleDays });
    }
  }
  // Protection running out is more urgent than a quiet deal.
  return items.sort((a, b) =>
    a.kind === b.kind ? (a.kind === "stale" ? b.days - a.days : a.days - b.days) : a.kind === "protection_expiring" ? -1 : 1);
}

export async function recentActivity(partnerId: string, take = 8) {
  return db.activity.findMany({
    where: { partnerId },
    orderBy: { occurredAt: "desc" },
    take,
    select: { id: true, type: true, notes: true, occurredAt: true, deal: { select: { id: true, client: { select: { legalName: true } } } } },
  });
}
