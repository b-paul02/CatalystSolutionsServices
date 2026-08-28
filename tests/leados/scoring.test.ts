import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, parseWeights, scoreLead } from "@/lib/leados/scoring";

const now = new Date("2026-08-28T12:00:00Z");
const base = {
  firstName: null, email: null, phone: null, emailStatus: "unverified", phoneStatus: "unverified",
  city: null, country: null, source: "manual", status: "new",
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), b2c: null,
};

describe("rule-based scoring", () => {
  it("empty lead scores low and cold", () => {
    const r = scoreLead(base, DEFAULT_WEIGHTS, now);
    expect(r.quality).toBe(0);
    expect(r.intent).toBe(DEFAULT_WEIGHTS.intent.base);
    expect(r.label).toBe("cold");
  });
  it("a rich fresh form lead scores high with explanations", () => {
    const r = scoreLead({
      ...base,
      firstName: "Asha", email: "a@x.com", phone: "+911234567890",
      emailStatus: "valid", phoneStatus: "valid", city: "Mumbai",
      source: "form", status: "engaged",
      createdAt: now, updatedAt: now,
      b2c: { productInterest: "2BHK", budgetBand: "50-70L", purchaseTimeline: "3 months" },
    }, DEFAULT_WEIGHTS, now);
    expect(r.quality).toBe(100);
    expect(r.intent).toBe(100);
    expect(r.label).toBe("hot");
    expect(r.explanation.length).toBeGreaterThan(8);
    expect(r.explanation.every((e) => typeof e.points === "number")).toBe(true);
  });
  it("labels follow configurable thresholds", () => {
    const custom = { ...DEFAULT_WEIGHTS, hotThreshold: 25, warmThreshold: 10 };
    const r = scoreLead(base, custom, now);
    expect(r.label).toBe("warm"); // base 20 >= 10
  });
  it("weights merge safely from stored JSON", () => {
    expect(parseWeights(null)).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights("garbage")).toEqual(DEFAULT_WEIGHTS);
    const merged = parseWeights(JSON.stringify({ quality: { hasPhone: 40 }, hotThreshold: 90 }));
    expect(merged.quality.hasPhone).toBe(40);
    expect(merged.quality.hasEmail).toBe(DEFAULT_WEIGHTS.quality.hasEmail);
    expect(merged.hotThreshold).toBe(90);
  });
});
