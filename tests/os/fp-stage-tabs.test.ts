// Stage tabs on the engagement page: visits per stage are derived from the append-only stage events.
import { describe, expect, it } from "vitest";
import { ENGAGEMENT_STAGES, STAGE_ABOUT, stageVisits } from "@/lib/os/engagement";

const d = (n: number) => new Date(Date.UTC(2026, 8, n));
const mv = (from: string, to: string, day: number) => ({ kind: "stage", fromValue: from, toValue: to, createdAt: d(day) });

describe("stage tabs", () => {
  it("every stage has plain-language copy", () => {
    for (const s of ENGAGEMENT_STAGES) { expect(STAGE_ABOUT[s].what.length).toBeGreaterThan(10); expect(STAGE_ABOUT[s].next.length).toBeGreaterThan(5); }
  });
  it("derives entered / left per stage, handles revisits, skips and unordered input", () => {
    const events = [mv("review", "active", 20), mv("prospect", "proposal", 3), { kind: "hold", fromValue: "none", toValue: "paused", createdAt: d(11) }, mv("proposal", "accepted", 5), mv("accepted", "onboarding", 6), mv("onboarding", "active", 10), mv("active", "review", 15)];
    const v = stageVisits(d(1), "active", events);
    expect(v.prospect).toEqual([{ enteredAt: d(1), leftAt: d(3) }]);
    expect(v.discovery).toBeUndefined(); // skipped
    expect(v.active).toEqual([{ enteredAt: d(10), leftAt: d(15) }, { enteredAt: d(20), leftAt: null }]);
    expect(v.review).toEqual([{ enteredAt: d(15), leftAt: d(20) }]);
    expect(v.completed).toBeUndefined(); // not reached
  });
  it("an engagement with no moves has been in its current stage since it was created", () => {
    expect(stageVisits(d(1), "active", [])).toEqual({ active: [{ enteredAt: d(1), leftAt: null }] });
  });
});
