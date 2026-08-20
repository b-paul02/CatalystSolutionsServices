import { describe, expect, it } from "vitest";
import { SCORE_MAX, bandOf, scoreApplication, type ScoreInput } from "@/lib/partner/scoring";
import { DEAL_SIZE_BANDS, EXPECTED_DEALS_BANDS, PROSPECT_BANDS } from "@/lib/partner/application-fields";

const empty: ScoreInput = {};

const strong: ScoreInput = {
  yearsExperience: 12,
  industries: ["Healthcare", "Real Estate", "SaaS"],
  dealExamples: "x".repeat(400),
  typicalDealSizeBand: DEAL_SIZE_BANDS[4],
  prospects90dBand: PROSPECT_BANDS[4],
  leadSources: ["a", "b", "c", "d"],
  markets: ["IN", "US"],
  targetFamilies: ["a", "b", "c", "d"],
  hoursPerWeek: 25,
  expectedDealsBand: EXPECTED_DEALS_BANDS[3],
  linkedinUrl: "linkedin.com/in/x",
};

describe("scoreApplication", () => {
  it("scores an empty application at zero", () => {
    expect(scoreApplication(empty).total).toBe(0);
  });

  it("scores a strong application at the ceiling", () => {
    const { total, breakdown, band } = scoreApplication(strong);
    expect(total).toBe(100);
    expect(breakdown).toEqual(SCORE_MAX);
    expect(band).toBe("fast_track");
  });

  it("never exceeds a category maximum however extreme the input", () => {
    const absurd = scoreApplication({
      ...strong,
      yearsExperience: 400,
      industries: Array(50).fill("x"),
      dealExamples: "x".repeat(100_000),
      leadSources: Array(50).fill("x"),
      markets: Array(20).fill("x"),
      targetFamilies: Array(50).fill("x"),
      hoursPerWeek: 200,
    });
    expect(absurd.total).toBeLessThanOrEqual(100);
    for (const k of Object.keys(SCORE_MAX) as (keyof typeof SCORE_MAX)[]) {
      expect(absurd.breakdown[k]).toBeLessThanOrEqual(SCORE_MAX[k]);
      expect(absurd.breakdown[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("adds up to the stated total", () => {
    const { total, breakdown } = scoreApplication(strong);
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("is deterministic", () => {
    expect(scoreApplication(strong)).toEqual(scoreApplication(strong));
  });

  it("rewards a LinkedIn profile, the only reference signal we collect", () => {
    expect(scoreApplication({ linkedinUrl: "x" }).breakdown.references).toBe(5);
    expect(scoreApplication({ linkedinUrl: "  " }).breakdown.references).toBe(0);
    expect(scoreApplication({}).breakdown.references).toBe(0);
  });

  it("penalises ambition that the committed hours cannot support", () => {
    const base = { hoursPerWeek: 2 };
    const modest = scoreApplication({ ...base, expectedDealsBand: EXPECTED_DEALS_BANDS[0] });
    const wild = scoreApplication({ ...base, expectedDealsBand: EXPECTED_DEALS_BANDS[3] });
    expect(wild.breakdown.commitment_realism).toBeLessThan(modest.breakdown.commitment_realism);
  });

  it("scores unknown band strings as zero rather than throwing", () => {
    const r = scoreApplication({ typicalDealSizeBand: "made up", prospects90dBand: "nonsense", expectedDealsBand: "?" });
    expect(r.breakdown.verified_closed_deals).toBe(0);
    expect(r.breakdown.prospect_volume).toBe(0);
    expect(r.breakdown.commitment_realism).toBe(0);
  });
});

describe("bands", () => {
  it("uses the published thresholds", () => {
    expect(bandOf(100)).toBe("fast_track");
    expect(bandOf(70)).toBe("fast_track");
    expect(bandOf(69)).toBe("standard");
    expect(bandOf(45)).toBe("standard");
    expect(bandOf(44)).toBe("low_priority");
    expect(bandOf(0)).toBe("low_priority");
  });
});
