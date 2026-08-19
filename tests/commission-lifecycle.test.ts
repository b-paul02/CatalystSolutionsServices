import { describe, expect, it, vi, beforeEach } from "vitest";

type Row = Record<string, unknown> & { id: string; createdAt: Date };

const tables: Record<string, Row[]> = { deal: [], commission: [], invoice: [], collection: [], commissionRate: [] };
let seq = 0;

const match = (row: Row, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
    if (v && typeof v === "object" && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
    if (v && typeof v === "object" && "lte" in (v as object)) return (row[k] as Date) <= (v as { lte: Date }).lte;
    return row[k] === v;
  });

function tableApi(name: string) {
  return {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${name}${++seq}`, createdAt: new Date(Date.now() + seq), ...data } as Row;
      tables[name].push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: { id: string } }) => tables[name].find((r) => r.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => tables[name].find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      tables[name].filter((r) => (where ? match(r, where) : true)).map((r) => ({ ...r })),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = tables[name].find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
  };
}

vi.mock("@/lib/audit/db", () => ({
  db: {
    deal: tableApi("deal"),
    commission: tableApi("commission"),
    invoice: tableApi("invoice"),
    collection: tableApi("collection"),
    commissionRate: tableApi("commissionRate"),
    auditLog: { create: async () => ({}) },
  },
}));

const {
  winDeal, recordInvoice, recordCollection, markPaid, createAdjustment, voidCommissions,
  ADJUSTMENT_REASONS, CommissionError,
} = await import("@/lib/partner/commissions");

const actor = { userId: "u1", email: "finance@x.com", role: "finance" as const, partnerId: null };
const NOW = new Date("2026-08-19T12:00:00Z");
const FEE = 8_500_000n; // ₹85,000
const P = "alice";

async function setup(opts: { rateBp?: number | null; fee?: bigint | null } = {}) {
  tables.deal.length = 0; tables.commission.length = 0;
  tables.invoice.length = 0; tables.collection.length = 0; tables.commissionRate.length = 0;
  seq = 0;
  if (opts.rateBp !== null) {
    tables.commissionRate.push({
      id: "r1", createdAt: new Date("2026-08-01"), partnerId: P, rateBp: opts.rateBp ?? 3000,
      effectiveFrom: new Date("2026-08-01T00:00:00Z"), approvedAt: new Date("2026-08-01"),
    });
  }
  tables.deal.push({
    id: "d1", createdAt: NOW, partnerId: P, stage: "negotiation", market: "IN",
    onboardingFee: opts.fee === undefined ? FEE : opts.fee, commissionRateBpLocked: null,
  });
}

const commissions = () => tables.commission as unknown as {
  id: string; state: string; amount: bigint; baseAmount: bigint; rateBp: number; adjustmentReasonCode?: string;
}[];
const sumOf = (state: string) => commissions().filter((c) => c.state === state).reduce((a, c) => a + c.amount, 0n);

beforeEach(() => setup());

describe("pending — created when the deal is won", () => {
  it("computes commission from the locked rate and creates one pending row", async () => {
    const c = await winDeal({ actor, dealId: "d1", now: NOW });
    expect(c.state).toBe("pending");
    expect(c.baseAmount).toBe(FEE);
    expect(c.rateBp).toBe(3000);
    expect(c.amount).toBe(2_550_000n); // ₹25,500
    expect(tables.deal[0].commissionRateBpLocked).toBe(3000);
    expect(tables.deal[0].stage).toBe("won");
  });

  it("refuses to win a deal with no package attached", async () => {
    await setup({ fee: null });
    await expect(winDeal({ actor, dealId: "d1", now: NOW })).rejects.toThrow(CommissionError);
    expect(tables.commission).toHaveLength(0);
  });

  it("refuses to win when the partner has no rate in force", async () => {
    await setup({ rateBp: null });
    await expect(winDeal({ actor, dealId: "d1", now: NOW })).rejects.toThrow();
    expect(tables.commission).toHaveLength(0);
  });

  it("will not win the same deal twice", async () => {
    await winDeal({ actor, dealId: "d1", now: NOW });
    await expect(winDeal({ actor, dealId: "d1", now: NOW })).rejects.toThrow(CommissionError);
    expect(tables.commission).toHaveLength(1);
  });
});

describe("accrued — invoice recorded", () => {
  it("moves the pending commission to accrued", async () => {
    await winDeal({ actor, dealId: "d1", now: NOW });
    await recordInvoice({ actor, dealId: "d1", amount: FEE, now: NOW });
    expect(commissions()[0].state).toBe("accrued");
  });

  it("refuses to invoice a deal that is not won", async () => {
    await expect(recordInvoice({ actor, dealId: "d1", amount: FEE, now: NOW })).rejects.toThrow(CommissionError);
  });
});

// The headline requirement.
describe("payable — collecting 40% makes exactly 40% payable", () => {
  beforeEach(async () => {
    await setup();
    await winDeal({ actor, dealId: "d1", now: NOW });
    await recordInvoice({ actor, dealId: "d1", amount: FEE, now: NOW });
  });

  it("releases exactly 40% of the commission for a 40% collection", async () => {
    const total = 2_550_000n;
    await recordCollection({ actor, invoiceId: "invoice2", amount: (FEE * 40n) / 100n, now: NOW });

    expect(sumOf("payable")).toBe((total * 40n) / 100n); // ₹10,200
    expect(sumOf("accrued")).toBe(total - (total * 40n) / 100n);
    expect(sumOf("payable") + sumOf("accrued")).toBe(total);
  });

  it("pays a 40/40/20 deal in three slices that sum to the whole", async () => {
    const total = 2_550_000n;
    for (const pct of [40n, 40n, 20n]) {
      await recordCollection({ actor, invoiceId: "invoice2", amount: (FEE * pct) / 100n, now: NOW });
    }
    const slices = commissions().filter((c) => c.state === "payable");
    expect(slices).toHaveLength(3);
    // 40% / 40% / 20% of ₹25,500 — each slice is a share of the ORIGINAL
    // commission, not of whatever was left when it was collected.
    expect([...slices.map((s) => s.amount)].sort((a, b) => Number(b - a)))
      .toEqual([1_020_000n, 1_020_000n, 510_000n]);
    expect(sumOf("payable")).toBe(total);
    expect(sumOf("accrued")).toBe(0n);
  });

  it("sums to the whole even when the split does not divide evenly", async () => {
    await setup({ fee: 999_999n });
    await winDeal({ actor, dealId: "d1", now: NOW });
    await recordInvoice({ actor, dealId: "d1", amount: 999_999n, now: NOW });
    const total = commissions()[0].amount;

    await recordCollection({ actor, invoiceId: "invoice2", amount: 333_333n, now: NOW });
    await recordCollection({ actor, invoiceId: "invoice2", amount: 333_333n, now: NOW });
    await recordCollection({ actor, invoiceId: "invoice2", amount: 333_333n, now: NOW });

    expect(sumOf("payable")).toBe(total);
    expect(sumOf("accrued")).toBe(0n);
  });

  it("makes the whole commission payable on a single full collection", async () => {
    await recordCollection({ actor, invoiceId: "invoice2", amount: FEE, now: NOW });
    expect(sumOf("payable")).toBe(2_550_000n);
    expect(commissions().filter((c) => c.state === "payable")).toHaveLength(1);
  });

  it("refuses to collect more than the invoice", async () => {
    await expect(recordCollection({ actor, invoiceId: "invoice2", amount: FEE + 1n, now: NOW }))
      .rejects.toThrow(CommissionError);
    expect(sumOf("payable")).toBe(0n);
  });

  it("refuses to over-collect across several payments", async () => {
    await recordCollection({ actor, invoiceId: "invoice2", amount: (FEE * 60n) / 100n, now: NOW });
    await expect(recordCollection({ actor, invoiceId: "invoice2", amount: (FEE * 50n) / 100n, now: NOW }))
      .rejects.toThrow(CommissionError);
  });

  it("never lets slices exceed the original commission", async () => {
    for (const pct of [25n, 25n, 25n, 25n]) {
      await recordCollection({ actor, invoiceId: "invoice2", amount: (FEE * pct) / 100n, now: NOW });
    }
    expect(sumOf("payable")).toBe(2_550_000n);
    expect(sumOf("payable")).toBeLessThanOrEqual(2_550_000n);
  });
});

describe("paid", () => {
  beforeEach(async () => {
    await setup();
    await winDeal({ actor, dealId: "d1", now: NOW });
    await recordInvoice({ actor, dealId: "d1", amount: FEE, now: NOW });
    await recordCollection({ actor, invoiceId: "invoice2", amount: FEE, now: NOW });
  });

  it("marks a payable commission paid with a reference", async () => {
    const payable = commissions().find((c) => c.state === "payable")!;
    const paid = await markPaid({ actor, commissionId: payable.id, payoutRef: "NEFT-2026-08-001", now: NOW });
    expect(paid.state).toBe("paid");
    expect(paid.payoutRef).toBe("NEFT-2026-08-001");
  });

  it("requires a payout reference", async () => {
    const payable = commissions().find((c) => c.state === "payable")!;
    await expect(markPaid({ actor, commissionId: payable.id, payoutRef: "  ", now: NOW })).rejects.toThrow(CommissionError);
  });

  it("will not pay something that is not payable", async () => {
    await setup();
    const c = await winDeal({ actor, dealId: "d1", now: NOW });
    await expect(markPaid({ actor, commissionId: c.id, payoutRef: "X" })).rejects.toThrow(CommissionError);
  });
});

// The load-bearing guarantee.
describe("adjustments — and the absence of a retention clawback", () => {
  beforeEach(async () => {
    await setup();
    await winDeal({ actor, dealId: "d1", now: NOW });
  });

  it("allows exactly three reasons and no others", () => {
    expect([...ADJUSTMENT_REASONS]).toEqual(["refund", "chargeback", "misselling"]);
  });

  it("REFUSES to adjust for a Growth Plan lapse, however it is phrased", async () => {
    const c = commissions()[0];
    const attempts = [
      "growth_plan_lapse", "growth_plan_cancelled", "growth_plan_declined", "retention",
      "retention_clawback", "clawback", "churn", "client_cancelled_monthly", "no_renewal", "",
    ];
    for (const reasonCode of attempts) {
      await expect(
        createAdjustment({ actor, commissionId: c.id, reasonCode, reason: "Client stopped the monthly plan." }),
        reasonCode,
      ).rejects.toThrow(CommissionError);
    }
    // Nothing was written: no adjusted row exists by any route.
    expect(commissions().filter((x) => x.state === "adjusted")).toHaveLength(0);
    expect(commissions()[0].amount).toBe(2_550_000n);
  });

  it("says plainly that there is no retention clawback", async () => {
    const c = commissions()[0];
    const err = await createAdjustment({ actor, commissionId: c.id, reasonCode: "churn", reason: "Client churned away." })
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain("no retention clawback");
  });

  it("allows a refund, recorded as a negative counter-row", async () => {
    const c = commissions()[0];
    const adj = await createAdjustment({ actor, commissionId: c.id, reasonCode: "refund", reason: "Client refunded in full." });
    expect(adj.state).toBe("adjusted");
    expect(adj.amount).toBe(-2_550_000n);
    expect(adj.adjustmentOfId).toBe(c.id);
    // The original is untouched, so the ledger still explains itself.
    expect(commissions()[0].amount).toBe(2_550_000n);
    expect(commissions()[0].state).toBe("pending");
  });

  it("allows chargeback and misselling", async () => {
    for (const reasonCode of ["chargeback", "misselling"] as const) {
      await setup();
      const c = await winDeal({ actor, dealId: "d1", now: NOW });
      const adj = await createAdjustment({ actor, commissionId: c.id, reasonCode, reason: "A properly recorded reason." });
      expect(adj.adjustmentReasonCode).toBe(reasonCode);
    }
  });

  it("supports a partial adjustment but never more than the original", async () => {
    const c = commissions()[0];
    const partial = await createAdjustment({ actor, commissionId: c.id, reasonCode: "refund", reason: "Half refunded to client.", amount: 1_275_000n });
    expect(partial.amount).toBe(-1_275_000n);

    await expect(createAdjustment({ actor, commissionId: c.id, reasonCode: "refund", reason: "Too big an adjustment.", amount: 9_999_999n }))
      .rejects.toThrow(CommissionError);
  });

  it("requires a written reason", async () => {
    const c = commissions()[0];
    await expect(createAdjustment({ actor, commissionId: c.id, reasonCode: "refund", reason: "too short" }))
      .rejects.toThrow(CommissionError);
  });

  it("will not adjust an adjustment", async () => {
    const c = commissions()[0];
    const adj = await createAdjustment({ actor, commissionId: c.id, reasonCode: "refund", reason: "Client refunded in full." });
    await expect(createAdjustment({ actor, commissionId: adj.id, reasonCode: "refund", reason: "Adjusting the adjustment." }))
      .rejects.toThrow(CommissionError);
  });
});

describe("void", () => {
  it("voids everything not yet paid when a deal is cancelled", async () => {
    await winDeal({ actor, dealId: "d1", now: NOW });
    const count = await voidCommissions({ actor, dealId: "d1", reason: "Deal cancelled before delivery began." });
    expect(count).toBe(1);
    expect(commissions()[0].state).toBe("void");
  });

  it("leaves paid commissions alone", async () => {
    await winDeal({ actor, dealId: "d1", now: NOW });
    await recordInvoice({ actor, dealId: "d1", amount: FEE, now: NOW });
    await recordCollection({ actor, invoiceId: "invoice2", amount: FEE, now: NOW });
    const payable = commissions().find((c) => c.state === "payable")!;
    await markPaid({ actor, commissionId: payable.id, payoutRef: "NEFT-1" });

    const count = await voidCommissions({ actor, dealId: "d1", reason: "Attempting to void after payout." });
    expect(count).toBe(0);
    expect(commissions().find((c) => c.id === payable.id)!.state).toBe("paid");
  });

  it("requires a reason", async () => {
    await winDeal({ actor, dealId: "d1", now: NOW });
    await expect(voidCommissions({ actor, dealId: "d1", reason: "nope" })).rejects.toThrow(CommissionError);
  });
});

describe("a rate change after winning never moves the money", () => {
  it("keeps the commission at the rate locked when the deal was won", async () => {
    const c = await winDeal({ actor, dealId: "d1", now: NOW });
    expect(c.amount).toBe(2_550_000n);

    // A new, higher rate arrives later.
    tables.commissionRate.push({
      id: "r2", createdAt: new Date("2026-09-01"), partnerId: P, rateBp: 5000,
      effectiveFrom: new Date("2026-09-01T00:00:00Z"), approvedAt: new Date("2026-09-01"),
    });

    await recordInvoice({ actor, dealId: "d1", amount: FEE, now: new Date("2026-09-15") });
    await recordCollection({ actor, invoiceId: "invoice2", amount: FEE, now: new Date("2026-09-15") });

    expect(sumOf("payable")).toBe(2_550_000n); // not 4,250,000
    expect(commissions()[0].rateBp).toBe(3000);
  });
});
