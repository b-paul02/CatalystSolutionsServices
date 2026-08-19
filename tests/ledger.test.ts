import { describe, expect, it, vi, beforeEach } from "vitest";

type C = { amount: bigint; currency: string; state: string; partnerId: string; partner: { legalName: string } };
const rows: C[] = [];

vi.mock("@/lib/audit/db", () => ({
  db: { commission: { findMany: async () => rows } },
}));

const { ledgerSummary, ledgerWhere, toCsv, csvCell, minorToDecimalString, COMMISSION_STATES } =
  await import("@/lib/partner/ledger");

const row = (over: Partial<C> = {}): C => ({
  amount: 1_000_000n, currency: "INR", state: "paid", partnerId: "p1",
  partner: { legalName: "Alice Partners" }, ...over,
});

beforeEach(() => { rows.length = 0; });

describe("per-partner summary", () => {
  it("totals each state separately", async () => {
    rows.push(
      row({ state: "pending", amount: 100n }),
      row({ state: "accrued", amount: 200n }),
      row({ state: "payable", amount: 300n }),
      row({ state: "paid", amount: 400n }),
      row({ state: "adjusted", amount: -50n }),
      row({ state: "void", amount: 10n }),
    );
    const [s] = await ledgerSummary({});
    expect(s.totals).toEqual({ pending: 100n, accrued: 200n, payable: 300n, paid: 400n, adjusted: -50n, void: 10n });
  });

  it("splits a partner selling in both markets into one row per currency", async () => {
    rows.push(
      row({ currency: "INR", amount: 2_550_000n }),
      row({ currency: "USD", amount: 135_000n }),
    );
    const s = await ledgerSummary({});
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.currency === "INR")!.totals.paid).toBe(2_550_000n);
    expect(s.find((x) => x.currency === "USD")!.totals.paid).toBe(135_000n);
  });

  it("never merges two partners", async () => {
    rows.push(
      row({ partnerId: "p1", partner: { legalName: "Alice Partners" }, amount: 100n }),
      row({ partnerId: "p2", partner: { legalName: "Bob Partners" }, amount: 999n }),
    );
    const s = await ledgerSummary({});
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.partnerId === "p1")!.totals.paid).toBe(100n);
  });

  it("carries adjustments as negatives so the ledger nets out", async () => {
    rows.push(row({ state: "paid", amount: 2_550_000n }), row({ state: "adjusted", amount: -1_020_000n }));
    const [s] = await ledgerSummary({});
    expect(s.totals.paid + s.totals.adjusted).toBe(1_530_000n);
  });

  it("returns nothing rather than a zero row when there is no data", async () => {
    expect(await ledgerSummary({})).toEqual([]);
  });
});

describe("filters", () => {
  it("builds an empty where clause when nothing is filtered", () => {
    expect(ledgerWhere({})).toEqual({});
  });

  it("filters by partner, state, market and period", () => {
    const w = ledgerWhere({ partnerId: "p1", state: "payable", market: "IN", from: "2026-08-01", to: "2026-08-31" });
    expect(w.AND).toEqual([
      { partnerId: "p1" },
      { state: "payable" },
      { deal: { market: "IN" } },
      { createdAt: { gte: new Date("2026-08-01T00:00:00Z") } },
      { createdAt: { lte: new Date("2026-08-31T23:59:59Z") } },
    ]);
  });

  it("ignores a state that is not a real commission state", () => {
    expect(ledgerWhere({ state: "'; DROP TABLE commission; --" })).toEqual({});
    expect(ledgerWhere({ state: "growth_plan_lapse" })).toEqual({});
  });

  it("knows the six states and no others", () => {
    expect([...COMMISSION_STATES]).toEqual(["pending", "accrued", "payable", "paid", "adjusted", "void"]);
  });
});

describe("CSV", () => {
  it("quotes every cell and escapes inner quotes", () => {
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });

  it("keeps a comma inside a client name from breaking the row", () => {
    const csv = toCsv([["Partner", "Client"], ["Alice", "Acme, Ltd"]]);
    expect(csv).toBe('"Partner","Client"\r\n"Alice","Acme, Ltd"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("survives a newline inside a reason without splitting the row count", () => {
    const csv = toCsv([["a", "line one\nline two"]]);
    expect(csv).toBe('"a","line one\nline two"');
  });

  it("renders minor units as a plain decimal a spreadsheet will read as a number", () => {
    expect(minorToDecimalString(2_550_000n)).toBe("25500.00");
    expect(minorToDecimalString(129_999n)).toBe("1299.99");
    expect(minorToDecimalString(5n)).toBe("0.05");
    expect(minorToDecimalString(0n)).toBe("0.00");
  });

  it("keeps an adjustment negative in the export", () => {
    expect(minorToDecimalString(-1_020_000n)).toBe("-10200.00");
  });
});
