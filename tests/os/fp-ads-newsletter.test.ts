// WP-25 ad metric sync (Meta insights fixture; Google gated), WP-26 newsletter channel (consent-decided audience through
// sendOutreachMessage), WP-27 generators through parseJsonOutput (malformed JSON = validation failure, never a draft).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string }) => { mail.sent.push(m); return { delivered: true }; } }));

import { db } from "@/lib/audit/db";
import { encryptField } from "@/lib/leados/crypto";
import { createLead } from "@/lib/leados/leadWrite";
import { adsSummary, enqueueAdsSyncs, syncGoogleAds, syncMetaAds } from "@/lib/os/adsSync";
import { ensureResendConnection, newsletterAudience, publishNewsletter } from "@/lib/os/newsletter";
import { adapterFor } from "@/lib/os/adapters";
import { CHANNELS } from "@/lib/os/channels";
import { AiOutputError, draftContent, generateCalendar } from "@/lib/os/ai";
import { setMxResolverForTests } from "@/lib/leados/contactCheck";

process.env.LLM_API_KEY = "test-only";
const tag = `fan-${Date.now()}`;
let orgId: string, metaConn: string;
let llmContent: string = "";

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/insights?level=campaign")) return Response.json({ data: [
      { campaign_id: "c1", campaign_name: "Spring leads", date_start: "2026-09-20", spend: "1200.50", clicks: "340", account_currency: "INR", actions: [{ action_type: "lead", value: "12" }, { action_type: "link_click", value: "340" }] },
      { campaign_id: "c1", campaign_name: "Spring leads", date_start: "2026-09-21", spend: "800.00", clicks: "210", account_currency: "INR", actions: [{ action_type: "lead", value: "7" }] },
      { campaign_id: "c2", campaign_name: "Brand", date_start: "2026-09-21", spend: "50.00", clicks: "20", account_currency: "USD", actions: [] },
    ] });
    if (url.endsWith("/chat/completions")) return Response.json({ id: "x", choices: [{ message: { content: llmContent } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    throw new Error(`Unexpected outbound request in a test: ${url}`);
  });
  process.env.RESEND_API_KEY = "re_test";
  setMxResolverForTests(async () => [{ exchange: "mx.example.com" }]); // WP-15 check runs before every send; no real DNS in tests
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  metaConn = (await db.cosConnection.create({ data: { orgId, provider: "meta", accountType: "ad_account", externalAccountId: "act_123", status: "verified", capabilities: ["ads"], accessTokenEnc: encryptField("tok"), scopes: "ads_read" } })).id;
});
afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: "os.ads_sync" } });
  await db.cosMetricSnapshot.deleteMany({ where: { orgId } }); await db.cosConnection.deleteMany({ where: { orgId } }); await db.cosAiUsage.deleteMany({ where: { orgId } });
  await db.losOutboundMessage.deleteMany({ where: { orgId } }); await db.losActivity.deleteMany({ where: { orgId } }); await db.losConsentEvent.deleteMany({ where: { orgId } }); await db.losVerificationEvent.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.losContactCheck.deleteMany({ where: { checkedAt: { gte: new Date(Date.now() - 600_000) }, provider: "syntax+list" } });
  await db.losLeadB2c.deleteMany({ where: { lead: { orgId } } }); await db.losLead.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losOrg.deleteMany({ where: { id: orgId } });
  delete process.env.RESEND_API_KEY; delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  vi.unstubAllGlobals();
});

describe("WP-25 ads sync", () => {
  it("Meta insights → daily snapshots per campaign per currency, idempotent; Google skipped without the developer token; jobs enqueued once per day", async () => {
    expect(await syncMetaAds(orgId, metaConn)).toBe(3);
    expect(await syncMetaAds(orgId, metaConn)).toBe(3);
    const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, provider: "meta_ads" } });
    expect(rows).toHaveLength(9); // 3 rows × 3 metrics, not doubled
    expect(rows.filter((r) => r.metric === "spend").every((r) => r.paidMode === "paid" && r.currency)).toBe(true);
    const sum = await adsSummary(orgId, { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") }, true);
    const spring = sum.find((s) => s.campaign === "Spring leads")!;
    expect(spring).toMatchObject({ provider: "meta_ads", clicks: 550, conversions: 19, days: 2 }); expect(spring.spend).toEqual({ INR: 2000.5 });
    expect(sum.find((s) => s.campaign === "Brand")!.spend).toEqual({ USD: 50 }); // currencies never blended
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    expect(await syncGoogleAds(orgId, metaConn)).toBe(0);
    await enqueueAdsSyncs(); await enqueueAdsSyncs();
    expect(await db.losJob.count({ where: { type: "os.ads_sync", payload: { contains: metaConn } } })).toBe(1);
  });
});

describe("WP-26 newsletter", () => {
  it("audience is decided per lead at send time (purpose newsletter + email); sends go through the outreach ledger with an unsubscribe link", async () => {
    const yes = await createLead({ orgId, leadType: "b2c", source: "form", input: { firstName: "Y", email: `${tag}-yes@example.com`, phone: "+919876500011" }, lawfulUse: { purposes: ["newsletter"], channels: ["email"], noticeVersion: "v1" }, verify: false, demo: true });
    const no = await createLead({ orgId, leadType: "b2c", source: "form", input: { firstName: "N", email: `${tag}-no@example.com`, phone: "+919876500012" }, lawfulUse: { purposes: ["sales_contact"], channels: ["email"], noticeVersion: "v1" }, verify: false, demo: true });
    if (yes.outcome === "invalid" || no.outcome === "invalid") throw new Error("lead");
    const audience = await newsletterAudience(orgId);
    expect(audience.map((a) => a.leadId)).toEqual([yes.leadId]);
    expect(CHANNELS.email.formats.newsletter.titleRequired).toBe(true); expect(adapterFor("resend", "email")).toBeTruthy();
    const conn = await ensureResendConnection(orgId);
    expect(conn.status).toBe("verified"); expect(JSON.parse(conn.config!)).toEqual({ orgId });
    mail.sent.length = 0;
    const r = await publishNewsletter({ token: "", account: { externalAccountId: "resend", accountType: "sender", config: { orgId } }, format: "newsletter", title: "September news", text: "Hello {{firstName}}, here is what is new.", parts: [], media: [], donePartIds: [] });
    expect(r.partIds).toEqual(["sent:1", "blocked:0", "audience:1"]);
    expect(mail.sent).toHaveLength(1); expect(mail.sent[0].to).toBe(`${tag}-yes@example.com`); expect(mail.sent[0].text).toContain("Hello Y,"); expect(mail.sent[0].text).toMatch(/\/u\/[A-Za-z0-9_-]+/);
    const msg = (await db.losOutboundMessage.findFirst({ where: { orgId, leadId: yes.leadId } }))!;
    expect(msg.status).toBe("sent"); expect(msg.subject).toBe("September news");
    expect(await db.losOutboundMessage.count({ where: { orgId, leadId: no.leadId } })).toBe(0);
  });
});

describe("WP-27 structured output", () => {
  it("malformed JSON is a validation failure (after one repair retry), and a wrong shape is refused — never a draft", async () => {
    llmContent = "this is not json";
    await expect(generateCalendar(orgId, ["linkedin"], 14)).rejects.toThrow(AiOutputError);
    llmContent = JSON.stringify({ nope: true });
    await expect(draftContent(orgId, { channel: "linkedin", topic: "x" })).rejects.toThrow(/expected shape/);
    llmContent = JSON.stringify({ body: "A plain post.", expertiseFlags: [] });
    expect((await draftContent(orgId, { channel: "linkedin", topic: "x" })).body).toBe("A plain post.");
  });
});
