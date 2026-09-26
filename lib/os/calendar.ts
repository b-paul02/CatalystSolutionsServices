// WP-16 · Google Calendar through the existing Google OAuth connection (provider "gsc"). Enabled only when the owner has
// added the calendar scopes to the consent screen and set GOOGLE_CALENDAR_SCOPES=1 (Connections card says "Awaiting
// approval" until then). Busy times + event creation; nothing else. Failures never block a booking.
import { db } from "@/lib/audit/db";

export const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
export const calendarEnabled = (): boolean => Boolean(process.env.GOOGLE_CALENDAR_SCOPES);

async function calendarToken(orgId: string): Promise<string | null> {
  if (!calendarEnabled()) return null;
  const conn = await db.cosConnection.findFirst({ where: { orgId, provider: "gsc", status: "verified" }, orderBy: { createdAt: "asc" } });
  if (!conn || !(conn.scopes ?? "").includes("calendar")) return null;
  const { accessToken } = await import("./connectors");
  try { return await accessToken(orgId, "gsc", conn.id); } catch { return null; }
}

export type Busy = { start: Date; end: Date };

/** Busy intervals of the primary calendar of the connected Google account. Empty when not connected. */
export async function busyTimes(orgId: string, from: Date, to: Date): Promise<Busy[]> {
  const token = await calendarToken(orgId);
  if (!token) return [];
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    return (j.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch { return []; }
}

/** Create the event (attendee = the visitor). Returns the event id, or null when calendar is off / failed. */
export async function createCalendarEvent(orgId: string, ev: { summary: string; description: string; start: Date; end: Date; attendeeEmail: string }): Promise<string | null> {
  const token = await calendarToken(orgId);
  if (!token) return null;
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ summary: ev.summary, description: ev.description, start: { dateTime: ev.start.toISOString() }, end: { dateTime: ev.end.toISOString() }, attendees: [{ email: ev.attendeeEmail }] }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch { return null; }
}

export async function deleteCalendarEvent(orgId: string, eventId: string): Promise<void> {
  const token = await calendarToken(orgId);
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
