// WP-16 · booking pages: configure → availability → activate → public slots (visitor zone) → one-transaction claim →
// lead + task + email + trigger → manage token cancel/reschedule. Calendar off (no scope) ⇒ no Google call.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string; link?: string }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string; link?: string }) => { mail.sent.push(m); return { delivered: true }; } }));

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { availabilitySave, bookingTypeSave, bookingTypeStatus } from "@/app/app/(shell)/settings/booking/actions";
import { POST as bookRoute } from "@/app/api/os/book/[typeId]/route";
import { bookingByToken, cancelBooking, slotsForDay } from "@/lib/os/booking";
import { BLOCKS } from "@/lib/os/automation/catalog";

const tag = `fpb-${Date.now()}`;
let orgId: string, host: string, typeId: string;
const calls: string[] = [];
// a Monday at least 3 days out, inside the 60-day horizon
const nextMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 3); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { calls.push(String(input)); throw new Error(`Unexpected outbound request in a test: ${String(input)}`); });
  delete process.env.GOOGLE_CALENDAR_SCOPES; delete process.env.TURNSTILE_SECRET_KEY;
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  host = (await db.losUser.create({ data: { email: `${tag}-host@example.com`, name: "Host", demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: host, role: "sales_manager" } });
});
afterAll(async () => {
  await db.cosBooking.deleteMany({ where: { orgId } }); await db.cosBookingType.deleteMany({ where: { orgId } }); await db.cosAvailability.deleteMany({ where: { orgId } });
  await db.losTask.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } }); await db.cosMetricSnapshot.deleteMany({ where: { orgId } });
  await db.losConsentEvent.deleteMany({ where: { orgId } }); await db.losActivity.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.losLeadB2c.deleteMany({ where: { lead: { orgId } } }); await db.losLead.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: host } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: host } });
  vi.unstubAllGlobals();
});

const post = (body: Record<string, unknown>, ip = "203.0.113.5") => bookRoute(new NextRequest(`http://app.test/api/os/book/${typeId}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ typeId }) });

describe("WP-16 booking", () => {
  it("create → cannot activate without availability → availability → activate; slots in the visitor zone", async () => {
    await signIn(host, orgId);
    const created = await bookingTypeSave({}, form({ name: "Discovery call", durationMin: "30", bufferMin: "0", timezone: "Asia/Kolkata", questions: "What do you want to discuss? *\nCompany" }));
    expect(created.ok).toMatch(/Draft created/);
    typeId = (await db.cosBookingType.findFirst({ where: { orgId } }))!.id;
    expect((await bookingTypeStatus({}, form({ id: typeId, status: "active" }))).error).toMatch(/availability/);
    expect((await availabilitySave({}, form({ start_1: "10:00", end_1: "12:00", start_3: "09:00", end_3: "09:30" }))).ok).toMatch(/2 day/);
    expect((await bookingTypeStatus({}, form({ id: typeId, status: "active" }))).ok).toMatch(/Live/);
    const type = (await db.cosBookingType.findUniqueOrThrow({ where: { id: typeId } }));
    const ist = await slotsForDay(type, nextMonday, "Asia/Kolkata");
    expect(ist.map((s) => s.startAt.toISOString())).toEqual(["04:30", "05:00", "05:30", "06:00"].map((t) => `${nextMonday}T${t}:00.000Z`)); // 10:00–12:00 IST
    expect(ist[0].label).toMatch(/10:00/);
    const utc = await slotsForDay(type, nextMonday, "UTC");
    expect(utc[0].startAt.toISOString()).toBe(`${nextMonday}T04:30:00.000Z`); expect(utc[0].label).toMatch(/4:30/);
    expect(await slotsForDay(type, nextMonday, "Nope/Zone")).toEqual([]);
    expect(BLOCKS["trigger.booking_created"]).toBeTruthy();
  });

  it("public booking claims the slot once, creates lead + task + email + notification; a second claim is 409; duplicates by requestId", async () => {
    const startAt = `${nextMonday}T04:30:00.000Z`;
    const res = await post({ startAt, visitorTz: "UTC", name: "Priya Nair", email: `${tag}-priya@example.com`, phone: "+919876543210", answers: { what_do_you_want_to_discuss: "SEO" }, consent: true, requestId: "req-aaaaaaaa-1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { manageUrl: string; startAt: string };
    expect(body.startAt).toBe(startAt); expect(body.manageUrl).toMatch(/^http:\/\/app\.test\/app\/b\//);
    const b = (await db.cosBooking.findFirst({ where: { orgId } }))!;
    expect(b.slotKey).toBe(`${host}:${startAt}`); expect(b.leadId).toBeTruthy();
    expect((await db.losLead.findUnique({ where: { id: b.leadId! } }))!.source).toBe("booking");
    expect(await db.losTask.count({ where: { orgId, assigneeId: host, leadId: b.leadId } })).toBe(1);
    expect(mail.sent).toHaveLength(1); expect(mail.sent[0].to).toBe(`${tag}-priya@example.com`); expect(mail.sent[0].text).toContain(body.manageUrl);
    expect(await db.cosNotification.count({ where: { orgId, kind: "booking", userId: host } })).toBe(1);
    expect(calls.filter((u) => u.includes("googleapis.com/calendar"))).toEqual([]); // calendar not approved ⇒ never called
    expect((await db.cosMetricSnapshot.findFirst({ where: { orgId, metric: "booking.bookings" } }))!.value).toBe(1);
    // same slot, another person → 409; same requestId → duplicate, not a second booking
    expect((await post({ startAt, visitorTz: "UTC", name: "Raj", email: `${tag}-raj@example.com`, consent: true, requestId: "req-bbbbbbbb-2" }, "203.0.113.6")).status).toBe(409);
    const dup = await post({ startAt, visitorTz: "UTC", name: "Priya Nair", email: `${tag}-priya@example.com`, consent: true, requestId: "req-aaaaaaaa-1" }, "203.0.113.7");
    expect(((await dup.json()) as { duplicate: boolean }).duplicate).toBe(true);
    expect(await db.cosBooking.count({ where: { orgId } })).toBe(1);
    // required question and consent are enforced
    expect((await post({ startAt: `${nextMonday}T05:00:00.000Z`, visitorTz: "UTC", name: "X", email: `${tag}-x@example.com`, consent: true, requestId: "req-cccccccc-3" }, "203.0.113.8")).status).toBe(400);
    expect((await post({ startAt: `${nextMonday}T05:00:00.000Z`, visitorTz: "UTC", name: "X", email: `${tag}-x@example.com`, answers: { what_do_you_want_to_discuss: "y" }, consent: false, requestId: "req-dddddddd-4" }, "203.0.113.9")).status).toBe(400);
  });

  it("manage token: cancel frees the slot and closes the task; reschedule moves it; paused pages refuse", async () => {
    const startAt = `${nextMonday}T04:30:00.000Z`;
    const token = mail.sent[0].link!.split("/").pop()!;
    const b = (await bookingByToken(typeId, token))!;
    await cancelBooking(typeId, token);
    expect((await db.cosBooking.findUnique({ where: { id: b.id } }))!.slotKey).toBeNull();
    expect((await db.losTask.findFirst({ where: { orgId, leadId: b.leadId } }))!.doneAt).not.toBeNull();
    expect((await post({ startAt, visitorTz: "UTC", name: "Raj", email: `${tag}-raj@example.com`, answers: { what_do_you_want_to_discuss: "ads" }, consent: true, requestId: "req-eeeeeeee-5" }, "203.0.113.10")).status).toBe(200);
    const token2 = mail.sent.at(-1)!.link!.split("/").pop()!;
    const moved = await post({ manageToken: token2, startAt: `${nextMonday}T05:00:00.000Z`, visitorTz: "UTC", requestId: "req-ffffffff-6" }, "203.0.113.11");
    expect(moved.status).toBe(200);
    const live = await db.cosBooking.findMany({ where: { orgId, status: "confirmed" } });
    expect(live).toHaveLength(1); expect(live[0].startAt.toISOString()).toBe(`${nextMonday}T05:00:00.000Z`); expect(live[0].name).toBe("Raj");
    await signIn(host, orgId);
    await bookingTypeStatus({}, form({ id: typeId, status: "paused" }));
    expect((await post({ startAt: `${nextMonday}T04:30:00.000Z`, visitorTz: "UTC", name: "Z", email: `${tag}-z@example.com`, answers: { what_do_you_want_to_discuss: "x" }, consent: true, requestId: "req-gggggggg-7" }, "203.0.113.12")).status).toBe(404);
    expect(await bookingByToken(typeId, "not-a-real-token-value")).toBeNull();
  });
});
