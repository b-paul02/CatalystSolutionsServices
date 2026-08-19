import { describe, expect, it } from "vitest";
import { commissionAmount, formatMoney, formatRate, proRata, toMinor } from "@/lib/partner/money";

describe("minor units", () => {
  it("converts major to minor without float drift", () => {
    expect(toMinor(85_000)).toBe(8_500_000n);
    expect(toMinor(4_500)).toBe(450_000n);
    expect(toMinor(1_299.99)).toBe(129_999n);
  });
});

describe("commissionAmount", () => {
  const fee = toMinor(85_000); // ₹85,000 = 8,500,000 paise

  it("computes the default 30%", () => {
    expect(commissionAmount(fee, 3000)).toBe(2_550_000n);
  });

  it("computes other rates", () => {
    expect(commissionAmount(fee, 2500)).toBe(2_125_000n);
    expect(commissionAmount(fee, 1750)).toBe(1_487_500n);
    expect(commissionAmount(fee, 5000)).toBe(4_250_000n);
    expect(commissionAmount(fee, 0)).toBe(0n);
  });

  it("rounds half-up on the minor unit, never floats", () => {
    // 333 paise at 33.33% = 110.9889 paise → 111
    expect(commissionAmount(333n, 3333)).toBe(111n);
    // exactly .5 rounds up
    expect(commissionAmount(1n, 5000)).toBe(1n);
  });

  it("rejects nonsense input rather than silently computing", () => {
    expect(() => commissionAmount(100n, -1)).toThrow();
    expect(() => commissionAmount(100n, 30.5)).toThrow();
    expect(() => commissionAmount(-100n, 3000)).toThrow();
  });
});

describe("proRata", () => {
  const total = commissionAmount(toMinor(100_000), 3000); // 3,000,000 paise

  it("pays 40% of the commission for a 40% collection", () => {
    expect(proRata(total, toMinor(40_000), toMinor(100_000))).toBe(1_200_000n);
  });

  it("pays out a 40/40/20 schedule exactly, with no drift", () => {
    const invoiced = toMinor(100_000);
    const slices = [40_000, 40_000, 20_000].map((c) => proRata(total, toMinor(c), invoiced));
    expect(slices).toEqual([1_200_000n, 1_200_000n, 600_000n]);
    expect(slices.reduce((a, b) => a + b, 0n)).toBe(total);
  });

  it("handles a full collection and a zero collection", () => {
    expect(proRata(total, toMinor(100_000), toMinor(100_000))).toBe(total);
    expect(proRata(total, 0n, toMinor(100_000))).toBe(0n);
  });

  it("rejects a zero invoice rather than dividing by zero", () => {
    expect(() => proRata(total, 100n, 0n)).toThrow();
  });
});

describe("formatting", () => {
  it("formats each market in its own currency", () => {
    expect(formatMoney(8_500_000n, "INR")).toContain("85,000");
    expect(formatMoney(450_000n, "USD")).toContain("4,500");
  });

  it("shows paise/cents only when non-zero", () => {
    expect(formatMoney(129_999n, "USD")).toContain("1,299.99");
    expect(formatMoney(450_000n, "USD")).not.toContain(".00");
  });

  it("formats rates from basis points", () => {
    expect(formatRate(3000)).toBe("30%");
    expect(formatRate(2550)).toBe("25.50%");
  });
});
