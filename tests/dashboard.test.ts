import { describe, expect, it, vi, beforeEach } from "vitest";

type Commission = { partnerId: string; state: string; amount: bigint; currency: string };
type Deal = {
  id: string; partnerId: string; stage: string; market: string;
  onboardingFee: bigint | null; estimatedValue: bigint | null;
  lastActivityAt: Date; protectedUntil: Date; client: { legalName: string };
};

const commissions: Commission[] = [];
const deals: Deal[] = [];

vi.mock("@/lib/audit/db", () => ({
  db: {
    commission: {
      findMany: async ({ where }: { where: { partnerId: string; state: string } }) =>
        commissions.filter((c) => c.partnerId === where.partnerId && c.state === where.state),
    },
    deal: {
      findMany: async ({ where }: {
        where: { partnerId: string; stage: { in: string[] }; OR?: { lastActivityAt?: { lt: Date }; protectedUntil?: { lt: Date } }[] };
      }) => deals.filter((d) => {
        if (d.partnerId !== where.partnerId || !where.stage.in.includes(d.stage)) return false;
        if (!where.OR) return true;
        return where.OR.some((c) =>
          (c.lastActivityAt ? d.lastActivityAt < c.lastActivityAt.lt : false) ||
          (c.protectedUntil ? d.protectedUntil < c.protectedUntil.lt : false));
      }),
    },
    activity: { findMany: async () => [] },
  },
}));

const { dashboardTiles, actionList, nextPayoutDate } = await import("@/lib/partner/dashboard");

const P = "p1";
const NOW = new Date("2026-08-19T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: `d${deals.length + 1}`, partnerId: P, stage: "qualified", market: "IN",
    onboardingFee: null, estimatedValue: null,
    lastActivityAt: NOW, protectedUntil: days(90), client: { legalName: "Client Co" }, ...over,
  };
}

beforeEach(() => { commissions.length = 0; deals.length = 0; });

describe("tiles", () => {
  it("sums payable and accrued separately", async () => {
    commissions.push(
      { partnerId: P, state: "payable", amount: 1_200_000n, currency: "INR" },
      { partnerId: P, state: "payable", amount: 300_000n, currency: "INR" },
      { partnerId: P, state: "accrued", amount: 900_000n, currency: "INR" },
      { partnerId: P, state: "paid", amount: 5_000_000n, currency: "INR" },
    );
    const t = await dashboardTiles(P);
    expect(t.payable).toEqual([{ currency: "INR", minor: 1_500_000n }]);
    expect(t.accrued).toEqual([{ currency: "INR", minor: 900_000n }]);
  });

  it("NEVER adds rupees to dollars — one line per currency", async () => {
    commissions.push(
      { partnerId: P, state: "payable", amount: 2_550_000n, currency: "INR" },
      { partnerId: P, state: "payable", amount: 135_000n, currency: "USD" },
    );
    const t = await dashboardTiles(P);
    expect(t.payable).toHaveLength(2);
    expect(t.payable.find((m) => m.currency === "INR")!.minor).toBe(2_550_000n);
    expect(t.payable.find((m) => m.currency === "USD")!.minor).toBe(135_000n);
  });

  it("keeps pipeline in each deal's own market currency", async () => {
    deals.push(
      deal({ market: "IN", onboardingFee: 8_500_000n }),
      deal({ market: "US", onboardingFee: 450_000n }),
    );
    const t = await dashboardTiles(P);
    expect(t.pipeline).toEqual(expect.arrayContaining([
      { currency: "INR", minor: 8_500_000n },
      { currency: "USD", minor: 450_000n },
    ]));
    expect(t.openDealCount).toBe(2);
  });

  it("uses the quoted fee when present, the estimate before that", async () => {
    deals.push(
      deal({ onboardingFee: 8_500_000n, estimatedValue: 9_999_999n }),
      deal({ onboardingFee: null, estimatedValue: 2_000_000n }),
      deal({ onboardingFee: null, estimatedValue: null }),
    );
    const t = await dashboardTiles(P);
    expect(t.pipeline).toEqual([{ currency: "INR", minor: 10_500_000n }]);
  });

  it("counts only open deals in the pipeline", async () => {
    deals.push(
      deal({ stage: "won", onboardingFee: 8_500_000n }),
      deal({ stage: "lost", onboardingFee: 8_500_000n }),
      deal({ stage: "lapsed", onboardingFee: 8_500_000n }),
      deal({ stage: "negotiation", onboardingFee: 1_000_000n }),
    );
    const t = await dashboardTiles(P);
    expect(t.pipeline).toEqual([{ currency: "INR", minor: 1_000_000n }]);
    expect(t.openDealCount).toBe(1);
  });

  it("shows nothing rather than zero when a partner has no deals", async () => {
    const t = await dashboardTiles(P);
    expect(t.payable).toEqual([]);
    expect(t.pipeline).toEqual([]);
    expect(t.openDealCount).toBe(0);
  });

  it("never mixes one partner's money into another's", async () => {
    commissions.push(
      { partnerId: P, state: "payable", amount: 100n, currency: "INR" },
      { partnerId: "p2", state: "payable", amount: 999_999n, currency: "INR" },
    );
    deals.push(deal({ partnerId: "p2", onboardingFee: 999_999n }));
    const t = await dashboardTiles(P);
    expect(t.payable).toEqual([{ currency: "INR", minor: 100n }]);
    expect(t.pipeline).toEqual([]);
  });
});

describe("next payout date", () => {
  it("is the first of the coming month", () => {
    expect(nextPayoutDate(new Date("2026-08-19T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(nextPayoutDate(new Date("2026-08-31T23:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(nextPayoutDate(new Date("2026-12-15T00:00:00Z")).toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("rolls forward when today is itself a payout day", () => {
    expect(nextPayoutDate(new Date("2026-09-01T09:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-01");
  });
});

describe("action list", () => {
  it("flags a deal with no activity for 14 days", async () => {
    deals.push(deal({ lastActivityAt: days(-20) }));
    const items = await actionList(P, NOW);
    expect(items).toEqual([expect.objectContaining({ kind: "stale", days: 20, clientName: "Client Co" })]);
  });

  it("leaves a deal alone at 13 days idle", async () => {
    deals.push(deal({ lastActivityAt: days(-13) }));
    expect(await actionList(P, NOW)).toEqual([]);
  });

  it("flags protection expiring within 14 days", async () => {
    deals.push(deal({ protectedUntil: days(5) }));
    const items = await actionList(P, NOW);
    expect(items).toEqual([expect.objectContaining({ kind: "protection_expiring", days: 5 })]);
  });

  it("reports already-expired protection as negative days", async () => {
    deals.push(deal({ protectedUntil: days(-3) }));
    const items = await actionList(P, NOW);
    expect(items[0].kind).toBe("protection_expiring");
    expect(items[0].days).toBeLessThan(0);
  });

  it("raises both reasons for one deal that has both problems", async () => {
    deals.push(deal({ lastActivityAt: days(-30), protectedUntil: days(2) }));
    const items = await actionList(P, NOW);
    expect(items.map((i) => i.kind)).toEqual(["protection_expiring", "stale"]);
  });

  it("puts expiring protection above quiet deals", async () => {
    deals.push(deal({ id: "quiet", lastActivityAt: days(-40) }), deal({ id: "expiring", protectedUntil: days(3) }));
    const items = await actionList(P, NOW);
    expect(items[0].kind).toBe("protection_expiring");
  });

  it("ignores closed deals entirely", async () => {
    deals.push(
      deal({ stage: "won", lastActivityAt: days(-90), protectedUntil: days(-30) }),
      deal({ stage: "lost", lastActivityAt: days(-90) }),
    );
    expect(await actionList(P, NOW)).toEqual([]);
  });

  it("never surfaces another partner's deal", async () => {
    deals.push(deal({ partnerId: "p2", lastActivityAt: days(-40) }));
    expect(await actionList(P, NOW)).toEqual([]);
  });
});
