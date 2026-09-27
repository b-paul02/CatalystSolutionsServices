// WP-16 · booking engine: availability → slots (visitor zone) → one-transaction slot claim → lead + task + email +
// workflow trigger + calendar event. Reschedule/cancel through a signed manage token. One host per booking type.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { randomToken, sha256 } from "@/lib/leados/crypto";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { normalizeEmail, normalizePhone } from "@/lib/leados/leads";
import { formatInZone, utcToZonedInput, validTimeZone, zonedToUtc } from "./time";
import { busyTimes, createCalendarEvent, deleteCalendarEvent } from "./calendar";
import { notify } from "./notify";
import { flagOn } from "./flags";
import { assertWritable, WorkError, type WorkActor } from "./work";

export type Question = { key: string; label: string; required: boolean };
export const HORIZON_DAYS = 60, MIN_NOTICE_MIN = 60;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── configuration (Settings → Booking) ───────────────────────────────────────

export async function saveBookingType(actor: WorkActor, input: { id?: string; name: string; description?: string; durationMin: number; bufferMin: number; timezone: string; questions: Question[] }) {
  if (!can(actor.role, "os.settings") && !can(actor.role, "leads.contact")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new WorkError("Name the booking type.");
  const durationMin = Math.max(10, Math.min(240, Math.round(input.durationMin) || 30)), bufferMin = Math.max(0, Math.min(120, Math.round(input.bufferMin) || 0));
  if (!validTimeZone(input.timezone)) throw new WorkError("Unknown time zone.");
  const questions = (input.questions ?? []).slice(0, 8).filter((q) => q && q.label?.trim()).map((q) => ({ key: (q.key || q.label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30), label: q.label.trim().slice(0, 120), required: Boolean(q.required) }));
  const data = { name, description: input.description?.trim().slice(0, 600) || null, durationMin, bufferMin, timezone: input.timezone, questions: JSON.stringify(questions) };
  if (input.id) {
    const existing = await db.cosBookingType.findFirst({ where: { id: input.id, orgId: actor.orgId } });
    if (!existing) throw new WorkError("Booking type not found.");
    if (existing.hostId !== actor.userId && !can(actor.role, "os.settings")) throw new WorkError("Only the host or a settings admin can edit this.");
    return db.cosBookingType.update({ where: { id: existing.id }, data });
  }
  const ws = await db.cosWorkspace.findUnique({ where: { orgId: actor.orgId }, select: { demo: true } });
  return db.cosBookingType.create({ data: { ...data, orgId: actor.orgId, hostId: actor.userId, demo: ws?.demo ?? false } });
}

export async function setBookingTypeStatus(actor: WorkActor, id: string, status: "active" | "paused" | "draft") {
  if (!can(actor.role, "os.settings") && !can(actor.role, "leads.contact")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const t = await db.cosBookingType.findFirst({ where: { id, orgId: actor.orgId } });
  if (!t) throw new WorkError("Booking type not found.");
  if (status === "active") {
    if (!(await flagOn("booking", actor.orgId))) throw new WorkError("Booking pages are switched off by the Catalyst team at the moment.");
    if ((await db.cosAvailability.count({ where: { orgId: actor.orgId, userId: t.hostId } })) === 0) throw new WorkError("Add the host's weekly availability before going live.");
  }
  await db.cosBookingType.update({ where: { id: t.id }, data: { status } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `booking_type.${status}`, entity: "CosBookingType", entityId: t.id });
}

/** Replace the signed-in member's weekly availability (rows are HH:MM in the booking type zone). */
export async function saveAvailability(actor: WorkActor, rows: { weekday: number; start: string; end: string }[]) {
  await assertWritable(actor.orgId);
  const clean = rows.filter((r) => Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 && HHMM.test(r.start) && HHMM.test(r.end) && r.start < r.end).slice(0, 21);
  await db.$transaction([db.cosAvailability.deleteMany({ where: { orgId: actor.orgId, userId: actor.userId } }), ...(clean.length ? [db.cosAvailability.createMany({ data: clean.map((r) => ({ ...r, orgId: actor.orgId, userId: actor.userId })) })] : [])]);
  return clean.length;
}

// ── slots ────────────────────────────────────────────────────────────────────

export type Slot = { startAt: Date; endAt: Date; label: string };

/** Free slots for a day (visitor's calendar day in `visitorTz`), stepping duration+buffer inside the host's availability. */
export async function slotsForDay(type: { id: string; orgId: string; hostId: string; durationMin: number; bufferMin: number; timezone: string }, day: string, visitorTz: string, now = new Date()): Promise<Slot[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !validTimeZone(visitorTz)) return [];
  const avail = await db.cosAvailability.findMany({ where: { orgId: type.orgId, userId: type.hostId } });
  // the visitor's day spans up to two host-zone days: compute host-day windows for day-1 … day+1 and keep what falls inside
  const dayStart = zonedToUtc(`${day}T00:00`, visitorTz).utc, dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const step = (type.durationMin + type.bufferMin) * 60_000, dur = type.durationMin * 60_000;
  const candidates: Date[] = [];
  for (let d = -1; d <= 1; d++) {
    const hostDay = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + d));
    const iso = hostDay.toISOString().slice(0, 10), weekday = hostDay.getUTCDay();
    for (const a of avail.filter((x) => x.weekday === weekday)) {
      const s = zonedToUtc(`${iso}T${a.start}`, type.timezone).utc, e = zonedToUtc(`${iso}T${a.end}`, type.timezone).utc;
      for (let t = s.getTime(); t + dur <= e.getTime(); t += step) candidates.push(new Date(t));
    }
  }
  const earliest = new Date(now.getTime() + MIN_NOTICE_MIN * 60_000), latest = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const inDay = candidates.filter((t) => t >= dayStart && t < dayEnd && t >= earliest && t <= latest);
  if (inDay.length === 0) return [];
  const [taken, busy] = await Promise.all([
    db.cosBooking.findMany({ where: { hostId: type.hostId, status: "confirmed", startAt: { lt: dayEnd }, endAt: { gt: dayStart } }, select: { startAt: true, endAt: true } }),
    busyTimes(type.orgId, dayStart, dayEnd),
  ]);
  const blocked = [...taken, ...busy.map((b) => ({ startAt: b.start, endAt: b.end }))];
  return [...new Map(inDay.map((t) => [t.getTime(), t])).values()].sort((a, b) => a.getTime() - b.getTime())
    .filter((t) => !blocked.some((b) => t < b.endAt && new Date(t.getTime() + dur) > b.startAt))
    .map((t) => ({ startAt: t, endAt: new Date(t.getTime() + dur), label: formatInZone(t, visitorTz, { timeStyle: "short" }) }));
}

// ── booking ──────────────────────────────────────────────────────────────────

export type BookInput = { typeId: string; startAt: string; visitorTz: string; name: string; email: string; phone?: string; answers?: Record<string, string>; consent: boolean; requestId: string };
export type BookResult = { ok: true; booking: { id: string; startAt: Date; endAt: Date; manageUrl: string }; duplicate: boolean } | { ok: false; error: string; status: 400 | 404 | 409 };

const manageUrl = (typeId: string, token: string) => `${APP_URL}/b/${typeId}/manage/${token}`;

export async function createBooking(input: BookInput): Promise<BookResult> {
  const type = await db.cosBookingType.findFirst({ where: { id: input.typeId, status: "active" } });
  if (!type) return { ok: false, error: "This booking page is not available.", status: 404 };
  if (!(await flagOn("booking", type.orgId))) return { ok: false, error: "Booking is paused at the moment.", status: 404 };
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.requestId)) return { ok: false, error: "Bad request.", status: 400 };
  const again = await db.cosBooking.findUnique({ where: { requestId: input.requestId } });
  if (again) return { ok: true, booking: { id: again.id, startAt: again.startAt, endAt: again.endAt, manageUrl: "" }, duplicate: true };
  const name = input.name.trim().slice(0, 120), email = normalizeEmail(input.email), phone = normalizePhone(input.phone ?? "");
  if (!name || !email) return { ok: false, error: "Your name and a valid email are required.", status: 400 };
  if (!input.consent) return { ok: false, error: "Please agree to be contacted about this booking.", status: 400 };
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) return { ok: false, error: "Pick a time.", status: 400 };
  const tz = validTimeZone(input.visitorTz) ? input.visitorTz : type.timezone;
  const day = utcToZonedInput(startAt, tz).slice(0, 10); // the visitor-local calendar day the slot belongs to
  const slots = await slotsForDay(type, day, tz);
  const slot = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!slot) return { ok: false, error: "That time is no longer available — pick another.", status: 409 };
  const questions = JSON.parse(type.questions) as Question[];
  const answers: Record<string, string> = {};
  for (const q of questions) { const v = String(input.answers?.[q.key] ?? "").trim().slice(0, 500); if (q.required && !v) return { ok: false, error: `${q.label} is required.`, status: 400 }; if (v) answers[q.key] = v; }
  const token = randomToken(24);
  let booking;
  try {
    booking = await db.cosBooking.create({ data: { orgId: type.orgId, typeId: type.id, hostId: type.hostId, startAt: slot.startAt, endAt: slot.endAt, slotKey: `${type.hostId}:${slot.startAt.toISOString()}`, requestId: input.requestId, name, email, phone, answers: JSON.stringify(answers), tokenHash: sha256(token), visitorTz: tz, demo: type.demo } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") { const dup = await db.cosBooking.findUnique({ where: { requestId: input.requestId } }); if (dup) return { ok: true, booking: { id: dup.id, startAt: dup.startAt, endAt: dup.endAt, manageUrl: "" }, duplicate: true }; return { ok: false, error: "That time was just taken — pick another.", status: 409 }; }
    throw e;
  }
  await afterBooking(type, booking, token, answers).catch(() => undefined); // the slot is claimed; side effects must not undo it
  return { ok: true, booking: { id: booking.id, startAt: booking.startAt, endAt: booking.endAt, manageUrl: manageUrl(type.id, token) }, duplicate: false };
}

async function afterBooking(type: { id: string; orgId: string; hostId: string; name: string; timezone: string; demo: boolean }, b: { id: string; name: string; email: string; phone: string | null; startAt: Date; endAt: Date; visitorTz: string | null }, token: string, answers: Record<string, string>) {
  // identity match → lead (B2C, consent recorded through the lawful-use ledger; purpose sales_contact, channels email + call)
  const { createLead } = await import("@/lib/leados/leadWrite");
  const [firstName, ...rest] = b.name.split(/\s+/);
  const lead = await createLead({ orgId: type.orgId, leadType: "b2c", source: "booking", sourceRef: type.id, input: { firstName, lastName: rest.join(" ") || undefined, email: b.email, phone: b.phone ?? undefined }, lawfulUse: { purposes: ["sales_contact", "service_updates"], channels: ["email", "call", ...(b.phone ? ["whatsapp"] : [])], noticeVersion: "booking-v1", evidenceNote: `Booked "${type.name}"` }, verify: false, demo: type.demo });
  const leadId = lead.outcome === "invalid" ? null : lead.leadId;
  const when = formatInZone(b.startAt, type.timezone);
  await db.cosBooking.update({ where: { id: b.id }, data: { leadId } });
  await db.losTask.create({ data: { orgId: type.orgId, leadId, assigneeId: type.hostId, title: `${type.name} with ${b.name} — ${when}`, kind: "call", dueAt: b.startAt, createdById: type.hostId, demo: type.demo } });
  const eventId = await createCalendarEvent(type.orgId, { summary: `${type.name}: ${b.name}`, description: `Booked through CatalystGrowthOS.${Object.keys(answers).length ? `\n${Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join("\n")}` : ""}`, start: b.startAt, end: b.endAt, attendeeEmail: b.email });
  if (eventId) await db.cosBooking.update({ where: { id: b.id }, data: { calendarEventId: eventId } });
  const link = manageUrl(type.id, token);
  await sendLosMail({ to: b.email, subject: `Confirmed: ${type.name} on ${formatInZone(b.startAt, b.visitorTz ?? type.timezone)}`, text: `Hi ${firstName},\n\nYour ${type.name} is booked for ${formatInZone(b.startAt, b.visitorTz ?? type.timezone)} (${b.visitorTz ?? type.timezone}).\n\nNeed to change it? Reschedule or cancel here:\n${link}\n\nSee you then.`, link });
  await notify({ orgId: type.orgId, userId: type.hostId, audience: "client", kind: "booking", title: `New booking: ${b.name} — ${when}`, body: type.name, href: leadId ? `/app/leads/${leadId}` : "/app/tasks", dedupeKey: `booking:${b.id}` });
  await import("./automation/engine").then(({ dispatchEvent }) => dispatchEvent(type.orgId, "trigger.booking_created", { leadId, bookingId: b.id, typeId: type.id, typeName: type.name, startAt: b.startAt.toISOString(), answers }, `booking_created:${b.id}`)).catch(() => undefined);
  await logLosAudit({ orgId: type.orgId, actorType: "system", action: "booking.created", entity: "CosBooking", entityId: b.id, data: { typeId: type.id, leadId } });
  await recordBookingDay(type.orgId, type.demo);
}

/** Results row: confirmed bookings made today (recomputed, idempotent). */
export async function recordBookingDay(orgId: string, demo: boolean, now = new Date()) {
  const day = now.toISOString().slice(0, 10), start = new Date(`${day}T00:00:00.000Z`), end = new Date(start.getTime() + 86_400_000);
  const n = await db.cosBooking.count({ where: { orgId, status: "confirmed", createdAt: { gte: start, lt: end } } });
  const { upsertSnapshot } = await import("./metrics");
  await upsertSnapshot(orgId, { provider: "booking", metric: "booking.bookings", kind: "daily", value: n, day, grade: "A", demo });
}

/** The booking behind a manage token (from the confirmation email). */
export async function bookingByToken(typeId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return null;
  const b = await db.cosBooking.findUnique({ where: { tokenHash: sha256(token) } });
  return b && b.typeId === typeId ? b : null;
}

export async function cancelBooking(typeId: string, token: string, by: "visitor" | "host" = "visitor") {
  const b = await bookingByToken(typeId, token);
  if (!b) throw new WorkError("This link is not valid.");
  if (b.status === "cancelled") return b;
  const updated = await db.cosBooking.update({ where: { id: b.id }, data: { status: "cancelled", slotKey: null, cancelledAt: new Date() } });
  if (b.calendarEventId) await deleteCalendarEvent(b.orgId, b.calendarEventId);
  await db.losTask.updateMany({ where: { orgId: b.orgId, leadId: b.leadId ?? "-", dueAt: b.startAt, doneAt: null }, data: { doneAt: new Date() } });
  await notify({ orgId: b.orgId, userId: b.hostId, audience: "client", kind: "booking", title: `Booking cancelled by ${by}: ${b.name}`, href: b.leadId ? `/app/leads/${b.leadId}` : "/app/tasks", dedupeKey: `booking-cancel:${b.id}` });
  await logLosAudit({ orgId: b.orgId, actorType: "system", action: "booking.cancelled", entity: "CosBooking", entityId: b.id, data: { by } });
  return updated;
}

/** Reschedule = cancel + a fresh booking for the new slot (same person, new token), in that order so the old slot frees first. */
export async function rescheduleBooking(typeId: string, token: string, startAt: string, visitorTz: string, requestId: string): Promise<BookResult> {
  const b = await bookingByToken(typeId, token);
  if (!b || b.status === "cancelled") return { ok: false, error: "This link is not valid.", status: 404 };
  const answers = b.answers ? (JSON.parse(b.answers) as Record<string, string>) : {};
  await cancelBooking(typeId, token, "visitor");
  return createBooking({ typeId, startAt, visitorTz, name: b.name, email: b.email, phone: b.phone ?? undefined, answers, consent: true, requestId });
}
