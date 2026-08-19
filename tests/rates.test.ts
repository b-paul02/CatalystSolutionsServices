import { describe, expect, it, vi, beforeEach } from "vitest";

// An in-memory stand-in for the commission_rate table that FAILS LOUDLY if
// anything tries to update or delete a row — the append-only rule is the point.
type Row = {
  id: string; partnerId: string; rateBp: number; effectiveFrom: Date; reason: string;
  setByUserId: string; approvedAt: Date | null; approvedByUserId: string | null; createdAt: Date;
};
const rows: Row[] = [];
let seq = 0;

const sorted = (partnerId: string) =>
  rows.filter((r) => r.partnerId === partnerId)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.createdAt.getTime() - a.createdAt.getTime());

vi.mock("@/lib/audit/db", () => ({
  db: {
    commissionRate: {
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        const row = { ...data, id: `r${++seq}`, createdAt: new Date(Date.now() + seq) };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where, select }: {
        where: { partnerId: string; approvedAt?: unknown; effectiveFrom?: { lte: Date } };
        select?: Record<string, boolean>;
      }) => {
        let list = sorted(where.partnerId);
        if (where.approvedAt) list = list.filter((r) => r.approvedAt !== null);
        if (where.effectiveFrom?.lte) list = list.filter((r) => r.effectiveFrom <= where.effectiveFrom!.lte);
        const row = list[0] ?? null;
        // Honour `select` so a query that narrows its columns really does get
        // only those columns — this is what keeps internal fields off partner pages.
        if (!row || !select) return row;
        return Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof Row]]));
      },
      findMany: async ({ where }: { where: { partnerId: string; approvedAt?: null } }) => {
        const list = sorted(where.partnerId);
        return where.approvedAt === null ? list.filter((r) => r.approvedAt === null) : list;
      },
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      // approveRate is the ONLY permitted update, and only of the approval columns.
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        const touched = Object.keys(data);
        if (touched.some((k) => !["approvedAt", "approvedByUserId"].includes(k))) {
          throw new Error(`commission_rate is append-only; attempted to update ${touched.join(", ")}`);
        }
        Object.assign(row, data);
        return row;
      },
      delete: async () => { throw new Error("commission_rate rows must never be deleted"); },
      deleteMany: async () => { throw new Error("commission_rate rows must never be deleted"); },
    },
    auditLog: { create: async () => ({}) },
  },
}));

const {
  setRate, approveRate, currentRate, currentRateBpForPartner, rateHistory,
  pendingRates, validateRate, lockedRateBpForWin, RateError,
} = await import("@/lib/partner/rates");

const admin = { userId: "admin1", email: "a@x.com", role: "admin" as const, partnerId: null };
const admin2 = { userId: "admin2", email: "b@x.com", role: "admin" as const, partnerId: null };
const P = "partner1";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const REASON = "A reason long enough to pass validation.";

beforeEach(() => { rows.length = 0; seq = 0; });

describe("validation", () => {
  it("rejects a rate above 50%", () => {
    expect(() => validateRate(6000, REASON)).toThrow(RateError);
    expect(() => validateRate(5001, REASON)).toThrow(RateError);
  });

  it("accepts the boundaries", () => {
    expect(() => validateRate(5000, REASON)).not.toThrow();
    expect(() => validateRate(0, REASON)).not.toThrow();
  });

  it("rejects a negative or fractional basis-point value", () => {
    expect(() => validateRate(-1, REASON)).toThrow(RateError);
    expect(() => validateRate(30.5, REASON)).toThrow(RateError);
  });

  it("requires a reason of at least 10 characters", () => {
    expect(() => validateRate(3000, "too short")).toThrow(RateError);
    expect(() => validateRate(3000, "   ")).toThrow(RateError);
  });
});

describe("effective dates", () => {
  it("uses the latest rate whose effective date has arrived", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-09-01"), reason: REASON, actor: admin });

    expect((await currentRate(P, day("2026-08-19")))!.rateBp).toBe(3000);
    expect((await currentRate(P, day("2026-08-31")))!.rateBp).toBe(3000);
    expect((await currentRate(P, day("2026-09-01")))!.rateBp).toBe(2500);
    expect((await currentRate(P, day("2026-10-05")))!.rateBp).toBe(2500);
  });

  it("returns null before any rate is in force rather than assuming one", async () => {
    expect(await currentRate(P, day("2026-01-01"))).toBeNull();
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect(await currentRate(P, day("2026-07-31"))).toBeNull();
  });

  it("refuses to backdate past the most recent rate row", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await expect(setRate({ partnerId: P, rateBp: 2000, effectiveFrom: day("2026-07-15"), reason: REASON, actor: admin }))
      .rejects.toThrow(RateError);
    expect(rows).toHaveLength(1);
  });

  it("allows a new rate on the same day as the last one", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: P, rateBp: 2800, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect((await currentRate(P, day("2026-08-01")))!.rateBp).toBe(2800);
  });
});

describe("rates above 30% need a second admin", () => {
  it("stores a 35% rate as pending and keeps it out of force", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    const { needsSecondAdmin, row } = await setRate({
      partnerId: P, rateBp: 3500, effectiveFrom: day("2026-08-10"), reason: REASON, actor: admin,
    });

    expect(needsSecondAdmin).toBe(true);
    expect(row.approvedAt).toBeNull();
    // The old rate still governs.
    expect((await currentRate(P, day("2026-08-19")))!.rateBp).toBe(3000);
    expect(await pendingRates(P)).toHaveLength(1);
  });

  it("takes effect once a different admin approves it", async () => {
    const { row } = await setRate({ partnerId: P, rateBp: 3500, effectiveFrom: day("2026-08-10"), reason: REASON, actor: admin });
    await approveRate(row.id, admin2);
    expect((await currentRate(P, day("2026-08-19")))!.rateBp).toBe(3500);
  });

  it("refuses to let the setting admin approve their own change", async () => {
    const { row } = await setRate({ partnerId: P, rateBp: 3500, effectiveFrom: day("2026-08-10"), reason: REASON, actor: admin });
    await expect(approveRate(row.id, admin)).rejects.toThrow(RateError);
    expect(await currentRate(P, day("2026-08-19"))).toBeNull();
  });

  it("applies 30% itself immediately — the rule is above 30%", async () => {
    const { needsSecondAdmin } = await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect(needsSecondAdmin).toBe(false);
    expect((await currentRate(P, day("2026-08-01")))!.rateBp).toBe(3000);
  });

  it("will not approve the same change twice", async () => {
    const { row } = await setRate({ partnerId: P, rateBp: 3500, effectiveFrom: day("2026-08-10"), reason: REASON, actor: admin });
    await approveRate(row.id, admin2);
    await expect(approveRate(row.id, admin2)).rejects.toThrow(RateError);
  });
});

// The five conditions F4 is declared done against, written as one scenario each.
describe("F4 done-when", () => {
  it("1 · a rate change next month leaves a deal won today paying the old rate", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Initial rate.", actor: admin });

    // Admin sets 25% effective next month.
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-09-01"), reason: "Renegotiated downwards.", actor: admin });

    // A deal won today locks 30%; one won next month locks 25%.
    const wonToday = await lockedRateBpForWin(P, day("2026-08-19"));
    const wonNextMonth = await lockedRateBpForWin(P, day("2026-09-15"));
    expect(wonToday).toBe(3000);
    expect(wonNextMonth).toBe(2500);

    // And the locked value is what pays — re-reading later never moves it.
    await setRate({ partnerId: P, rateBp: 1000, effectiveFrom: day("2026-10-01"), reason: "Changed again later.", actor: admin });
    expect(wonToday).toBe(3000);
    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(3000);
  });

  it("2 · a 35% rate cannot take effect without a second admin", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Initial rate.", actor: admin });
    const { row } = await setRate({ partnerId: P, rateBp: 3500, effectiveFrom: day("2026-08-05"), reason: "Strategic account.", actor: admin });

    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(3000);
    await expect(approveRate(row.id, admin)).rejects.toThrow(RateError);
    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(3000);

    await approveRate(row.id, admin2);
    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(3500);
  });

  it("3 · a 60% rate is rejected outright", async () => {
    await expect(setRate({ partnerId: P, rateBp: 6000, effectiveFrom: day("2026-08-01"), reason: "Way too generous.", actor: admin }))
      .rejects.toThrow(RateError);
    expect(rows).toHaveLength(0);
  });

  it("4 · backdating past the last rate row is rejected", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Initial rate.", actor: admin });
    await expect(setRate({ partnerId: P, rateBp: 4000, effectiveFrom: day("2026-07-01"), reason: "Trying to backdate.", actor: admin }))
      .rejects.toThrow(RateError);
    expect(rows).toHaveLength(1);
  });

  it("5 · the history shows every change with its reason and actor", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Initial rate on joining.", actor: admin });
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-09-01"), reason: "Renegotiated for volume.", actor: admin2 });
    await setRate({ partnerId: P, rateBp: 3500, effectiveFrom: day("2026-10-01"), reason: "Exceptional performance.", actor: admin });

    const history = await rateHistory(P);
    expect(history).toHaveLength(3);
    expect(history.map((h) => [h.rateBp, h.reason, h.setByUserId, h.approvedAt !== null])).toEqual([
      [3500, "Exceptional performance.", "admin1", false],
      [2500, "Renegotiated for volume.", "admin2", true],
      [3000, "Initial rate on joining.", "admin1", true],
    ]);
  });
});

// A partner page that touches a full rate row leaks it into the RSC payload —
// reason text, who set it, the approval trail. The partner-facing read must
// return a bare number.
describe("partner-facing rate is a bare number", () => {
  it("returns only the rate in force, never a row", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Internal reasoning nobody outside should read.", actor: admin });

    const value = await currentRateBpForPartner(P, day("2026-08-19"));
    expect(value).toBe(3000);
    expect(typeof value).toBe("number");
    expect(JSON.stringify(value)).not.toContain("Internal reasoning");
    expect(JSON.stringify(value)).not.toContain("admin1");
  });

  it("returns null when nothing is in force", async () => {
    expect(await currentRateBpForPartner(P, day("2026-08-19"))).toBeNull();
  });

  it("hides a pending rate from the partner until it is approved", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: P, rateBp: 4000, effectiveFrom: day("2026-08-02"), reason: REASON, actor: admin });
    expect(await currentRateBpForPartner(P, day("2026-08-19"))).toBe(3000);
  });

  it("agrees with the admin-facing read", async () => {
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect(await currentRateBpForPartner(P, day("2026-08-19"))).toBe((await currentRate(P, day("2026-08-19")))!.rateBp);
  });
});

describe("locking the rate onto a won deal", () => {
  it("refuses to win a deal when no rate is in force rather than assuming one", async () => {
    await expect(lockedRateBpForWin(P, day("2026-08-19"))).rejects.toThrow(RateError);
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-09-01"), reason: REASON, actor: admin });
    await expect(lockedRateBpForWin(P, day("2026-08-19"))).rejects.toThrow(RateError);
  });

  it("ignores a pending rate when locking", async () => {
    await setRate({ partnerId: P, rateBp: 2000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: P, rateBp: 4500, effectiveFrom: day("2026-08-02"), reason: REASON, actor: admin });
    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(2000);
  });

  it("locks each partner against their own rate", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: "partner2", rateBp: 1500, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect(await lockedRateBpForWin(P, day("2026-08-19"))).toBe(3000);
    expect(await lockedRateBpForWin("partner2", day("2026-08-19"))).toBe(1500);
  });
});

describe("append-only history", () => {
  it("keeps every change, newest first, with reason and actor", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: "Initial rate on joining.", actor: admin });
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-09-01"), reason: "Renegotiated for volume.", actor: admin2 });

    const history = await rateHistory(P);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ rateBp: 2500, reason: "Renegotiated for volume.", setByUserId: "admin2" });
    expect(history[1]).toMatchObject({ rateBp: 3000, reason: "Initial rate on joining.", setByUserId: "admin1" });
  });

  it("never rewrites an existing row when the rate changes", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    const original = { ...rows[0] };
    await setRate({ partnerId: P, rateBp: 2500, effectiveFrom: day("2026-09-01"), reason: REASON, actor: admin });
    expect(rows[0]).toEqual(original);
  });

  it("keeps each partner's history separate", async () => {
    await setRate({ partnerId: P, rateBp: 3000, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    await setRate({ partnerId: "partner2", rateBp: 1500, effectiveFrom: day("2026-08-01"), reason: REASON, actor: admin });
    expect((await currentRate(P, day("2026-08-19")))!.rateBp).toBe(3000);
    expect((await currentRate("partner2", day("2026-08-19")))!.rateBp).toBe(1500);
  });
});
