import { describe, expect, it, vi, beforeEach } from "vitest";
import { commissionAmount } from "@/lib/partner/money";

// F7's two guarantees:
//  1. a partner cannot put a price on a deal that is not in the price book
//  2. the Growth Plan can never enter the commissionable base

type Deal = { id: string; partnerId: string; market: string; stage: string; priceBookId: string | null; onboardingFee: bigint | null; family?: string | null; estimatedTier?: string | null };
type Pkg = { id: string; market: string; onboardingFee: bigint; growthPlanMonthly: bigint | null; program: string; tier: string; family: string; activeTo: Date | null };

const deals: Deal[] = [];
const packages: Pkg[] = [];
const jar = { value: undefined as string | undefined };
const users = new Map<string, { id: string; email: string; role: string; disabledAt: Date | null; partner: { id: string } | null }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "partner_session" && jar.value ? { value: jar.value } : undefined) }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/audit/db", () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.get(where.id ?? "") ?? [...users.values()].find((u) => u.email === where.email) ?? null,
      upsert: async () => null,
    },
    deal: {
      findUnique: async ({ where }: { where: { id: string } }) => deals.find((d) => d.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Deal> }) => {
        Object.assign(deals.find((d) => d.id === where.id)!, data);
        return {};
      },
    },
    priceBook: {
      findUnique: async ({ where }: { where: { id: string } }) => packages.find((p) => p.id === where.id) ?? null,
    },
    auditLog: { create: async () => ({}) },
  },
}));

const { createPartnerSession, ForbiddenError } = await import("@/lib/partner/auth");
const { selectPackage } = await import("@/app/partner/deals/[id]/quote/actions");

const IN_T1: Pkg = { id: "pb-in-1", market: "IN", onboardingFee: 8_500_000n, growthPlanMonthly: 999_900n, program: "Patient Pipeline", tier: "Tier 1", family: "patient-pipeline-bundle", activeTo: null };
const IN_T2: Pkg = { id: "pb-in-2", market: "IN", onboardingFee: 17_500_000n, growthPlanMonthly: 2_499_900n, program: "Patient Pipeline", tier: "Tier 2", family: "patient-pipeline-bundle", activeTo: null };
const US_T1: Pkg = { id: "pb-us-1", market: "US", onboardingFee: 450_000n, growthPlanMonthly: 69_900n, program: "Patient Pipeline", tier: "Tier 1", family: "patient-pipeline-bundle", activeTo: null };

function signIn(partnerId: string) {
  users.set("u1", { id: "u1", email: "p@x.com", role: "partner", disabledAt: null, partner: { id: partnerId } });
  jar.value = createPartnerSession("u1");
}

beforeEach(() => {
  deals.length = 0; packages.length = 0; users.clear(); jar.value = undefined;
  packages.push(IN_T1, IN_T2, US_T1);
  deals.push({ id: "d1", partnerId: "alice", market: "IN", stage: "qualified", priceBookId: null, onboardingFee: null });
  signIn("alice");
});

describe("only price book prices can reach a deal", () => {
  it("writes the fee from the price book row", async () => {
    await selectPackage("d1", IN_T1.id);
    expect(deals[0].onboardingFee).toBe(8_500_000n);
    expect(deals[0].priceBookId).toBe(IN_T1.id);
  });

  it("ignores any fee the caller might try to supply — the signature has no such field", async () => {
    // The action takes (dealId, priceBookId). There is nowhere to put a price.
    expect(selectPackage.length).toBe(2);
    await selectPackage("d1", IN_T2.id);
    expect(deals[0].onboardingFee).toBe(IN_T2.onboardingFee);
  });

  it("refuses a price book id that does not exist", async () => {
    await expect(selectPackage("d1", "made-up-id")).rejects.toThrow("not in the price book");
    expect(deals[0].onboardingFee).toBeNull();
  });

  it("refuses a package from the other market — the books never mix", async () => {
    await expect(selectPackage("d1", US_T1.id)).rejects.toThrow("not available in this deal's market");
    expect(deals[0].onboardingFee).toBeNull();
    expect(deals[0].priceBookId).toBeNull();
  });

  it("refuses a retired package", async () => {
    packages.push({ ...IN_T1, id: "pb-old", activeTo: new Date("2020-01-01") });
    await expect(selectPackage("d1", "pb-old")).rejects.toThrow("no longer available");
  });

  it("refuses another partner's deal without saying it exists", async () => {
    signIn("bob");
    await expect(selectPackage("d1", IN_T1.id)).rejects.toThrow("Deal not found.");
    expect(deals[0].onboardingFee).toBeNull();
  });

  it("refuses a closed deal", async () => {
    deals[0].stage = "won";
    await expect(selectPackage("d1", IN_T1.id)).rejects.toThrow("closed");
  });

  it("refuses an anonymous caller", async () => {
    jar.value = undefined;
    await expect(selectPackage("d1", IN_T1.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deals[0].onboardingFee).toBeNull();
  });

  it("lets a partner switch package, and the fee follows the new row", async () => {
    await selectPackage("d1", IN_T1.id);
    await selectPackage("d1", IN_T2.id);
    expect(deals[0].onboardingFee).toBe(17_500_000n);
  });
});

describe("the Growth Plan never enters the commissionable base", () => {
  it("does not write the monthly figure onto the deal at all", async () => {
    await selectPackage("d1", IN_T1.id);
    const written = JSON.stringify(deals[0], (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(written).not.toContain(IN_T1.growthPlanMonthly!.toString());
    expect(Object.keys(deals[0])).not.toContain("growthPlanMonthly");
  });

  it("commission is the onboarding fee times the rate, with no monthly component", async () => {
    await selectPackage("d1", IN_T1.id);
    const base = deals[0].onboardingFee!;
    expect(base).toBe(IN_T1.onboardingFee);
    expect(commissionAmount(base, 3000)).toBe(2_550_000n);

    // What it would have been had the monthly leaked into the base:
    const contaminated = commissionAmount(base + IN_T1.growthPlanMonthly!, 3000);
    expect(commissionAmount(base, 3000)).not.toBe(contaminated);
  });

  it("holds for every seeded package shape, including one with no Growth Plan", async () => {
    packages.push({ ...IN_T1, id: "pb-nogrowth", growthPlanMonthly: null });
    await selectPackage("d1", "pb-nogrowth");
    expect(deals[0].onboardingFee).toBe(IN_T1.onboardingFee);
    expect(commissionAmount(deals[0].onboardingFee!, 3000)).toBe(2_550_000n);
  });
});
