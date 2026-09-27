// Profitability model (pure). Provider prices are the published paid-tier list prices checked on 2026-09-21; the FX rate
// is an assumption passed in explicitly. These tests fail if someone edits PROPOSED_* into an unprofitable shape.
import { describe, expect, it } from "vitest";
import { creditValueMicros, marginReport, profitabilityProblems, PROPOSED_PACKS, PROPOSED_RATES, type ProviderPrices } from "@/lib/os/pricing";
import { TOOL_KEYS } from "@/lib/os/studio";

const FX = { AI_FX_INR_PER_USD: "88" } as unknown as NodeJS.ProcessEnv;
const FLASH_LITE: ProviderPrices = { inputMicrosPerMTok: 300_000, outputMicrosPerMTok: 2_500_000, imageMicros: 33_600 }; // what the platform runs today
const PREMIUM: ProviderPrices = { inputMicrosPerMTok: 2_000_000, outputMicrosPerMTok: 10_000_000, imageMicros: 130_000 }; // headroom: a Sonnet-class model + a premium image model

describe("proposed AI-credit pricing", () => {
  it("prices every tool, and the cheapest credit is the 1,500 pack in INR after the fee", () => {
    expect(Object.keys(PROPOSED_RATES).sort()).toEqual([...TOOL_KEYS, "research"].sort());
    const v = creditValueMicros(PROPOSED_PACKS, FX);
    expect(v.micros).toBe(Math.round(((7999 / 88) * 1_000_000 * 0.94) / 1500)); // ≈ $0.057 a credit
    expect(v.basis).toMatch(/1500 credits/);
  });

  it("activation floor: worst-case MODEL cost stays well under the cheapest credit's value (a guard against selling below cost, not a profit forecast)", () => {
    const credit = creditValueMicros(PROPOSED_PACKS, FX).micros;
    const SEARCH = 9_000; // ASSUMED worst case of $9 per 1,000 searches — the real figure is whatever plan is bought (RESEARCH_PRICE_MICROS)
    const today = marginReport(PROPOSED_RATES, FLASH_LITE, credit, SEARCH), premium = marginReport(PROPOSED_RATES, PREMIUM, credit, SEARCH);
    console.table(today.map((r, i) => ({ tool: r.tool, maxCredits: r.maxCredits, "cost today $": (r.worstCostMicros! / 1e6).toFixed(4), "margin today %": r.marginPct, "margin premium %": premium[i].marginPct })));
    expect(Math.min(...today.map((r) => r.marginPct!))).toBeGreaterThanOrEqual(85);
    expect(profitabilityProblems(premium, 70)).toEqual([]);
  });

  it("refuses what it cannot check, and names a thin tool", () => {
    const credit = creditValueMicros(PROPOSED_PACKS, FX).micros;
    expect(profitabilityProblems(marginReport(PROPOSED_RATES, { ...FLASH_LITE, imageMicros: null }, credit, 9_000), 70)[0]).toMatch(/cannot be checked for: image/);
    expect(creditValueMicros(PROPOSED_PACKS.filter((p) => p.currency === "INR"), {} as NodeJS.ProcessEnv).micros).toBeNull(); // no FX ⇒ unknown, not guessed
    const thin = profitabilityProblems(marginReport({ ...PROPOSED_RATES, image: { base: 1, perKOutputTokens: 0 } }, PREMIUM, credit, 9_000), 70);
    expect(thin.join(" ")).toMatch(/image: worst-case margin/);
  });
});
