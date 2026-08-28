import { describe, expect, it } from "vitest";
import { computeDue, isPlanDueOn, isoWeekKey, isoWeekday, isWorkingDay, localDateStr, matchesTargeting } from "@/lib/leados/allocationRules";

describe("calendar rules", () => {
  it("iso weekdays", () => {
    expect(isoWeekday("2026-08-24")).toBe(1); // Monday
    expect(isoWeekday("2026-08-29")).toBe(6); // Saturday
    expect(isoWeekday("2026-08-30")).toBe(7); // Sunday
  });
  it("working days respect weekday config and holidays", () => {
    expect(isWorkingDay("2026-08-24", [1, 2, 3, 4, 5], [])).toBe(true);
    expect(isWorkingDay("2026-08-29", [1, 2, 3, 4, 5], [])).toBe(false);
    expect(isWorkingDay("2026-08-24", [1, 2, 3, 4, 5], ["2026-08-24"])).toBe(false);
    expect(isWorkingDay("2026-08-29", [6, 7], [])).toBe(true);
  });
  it("plan window: before start, after end, inside", () => {
    const cal = { startDate: "2026-08-01", endDate: "2026-08-31", workingDays: [1, 2, 3, 4, 5], holidays: [] };
    expect(isPlanDueOn(cal, "2026-07-31")).toBe(false);
    expect(isPlanDueOn(cal, "2026-09-01")).toBe(false);
    expect(isPlanDueOn(cal, "2026-08-24")).toBe(true);
  });
  it("timezone-local dates differ across the date line", () => {
    const at = new Date("2026-08-28T20:00:00Z");
    expect(localDateStr("Asia/Kolkata", at)).toBe("2026-08-29");
    expect(localDateStr("America/New_York", at)).toBe("2026-08-28");
  });
});

describe("rollover", () => {
  const prior = [
    { runDate: "2026-08-24", due: 10, allocated: 6 }, // Mon, short 4
    { runDate: "2026-08-25", due: 10, allocated: 10 },
    { runDate: "2026-08-21", due: 10, allocated: 3 }, // previous week, short 7
  ];
  it("none: quota only", () => {
    expect(computeDue(10, "none", "2026-08-26", prior)).toEqual({ due: 10, rollover: 0 });
  });
  it("week: only same-ISO-week shortfalls", () => {
    expect(computeDue(10, "week", "2026-08-26", prior)).toEqual({ due: 14, rollover: 4 });
  });
  it("campaign_end: every shortfall", () => {
    expect(computeDue(10, "campaign_end", "2026-08-26", prior)).toEqual({ due: 21, rollover: 11 });
  });
  it("approval: behaves like none", () => {
    expect(computeDue(10, "approval", "2026-08-26", prior)).toEqual({ due: 10, rollover: 0 });
  });
  it("week keys straddle correctly", () => {
    expect(isoWeekKey("2026-08-24")).toBe(isoWeekKey("2026-08-28"));
    expect(isoWeekKey("2026-08-21")).not.toBe(isoWeekKey("2026-08-24"));
  });
});

describe("targeting", () => {
  it("empty rule matches all; lists filter case-insensitively", () => {
    expect(matchesTargeting({ country: "India" }, null)).toBe(true);
    expect(matchesTargeting({ country: "India" }, {})).toBe(true);
    expect(matchesTargeting({ country: "india" }, { countries: ["India"] })).toBe(true);
    expect(matchesTargeting({ country: "USA" }, { countries: ["India"] })).toBe(false);
    expect(matchesTargeting({ country: "India", city: "Mumbai" }, { countries: ["India"], cities: ["Pune"] })).toBe(false);
  });
});
