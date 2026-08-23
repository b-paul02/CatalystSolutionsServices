import { describe, expect, it, vi, beforeEach } from "vitest";
import { commissionAmount } from "@/lib/partner/money";

// Custom pricing: staff replace the price-book fee for one deal. The partner
// still types nothing, the win path is untouched, and a won deal is immutable.

type Deal = {
  id: string; partnerId: string; stage: string; market: string;
  priceBookId: string | null; onboardingFee: bigint | null;
  customPriceRequested: bigint | null; customPriceRequestNote: string | null;
};
const deals: Deal[] = [];
const audits: { action: string; reason: string | null }[] = [];
const activities: { type: string; notes: string | null }[] = [];

vi.mock("@/lib/audit/db", () => ({
  db: {
    deal: {
      findUnique: async ({ where }: { where: { id: string } }) => deals.find((d) => d.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Deal> }) => {
        Object.assign(deals.find((d) => d.id === where.id)!, data);
        return {};
      },
    },
    auditLog: { create: async ({ data }: { data: { action: string; reason: string | null } }) => { audits.push(data); return {}; } },
    activity: { create: async ({ data }: { data: { type: string; notes: string | null } }) => { activities.push(data); return {}; } },
  },
}));

const { setCustomPrice, isCustomPriced, requestCustomPrice, resolveCustomPriceRequest } = await import("@/lib/partner/deals");

const staff = { userId: "u9", email: "desk@x.com", role: "deal_desk" as const, partnerId: null };

beforeEach(() => {
  deals.length = 0; audits.length = 0; activities.length = 0;
  deals.push({ id: "d1", partnerId: "alice", stage: "negotiation", market: "IN", priceBookId: "pb1", onboardingFee: 8_500_000n,
    customPriceRequested: null, customPriceRequestNote: null });
});

describe("setCustomPrice", () => {
  it("replaces the price-book fee and clears the package link", async () => {
    await setCustomPrice({ actor: staff, dealId: "d1", amount: 25_000_000n, reason: "Negotiated for a three-site rollout." });
    expect(deals[0].onboardingFee).toBe(25_000_000n);
    expect(deals[0].priceBookId).toBeNull();
    expect(isCustomPriced(deals[0])).toBe(true);
  });

  it("writes an audit row carrying the reason", async () => {
    await setCustomPrice({ actor: staff, dealId: "d1", amount: 25_000_000n, reason: "Negotiated for a three-site rollout." });
    expect(audits).toEqual([expect.objectContaining({ action: "custom_price_set", reason: "Negotiated for a three-site rollout." })]);
  });

  it("commission is computed on the custom base at the locked rate", async () => {
    await setCustomPrice({ actor: staff, dealId: "d1", amount: 25_000_000n, reason: "Negotiated for a three-site rollout." });
    // winDeal reads deal.onboardingFee — same field, so the custom base flows
    // through the whole lifecycle with zero changes to the money path.
    expect(commissionAmount(deals[0].onboardingFee!, 3000)).toBe(7_500_000n); // ₹75,000 on ₹2,50,000
  });

  it("refuses a won deal — the commission base is frozen at the win", async () => {
    deals[0].stage = "won";
    await expect(setCustomPrice({ actor: staff, dealId: "d1", amount: 1n, reason: "Trying to change it after." }))
      .rejects.toThrow("closed");
    expect(deals[0].onboardingFee).toBe(8_500_000n);
  });

  it("refuses zero, negative and short-reason input", async () => {
    await expect(setCustomPrice({ actor: staff, dealId: "d1", amount: 0n, reason: "A long enough reason." })).rejects.toThrow("positive");
    await expect(setCustomPrice({ actor: staff, dealId: "d1", amount: -5n, reason: "A long enough reason." })).rejects.toThrow("positive");
    await expect(setCustomPrice({ actor: staff, dealId: "d1", amount: 100n, reason: "short" })).rejects.toThrow("10 characters");
    expect(audits).toHaveLength(0);
  });

  it("a price-book deal is not custom; a custom deal is", () => {
    expect(isCustomPriced({ priceBookId: "pb1", onboardingFee: 8_500_000n })).toBe(false);
    expect(isCustomPriced({ priceBookId: null, onboardingFee: 8_500_000n })).toBe(true);
    expect(isCustomPriced({ priceBookId: null, onboardingFee: null })).toBe(false);
  });
});

const alice = { userId: "u1", email: "alice@x.com", role: "partner" as const, partnerId: "alice" };

describe("partner requests, staff resolve", () => {
  const ask = () => requestCustomPrice({ actor: alice, dealId: "d1", amount: 25_000_000n, note: "Three-site rollout, needs a bundled price." });

  it("recording a request changes nothing about the money", async () => {
    await ask();
    expect(deals[0].customPriceRequested).toBe(25_000_000n);
    // Fee, price-book link and commission base are untouched by the ask.
    expect(deals[0].onboardingFee).toBe(8_500_000n);
    expect(deals[0].priceBookId).toBe("pb1");
    expect(isCustomPriced(deals[0])).toBe(false);
    expect(activities[0]).toMatchObject({ type: "custom_price_requested" });
  });

  it("another partner's deal is indistinguishable from no deal", async () => {
    const bob = { ...alice, partnerId: "bob", userId: "u2" };
    await expect(requestCustomPrice({ actor: bob, dealId: "d1", amount: 1_000n, note: "Trying someone else's deal." }))
      .rejects.toThrow("Deal not found.");
    expect(deals[0].customPriceRequested).toBeNull();
  });

  it("refuses closed deals, junk amounts and short notes", async () => {
    await expect(requestCustomPrice({ actor: alice, dealId: "d1", amount: 0n, note: "A long enough note." })).rejects.toThrow("positive");
    await expect(requestCustomPrice({ actor: alice, dealId: "d1", amount: 100n, note: "short" })).rejects.toThrow("10 characters");
    deals[0].stage = "won";
    await expect(ask()).rejects.toThrow("closed");
  });

  it("approval reads the amount from the database and routes through setCustomPrice", async () => {
    await ask();
    const staff = { userId: "u9", email: "desk@x.com", role: "deal_desk" as const, partnerId: null };
    const out = await resolveCustomPriceRequest({ actor: staff, dealId: "d1", approve: true });

    expect(out.approved).toBe(true);
    expect(deals[0].onboardingFee).toBe(25_000_000n);
    expect(isCustomPriced(deals[0])).toBe(true);
    expect(deals[0].customPriceRequested).toBeNull(); // request cleared
    // The partner sees the outcome in the deal's activity feed.
    expect(activities.map((a) => a.type)).toEqual(["custom_price_requested", "custom_price_approved"]);
    expect(audits.map((a) => a.action)).toContain("custom_price_set");
  });

  it("decline clears the request, tells the partner why, and moves no money", async () => {
    await ask();
    const staff = { userId: "u9", email: "desk@x.com", role: "admin" as const, partnerId: null };
    await resolveCustomPriceRequest({ actor: staff, dealId: "d1", approve: false, reason: "Scope fits Tier 3 as published." });

    expect(deals[0].customPriceRequested).toBeNull();
    expect(deals[0].onboardingFee).toBe(8_500_000n);
    expect(isCustomPriced(deals[0])).toBe(false);
    const declined = activities.find((a) => a.type === "custom_price_declined");
    expect(declined?.notes).toContain("Scope fits Tier 3 as published.");
  });

  it("decline without a reason is refused — the partner deserves one", async () => {
    await ask();
    const staff = { userId: "u9", email: "desk@x.com", role: "admin" as const, partnerId: null };
    await expect(resolveCustomPriceRequest({ actor: staff, dealId: "d1", approve: false })).rejects.toThrow("reason");
    await expect(resolveCustomPriceRequest({ actor: staff, dealId: "d1", approve: false, reason: "no" })).rejects.toThrow("10 characters");
    expect(deals[0].customPriceRequested).toBe(25_000_000n); // still pending
  });

  it("resolving with nothing pending is an error, not a no-op", async () => {
    const staff = { userId: "u9", email: "desk@x.com", role: "admin" as const, partnerId: null };
    await expect(resolveCustomPriceRequest({ actor: staff, dealId: "d1", approve: true })).rejects.toThrow("no pending");
  });

  it("cannot ask on a deal that already has custom pricing", async () => {
    deals[0].priceBookId = null; // custom-priced marker
    await expect(ask()).rejects.toThrow("already has custom pricing");
  });
});
