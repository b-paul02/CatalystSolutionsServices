// Pure allocation math: working days, timezone-local dates, quota + rollover.
// Kept separate from the engine so every rule is unit-testable without a DB.

/** "YYYY-MM-DD" for a moment in a specific IANA timezone. */
export function localDateStr(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Local hour (0-23) in a timezone. */
export function localHour(timezone: string, at = new Date()): number {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(at), 10) % 24;
}

/** ISO weekday 1(Mon)..7(Sun) for a "YYYY-MM-DD". */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

export function isWorkingDay(dateStr: string, workingDays: number[], holidays: string[]): boolean {
  return workingDays.includes(isoWeekday(dateStr)) && !holidays.includes(dateStr);
}

export type PlanCalendar = {
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  workingDays: number[];
  holidays: string[];
};

export function isPlanDueOn(cal: PlanCalendar, dateStr: string): boolean {
  if (dateStr < cal.startDate) return false;
  if (cal.endDate && dateStr > cal.endDate) return false;
  return isWorkingDay(dateStr, cal.workingDays, cal.holidays);
}

export type PriorRun = { runDate: string; due: number; allocated: number };

/** ISO week key ("2026-W35") for same-week rollover comparisons. */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 0=Mon
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Quota due today = daily quota + permitted backlog from prior shortfalls.
 * - none: no backlog.
 * - week: only shortfalls from runs in the same ISO week.
 * - campaign_end: every prior shortfall.
 * - approval: like none here; an admin manually adds an extra run when approved.
 */
export function computeDue(
  dailyQuota: number,
  rolloverPolicy: "none" | "week" | "campaign_end" | "approval",
  runDate: string,
  priorRuns: PriorRun[],
): { due: number; rollover: number } {
  let rollover = 0;
  if (rolloverPolicy === "week") {
    const week = isoWeekKey(runDate);
    rollover = priorRuns
      .filter((r) => r.runDate < runDate && isoWeekKey(r.runDate) === week)
      .reduce((sum, r) => sum + Math.max(0, r.due - r.allocated), 0);
  } else if (rolloverPolicy === "campaign_end") {
    rollover = priorRuns
      .filter((r) => r.runDate < runDate)
      .reduce((sum, r) => sum + Math.max(0, r.due - r.allocated), 0);
  }
  return { due: dailyQuota + rollover, rollover };
}

export type TargetingRule = { countries?: string[]; states?: string[]; cities?: string[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Case-insensitive containment; empty/omitted lists match everything. */
export function matchesTargeting(record: { country?: string | null; state?: string | null; city?: string | null }, rule: TargetingRule | null): boolean {
  if (!rule) return true;
  const ok = (list: string[] | undefined, value: string | null | undefined) =>
    !list || list.length === 0 || list.map(norm).includes(norm(value));
  return ok(rule.countries, record.country) && ok(rule.states, record.state) && ok(rule.cities, record.city);
}
