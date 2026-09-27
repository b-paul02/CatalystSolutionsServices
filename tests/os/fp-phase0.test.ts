// Phase 0 · WP-04 cost from usage, WP-05 short links, WP-06 feature flags, WP-07 notification preferences.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string }) => { mail.sent.push(m); return { delivered: true }; } }));

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { costMicros } from "@/lib/os/ai";
import { priceForModel } from "@/lib/os/providerPrices";
import { clicksByVariant, resolveShortCode, shortLinkForVariant, uaClass } from "@/lib/os/links";
import { GET as shortLinkGet } from "@/app/l/[code]/route";
import { flagOn, gateWithFlags, setFlag } from "@/lib/os/flags";
import { toggleFlag } from "@/app/(site)/admin/os/flags/actions";
import { notify } from "@/lib/os/notify";
import { savePrefs } from "@/app/app/(shell)/settings/notifications/actions";

const tag = `fp0-${Date.now()}`;
let orgId: string, owner: string, staff: string, admin: string;
const slackPosts: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith("https://hooks.slack.com/")) { slackPosts.push(String(init?.body)); return new Response("ok"); } throw new Error(`Unexpected outbound request in a test: ${url}`); });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  admin = (await db.losUser.create({ data: { email: `${tag}-admin@example.com`, platformRole: "super_admin", demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: staff, role: "cgo_lead" }] });
  await db.losIntegrationConfig.create({ data: { orgId, config: JSON.stringify({ slackWebhookUrl: "https://hooks.slack.com/services/t" }) } });
});
afterAll(async () => {
  await db.losLinkClick.deleteMany({ where: { linkId: { in: (await db.cosShortLink.findMany({ where: { orgId }, select: { id: true } })).map((l) => l.id) } } });
  await db.cosShortLink.deleteMany({ where: { orgId } });
  await db.cosFeatureFlag.deleteMany({ where: { OR: [{ orgId }, { key: "publish", orgId: "" }] } });
  await db.cosNotificationPref.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } });
  await db.losIntegrationConfig.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losMembership.deleteMany({ where: { orgId } });
  await db.losSession.deleteMany({ where: { userId: { in: [owner, staff, admin] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [owner, staff, admin] } } });
  vi.unstubAllGlobals();
});

describe("WP-04 cost from usage", () => {
  it("prices a known (provider, model) from the table, the env pair as fallback, and unknown stays NULL", () => {
    expect(priceForModel("gemini-2.5-flash-lite")).toEqual({ inputMicrosPerMTok: 100_000, outputMicrosPerMTok: 400_000 });
    expect(costMicros({ inputTokens: 1_000_000, outputTokens: 1_000_000, model: "google:gemini-2.5-flash-lite" })).toBe(500_000);
    expect(priceForModel("some-unknown-model")).toBeNull();
    const env = { LLM_PRICE_INPUT_MICROS_PER_MTOK: process.env.LLM_PRICE_INPUT_MICROS_PER_MTOK, LLM_PRICE_OUTPUT_MICROS_PER_MTOK: process.env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK };
    delete process.env.LLM_PRICE_INPUT_MICROS_PER_MTOK; delete process.env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK;
    expect(costMicros({ inputTokens: 10, outputTokens: 10, model: "some-unknown-model" })).toBeNull();
    expect(costMicros({ inputTokens: null, outputTokens: 10, model: "google:gemini-2.5-flash-lite" })).toBeNull();
    process.env.PROVIDER_PRICES_JSON = JSON.stringify({ "x:override-model": { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 1_000_000 } });
    expect(costMicros({ inputTokens: 500_000, outputTokens: 500_000, model: "override-model" })).toBe(1_000_000);
    delete process.env.PROVIDER_PRICES_JSON;
    if (env.LLM_PRICE_INPUT_MICROS_PER_MTOK) process.env.LLM_PRICE_INPUT_MICROS_PER_MTOK = env.LLM_PRICE_INPUT_MICROS_PER_MTOK;
    if (env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK) process.env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK = env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK;
  });
});

describe("WP-05 short links", () => {
  it("one stable link per variant; the route redirects and records a click without IP or UA string; bots excluded", async () => {
    const variantId = `${tag}-variant`;
    const a = await shortLinkForVariant(orgId, variantId, "https://example.com/offer?utm_campaign=x");
    const b = await shortLinkForVariant(orgId, variantId, "https://example.com/offer?utm_campaign=x");
    expect(a.code).toBe(b.code);
    const req = (ua: string) => new NextRequest(`http://app.test/l/${a.code}`, { headers: { "user-agent": ua, referer: "https://www.linkedin.com/feed/?x=1", "x-forwarded-for": "203.0.113.9" } });
    const res = await shortLinkGet(req("Mozilla/5.0 (iPhone) Mobile Safari"), { params: Promise.resolve({ code: a.code }) });
    expect(res.status).toBe(302); expect(res.headers.get("location")).toBe("https://example.com/offer?utm_campaign=x");
    await shortLinkGet(req("facebookexternalhit/1.1"), { params: Promise.resolve({ code: a.code }) });
    const clicks = await db.losLinkClick.findMany({ where: { linkId: a.id } });
    expect(clicks.map((c) => c.uaClass).sort()).toEqual(["bot", "mobile"]);
    expect(clicks[0].refDomain).toBe("www.linkedin.com");
    expect(JSON.stringify(clicks)).not.toContain("203.0.113.9"); expect(JSON.stringify(clicks)).not.toContain("Safari");
    const counted = await clicksByVariant(orgId, [variantId], { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) });
    expect(counted.get(variantId)).toBe(1);
    expect(uaClass(null)).toBe("unknown");
    expect(await resolveShortCode("nope-nope")).toBeNull();
    expect((await shortLinkGet(new NextRequest("http://app.test/l/zzz"), { params: Promise.resolve({ code: "zzz" }) })).status).toBe(404);
  });
});

describe("WP-06 feature flags", () => {
  it("no row = on; a global off blocks the gate; an org override wins; the operator action writes it", async () => {
    expect(await flagOn("publish", orgId)).toBe(true);
    await signIn(admin, orgId);
    expect((await toggleFlag({}, form({ key: "publish", orgId: "", on: "false" }))).ok).toBe("Saved.");
    expect(await flagOn("publish", orgId)).toBe(false);
    const gate = await gateWithFlags({ feature: "publish", orgId, tier: 1, killSwitch: false, currentHash: "h", approval: null });
    expect(gate.allowed).toBe(false); if (!gate.allowed) expect(gate.reason).toMatch(/switched off/);
    await setFlag("publish", orgId, true, "test");
    expect(await flagOn("publish", orgId)).toBe(true);
    expect((await gateWithFlags({ feature: "publish", orgId, tier: 1, killSwitch: false, currentHash: "h", approval: null })).allowed).toBe(true);
    // the kill switch still wins over an enabled flag
    expect((await gateWithFlags({ feature: "publish", orgId, tier: 2, killSwitch: true, currentHash: "h", approval: null })).allowed).toBe(false);
    expect((await toggleFlag({}, form({ key: "publish", orgId: "", on: "true" }))).ok).toBe("Saved.");
    expect((await toggleFlag({}, form({ key: "nonsense", orgId: "", on: "true" }))).error).toBe("Unknown feature.");
  });
});

describe("WP-07 notification preferences", () => {
  it("in-app always; email and Slack only where the recipient opted in; a duplicate dedupe key sends nothing twice", async () => {
    await signIn(owner, orgId);
    expect((await savePrefs({}, form({ "email:approval_requested": "on", "slack:approval_requested": "on" }))).ok).toBe("Saved.");
    mail.sent.length = 0; slackPosts.length = 0;
    await notify({ orgId, audience: "client", kind: "approval_requested", title: `${tag} approve this`, href: "/app/approvals", dedupeKey: `${tag}:a1` });
    expect(mail.sent).toHaveLength(1); expect(mail.sent[0].to).toBe(`${tag}-owner@example.com`); expect(mail.sent[0].text).toContain("http://app.test/app/approvals");
    expect(slackPosts).toHaveLength(1);
    await notify({ orgId, audience: "client", kind: "approval_requested", title: `${tag} approve this`, href: "/app/approvals", dedupeKey: `${tag}:a1` });
    expect(mail.sent).toHaveLength(1); // deduped
    // staff audience: the owner's preference does not apply; the staff member has none ⇒ in-app only
    await notify({ orgId, audience: "staff", kind: "approval_requested", title: `${tag} staff`, dedupeKey: `${tag}:a2` });
    expect(mail.sent).toHaveLength(1);
    // a kind with nothing ticked is in-app only
    await notify({ orgId, audience: "client", kind: "payment", title: `${tag} paid`, dedupeKey: `${tag}:a3` });
    expect(mail.sent).toHaveLength(1);
    expect(await db.cosNotification.count({ where: { orgId, dedupeKey: { startsWith: `${tag}:` } } })).toBe(3);
  });
});
