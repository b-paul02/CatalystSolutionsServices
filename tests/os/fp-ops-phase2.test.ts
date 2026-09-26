// WP-28 widget layout + monthly report grouped by pillar + monthly mail once · WP-29 uptime monitors (3 failures →
// one alert, recovery) · WP-30 Pipedrive/Zoho runners (stubbed) + T33 · WP-31 sending domain, From address, bounce
// webhook → suppression.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string; from?: string | null; tags?: Record<string, string> }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string; from?: string | null; tags?: Record<string, string> }) => { mail.sent.push(m); return { delivered: true }; } }));

import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { encryptField } from "@/lib/leados/crypto";
import { form, signIn } from "./entry-harness";
import { getLayout, monthlyReport, monthlyReportMail, WIDGETS } from "@/lib/os/reports";
import { widgetSet } from "@/app/app/(shell)/_os/v2";
import { checkMonitor, tickMonitors } from "@/lib/os/monitors";
import { monitorAdd } from "@/app/app/(shell)/settings/monitoring/actions";
import { RUNNERS, testKeyConnection } from "@/lib/os/automation/blocks";
import { BLOCKS, KEY_PROVIDERS } from "@/lib/os/automation/catalog";
import { TEMPLATES } from "@/lib/os/automation/templates";
import { addSendingDomain, checkSendingDomain, handleResendEvent, senderFor, verifyResendWebhook } from "@/lib/os/emailDomain";
import { POST as resendHook } from "@/app/api/resend/webhook/route";
import { isSuppressed, contactHashes } from "@/lib/leados/suppression";

const tag = `fp2-${Date.now()}`;
let orgId: string, owner: string, care: string;
let siteUp = true;
const calls: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(url);
    if (url.startsWith("https://www.monitored.test")) { if (!siteUp) throw new DOMException("t", "TimeoutError"); return new Response(null, { status: 200 }); }
    if (url.includes("pipedrive.com/api/v1/users/me")) return Response.json({ data: { name: "Asha" } });
    if (url.includes("pipedrive.com/api/v1/persons/search")) return Response.json({ data: { items: url.includes("known%40") ? [{ item: { id: 77 } }] : [] } });
    if (url.includes("pipedrive.com/api/v1/persons/77")) return Response.json({ data: { id: 77 } });
    if (url.includes("pipedrive.com/api/v1/persons")) return Response.json({ data: { id: 78 } });
    if (url.includes("zohoapis")) return Response.json({ data: [{ action: "insert", details: { id: "z1" } }] });
    if (url === "https://api.resend.com/domains") return Response.json({ id: "dom_1", records: [{ type: "TXT", name: "resend._domainkey", value: "p=abc" }] });
    if (url === "https://api.resend.com/domains/dom_1/verify") return Response.json({});
    if (url === "https://api.resend.com/domains/dom_1") return Response.json({ status: "verified", records: [{ type: "TXT", name: "resend._domainkey", value: "p=abc", status: "verified" }] });
    throw new Error(`Unexpected outbound request in a test: ${url} ${init?.method ?? ""}`);
  });
  process.env.RESEND_API_KEY = "re_x"; process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("secret-bytes").toString("base64")}`;
  orgId = (await db.losOrg.create({ data: { name: `${tag} Clinic`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["website"]), modules: JSON.stringify(["results", "content"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: owner, role: "owner" } });
  care = (await db.cosWorkItem.create({ data: { orgId, title: "Website care: updates, backups, uptime and fixes", type: "task", templateKey: "care", state: "in_progress", demo: true } })).id;
  await db.cosGoal.create({ data: { orgId, metric: "sessions", pillar: "digital_presence", target: 500, unit: "per month", horizon: "90 days", agreedAt: new Date() } });
  await db.cosConnection.createMany({ data: [{ orgId, provider: "pipedrive", status: "verified", accessTokenEnc: encryptField("tok|acme") }, { orgId, provider: "zoho", status: "verified", accessTokenEnc: encryptField("1000.x|https://www.zohoapis.in") }] });
});
afterAll(async () => {
  await db.cosMonitor.deleteMany({ where: { orgId } }); await db.cosReportLayout.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } }); await db.cosWorkEvent.deleteMany({ where: { orgId } });
  await db.cosHeartbeat.deleteMany({ where: { key: { startsWith: `os.monthly_report:${orgId}` } } }); await db.cosGoal.deleteMany({ where: { orgId } }); await db.cosWorkItem.deleteMany({ where: { orgId } }); await db.cosConnection.deleteMany({ where: { orgId } });
  await db.losSuppressionEntry.deleteMany({ where: { OR: [{ orgId }, { note: { contains: "Resend email.bounced" }, contactHash: { in: contactHashes(`${tag}-bounce@example.com`, null) } }] } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: owner } }); await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: owner } });
  delete process.env.RESEND_API_KEY; delete process.env.RESEND_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

describe("WP-28 widgets + monthly report", () => {
  it("layout hide/reorder is per workspace; the monthly report groups facts by pillar and drops hidden widgets; the mail goes once", async () => {
    await signIn(owner, orgId);
    expect((await widgetSet({}, form({ key: "ai", op: "hide" }))).error).toBeUndefined();
    expect((await widgetSet({}, form({ key: "website", op: "up" }))).error).toBeUndefined();
    const layout = await getLayout(orgId);
    expect(layout.find((l) => l.key === "ai")!.hidden).toBe(true);
    expect(layout.findIndex((l) => l.key === "website")).toBe(WIDGETS.findIndex((w) => w.key === "website") - 1);
    const r = await monthlyReport(orgId, "2026-09", "UTC", true);
    expect(r.sections.map((s) => s.pillar)).toEqual(["market_intelligence", "client_acquisition", "digital_visibility", "digital_presence", "business_operations"]);
    const presence = r.sections.find((s) => s.pillar === "digital_presence")!;
    expect(presence.goals[0]).toMatchObject({ metric: "sessions", target: 500 });
    expect(presence.facts.find((f) => f.label === "Website sessions")!.value).toBeNull(); // absent, not 0
    expect(r.sections.find((s) => s.pillar === "business_operations")!.facts.some((f) => f.label === "AI calls")).toBe(false); // hidden widget
    expect(r.limitations[0]).toMatch(/never zero/);
    mail.sent.length = 0;
    const now = new Date(Date.UTC(2026, 9, 3));
    expect(await monthlyReportMail(now)).toBeGreaterThanOrEqual(1);
    const mine = mail.sent.filter((m) => m.to === `${tag}-owner@example.com`);
    expect(mine).toHaveLength(1); expect(mine[0].text).toContain("/reports/print?month=2026-09");
    await monthlyReportMail(now);
    expect(mail.sent.filter((m) => m.to === `${tag}-owner@example.com`)).toHaveLength(1);
  });
});

describe("WP-29 monitors", () => {
  it("three failures raise one site_down (client + staff + care-plan note); recovery raises site_up; internal URLs refused", async () => {
    await signIn(owner, orgId);
    expect((await monitorAdd({}, form({ url: "http://127.0.0.1:3000", everyMin: "5" }))).error).toBeTruthy();
    expect((await monitorAdd({}, form({ url: "https://www.monitored.test/", everyMin: "5" }))).ok).toMatch(/Monitor added/);
    const m = (await db.cosMonitor.findFirst({ where: { orgId } }))!;
    expect((await checkMonitor(m.id))?.ok).toBe(true);
    siteUp = false;
    for (let i = 0; i < 3; i++) await checkMonitor(m.id, new Date(Date.now() + i * 60_000));
    expect(await db.cosNotification.count({ where: { orgId, kind: "site_down" } })).toBe(2); // client + staff, once
    expect((await db.cosMonitor.findUniqueOrThrow({ where: { id: m.id } })).lastStatus).toBe("down");
    await checkMonitor(m.id); // fourth failure: no second alert
    expect(await db.cosNotification.count({ where: { orgId, kind: "site_down" } })).toBe(2);
    expect(await db.cosWorkEvent.count({ where: { workItemId: care, kind: "comment" } })).toBe(1);
    siteUp = true;
    await checkMonitor(m.id);
    expect(await db.cosNotification.count({ where: { orgId, kind: "site_up" } })).toBe(2);
    expect((await db.cosMonitor.findUniqueOrThrow({ where: { id: m.id } }))).toMatchObject({ lastStatus: "ok", failures: 0, alertedAt: null });
    expect(await tickMonitors(new Date(Date.now() + 10 * 60_000))).toBeGreaterThanOrEqual(1);
  });
});

describe("WP-30 CRM blocks", () => {
  it("Pipedrive searches then adds/updates; Zoho upserts by email; both are external blocks with key connections; T33 maps a webhook to a lead", async () => {
    const env = { orgId, workflowId: "wf", actorId: owner, depth: 0, demo: true, leadId: null, setLeadId: () => {}, getState: () => ({}), setState: async () => {} };
    expect(await RUNNERS["pipedrive.upsert_person"]({ email: "known@x.test", name: "K" }, env)).toEqual({ personId: 77, created: false });
    expect(await RUNNERS["pipedrive.upsert_person"]({ email: "new@x.test", name: "N", phone: "+91" }, env)).toEqual({ personId: 78, created: true });
    expect(await RUNNERS["zoho.upsert_contact"]({ email: "z@x.test", lastName: "Z" }, env)).toEqual({ contactId: "z1", created: true });
    expect(BLOCKS["pipedrive.upsert_person"].external && BLOCKS["zoho.upsert_contact"].external).toBe(true);
    expect(KEY_PROVIDERS.pipedrive && KEY_PROVIDERS.zoho).toBeTruthy();
    expect(await testKeyConnection("pipedrive", "tok|acme")).toBe("Asha @ acme");
    await expect(testKeyConnection("zoho", "nope")).rejects.toThrow(/access token/);
    const t = TEMPLATES.find((x) => x.key === "T33")!;
    expect(t.definition.nodes.map((n) => n.type)).toEqual(["trigger.webhook", "crm.create_lead", "crm.create_task"]);
  });
});

describe("WP-31 sending domain", () => {
  it("add shows DNS records, check verifies, From becomes the workspace domain; bounce webhook suppresses; bad signature refused", async () => {
    const actor = { orgId, userId: owner, role: "owner" };
    expect(await senderFor(orgId)).toBeNull();
    const added = await addSendingDomain(actor, "Mail.Clinic.Test");
    expect(added.records[0]).toMatchObject({ type: "TXT" });
    expect((await checkSendingDomain(actor)).status).toBe("verified");
    expect(await senderFor(orgId)).toBe(`${tag} Clinic <hello@mail.clinic.test>`);
    await expect(addSendingDomain({ ...actor, role: "sales_rep" }, "x.test")).rejects.toThrow("Forbidden.");
    // webhook
    const raw = JSON.stringify({ type: "email.bounced", data: { to: [`${tag}-bounce@example.com`], bounce: { type: "Permanent" }, tags: [{ name: "orgId", value: orgId }] } });
    const ts = String(Math.floor(Date.now() / 1000)), id = "msg_1";
    const sig = `v1,${createHmac("sha256", Buffer.from("secret-bytes")).update(`${id}.${ts}.${raw}`).digest("base64")}`;
    expect(verifyResendWebhook(raw, { id, timestamp: ts, signature: sig })).toBe(true);
    expect(verifyResendWebhook(raw, { id, timestamp: ts, signature: "v1,bad" })).toBe(false);
    const res = await resendHook(new NextRequest("http://app.test/api/resend/webhook", { method: "POST", headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig }, body: raw }));
    expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ applied: true, reason: "hard_bounce", orgId });
    expect(await isSuppressed(contactHashes(`${tag}-bounce@example.com`, null), orgId)).toBe(true);
    expect((await handleResendEvent({ type: "email.bounced", data: { to: "soft@x.test", bounce: { type: "Transient" } } })).applied).toBe(false);
    expect((await resendHook(new NextRequest("http://app.test/api/resend/webhook", { method: "POST", headers: { "svix-signature": "v1,nope" }, body: raw }))).status).toBe(400);
  });
});
