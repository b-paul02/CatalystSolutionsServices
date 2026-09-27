// Workspace time. Storage is always UTC; a workspace has an IANA zone used to ENTER
// and DISPLAY times. Pure (Intl only) so it runs in the browser and in tests.

export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Offset (minutes east of UTC) that `tz` observes at the given instant. */
export function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export type ZonedResult = { utc: Date; note: null | "gap_shifted_forward" | "ambiguous_first_used" };

/**
 * "2026-03-08T02:30" typed in a zone → the UTC instant.
 * DST: a wall time that does not exist (spring forward) moves forward by the gap; a wall time
 * that happens twice (fall back) uses the FIRST occurrence. Both cases are reported, never silent.
 */
export function zonedToUtc(local: string, tz: string): ZonedResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error("Enter a date and time.");
  if (!validTimeZone(tz)) throw new Error("Unknown time zone.");
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // candidate instants using the offsets in force a day either side of the wall time
  const offsets = [...new Set([offsetMinutes(new Date(wall - 86_400_000), tz), offsetMinutes(new Date(wall + 86_400_000), tz)])];
  const matches = offsets.map((o) => wall - o * 60_000).filter((t) => offsetMinutes(new Date(t), tz) === (wall - t) / 60_000).sort((a, b) => a - b);
  if (matches.length === 1) return { utc: new Date(matches[0]), note: null };
  if (matches.length > 1) return { utc: new Date(matches[0]), note: "ambiguous_first_used" };
  // gap: no instant shows this wall time — use the pre-transition offset, which lands just after the jump
  return { utc: new Date(wall - Math.min(...offsets) * 60_000), note: "gap_shifted_forward" };
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in the zone (for datetime-local inputs). */
export function utcToZonedInput(at: Date, tz: string): string {
  const shifted = new Date(at.getTime() + offsetMinutes(at, tz) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function formatInZone(at: Date, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: validTimeZone(tz) ? tz : "UTC", ...opts }).format(at);
}

/** Calendar day (YYYY-MM-DD) an instant falls on in the zone. */
export const zonedDay = (at: Date, tz: string): string => utcToZonedInput(at, tz).slice(0, 10);

/** [start, end) of a reporting period in the workspace zone, as UTC instants. */
export function periodBounds(period: "week" | "month" | "last30", tz: string, now = new Date()): { start: Date; end: Date; label: string } {
  const today = zonedDay(now, tz);
  const [y, mo, d] = today.split("-").map(Number);
  const at = (yy: number, mm: number, dd: number) => zonedToUtc(`${new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10)}T00:00`, tz).utc;
  if (period === "month") return { start: at(y, mo, 1), end: at(y, mo + 1, 1), label: `${today.slice(0, 7)} (${tz})` };
  if (period === "week") {
    const dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
    return { start: at(y, mo, d - dow), end: at(y, mo, d - dow + 7), label: `week of ${new Date(Date.UTC(y, mo - 1, d - dow)).toISOString().slice(0, 10)} (${tz})` };
  }
  return { start: at(y, mo, d - 29), end: at(y, mo, d + 1), label: `last 30 days to ${today} (${tz})` };
}

export const COMMON_ZONES = ["UTC", "Asia/Kolkata", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];
