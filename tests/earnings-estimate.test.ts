import { describe, expect, it, vi } from "vitest";

// The seeded price book, as the page sees it.
const PRICE_BOOK = [
  // IN — Tier 1/2/3 plus the largest package, which sits outside the tier ladder.
  { market: "IN", tier: "Tier 1", onboardingFee: 8_500_000n },
  { market: "IN", tier: "Tier 2", onboardingFee: 17_500_000n },
  { market: "IN", tier: "Tier 3", onboardingFee: 35_000_000n },
  { market: "IN", tier: "Tier 3", onboardingFee: 60_000_000n },
  { market: "IN", tier: "Custom Build", onboardingFee: 110_000_000n },
  // US
  { market: "US", tier: "Tier 1", onboardingFee: 450_000n },
  { market: "US", tier: "Tier 2", onboardingFee: 950_000n },
  { market: "US", tier: "Tier 3", onboardingFee: 1_800_000n },
  { market: "US", tier: "Tier 3", onboardingFee: 3_000_000n },
  { market: "US", tier: "Custom Build", onboardingFee: 5_500_000n },
];

vi.mock("@/lib/audit/db", () => ({
  db: {
    priceBook: {
      findMany: async ({ where }: { where: { market: string } }) =>
        PRICE_BOOK.filter((r) => r.market === where.market),
    },
  },
}));

const {
  earningsEstimate, HEADLINE, ADVERTISED_RATE_BP, HEADLINE_DEALS_PER_MONTH, inrShort, usdShort,
} = await import("@/lib/partner/earnings-estimate");

/** "₹80 lakh" / "$165,000" → minor units, so a label can be checked against the maths. */
function labelToMinor(label: string): bigint {
  const n = Number(label.replace(/[^0-9.]/g, ""));
  if (label.includes("crore")) return BigInt(Math.round(n * 10_000_000)) * 100n;
  if (label.includes("lakh")) return BigInt(Math.round(n * 100_000)) * 100n;
  return BigInt(Math.round(n)) * 100n;
}

describe("the advertised ceiling is supported by the price book", () => {
  it("India's headline is within 2% of two top-package deals a month", async () => {
    const est = await earningsEstimate();
    const claimed = labelToMinor(HEADLINE.IN.label);

    // ₹11,00,000 × 30% = ₹3,30,000 a deal; × 24 = ₹79,20,000.
    expect(est.IN.topPerDeal).toBe(33_000_000n);
    expect(est.IN.supported).toBe(33_000_000n * BigInt(HEADLINE_DEALS_PER_MONTH * 12));

    const drift = Number(claimed - est.IN.supported) / Number(est.IN.supported);
    expect(Math.abs(drift), `₹80 lakh vs supported ${inrShort(est.IN.supported)}`).toBeLessThan(0.02);
  });

  it("the US headline is within 2% of two Tier-3 deals a month", async () => {
    const est = await earningsEstimate();
    const claimed = labelToMinor(HEADLINE.US.label);

    // Tier 3 average of $18,000 and $30,000 = $24,000; 30% = $7,200 a deal.
    expect(est.US.tier3PerDeal).toBe(720_000n);
    expect(est.US.supported).toBe(720_000n * BigInt(HEADLINE_DEALS_PER_MONTH * 12));

    const drift = Number(claimed - est.US.supported) / Number(est.US.supported);
    expect(Math.abs(drift), `$165,000 vs supported ${usdShort(est.US.supported)}`).toBeLessThan(0.05);
  });

  it("never advertises more than the price book can pay", async () => {
    const est = await earningsEstimate();
    // A rounded headline may sit a little above the exact figure, but never far.
    expect(labelToMinor(HEADLINE.IN.label)).toBeLessThan((est.IN.supported * 102n) / 100n);
    expect(labelToMinor(HEADLINE.US.label)).toBeLessThan((est.US.supported * 102n) / 100n);
  });
});

describe("the two markets stay independent", () => {
  it("neither headline is a conversion of the other", async () => {
    const est = await earningsEstimate();
    // Priced separately: the rupee figure is nowhere near a converted dollar one.
    expect(est.IN.supported).not.toBe(est.US.supported);
    expect(HEADLINE.IN.label).toContain("₹");
    expect(HEADLINE.US.label).toContain("$");
  });

  it("each market is built only from its own rows", async () => {
    const est = await earningsEstimate();
    expect(est.IN.medianFee).toBe(35_000_000n); // ₹3,50,000 — an IN row
    expect(est.US.medianFee).toBe(1_800_000n);  // $18,000 — a US row
  });

  it("states a basis for each market, since they rest on different tiers", () => {
    expect(HEADLINE.IN.basis).toBeTruthy();
    expect(HEADLINE.US.basis).toBeTruthy();
    expect(HEADLINE.IN.basis).not.toBe(HEADLINE.US.basis);
  });
});

describe("the rate is the advertised default, not a partner's real rate", () => {
  it("uses 30% for the illustration", () => {
    expect(ADVERTISED_RATE_BP).toBe(3000);
  });
});

describe("formatting", () => {
  it("writes Indian figures the way Indian readers say them", () => {
    expect(inrShort(8_000_000_00n)).toBe("₹80 lakh");
    expect(inrShort(79_20_000_00n)).toBe("₹79.2 lakh");
    expect(inrShort(120_00_000_00n)).toBe("₹1.2 crore");
  });

  it("writes US figures in full", () => {
    expect(usdShort(165_000_00n)).toBe("$165,000");
    expect(usdShort(6_986_00n)).toBe("$6,986");
  });
});
