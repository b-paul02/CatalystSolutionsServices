// Release pass: the gaps closed after the final verification, driven through the real entry points.
//  A brief → campaign · B the five data-returning LeadOS actions · C Facebook Page video (contract fixtures, NOT live)
//  D low-balance email (captured transport) · §2 provider timeout / late answer / worker restart.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => { throw new Error("no request scope"); } }));
// captured email transport: nothing leaves the process
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string }) => { mail.sent.push(m); return { delivered: true }; } }));

import { db } from "@/lib/audit/db";
import { follow, form, installProviderFetch, provider, signIn, signOut } from "./entry-harness";
import * as A from "@/app/app/(shell)/_os/studio";
import * as Cr from "@/lib/os/credits";
import * as S from "@/lib/os/studio";
import { AdapterError, adapterFor, type PublishInput } from "@/lib/os/adapters";
import { doReveal, previewReveal, runSearch } from "@/app/app/(shell)/discover/actions";
import { exportLeadsCsv } from "@/app/app/(shell)/leads/actions";
import { submitCampaignForReview } from "@/app/app/(shell)/campaigns/actions";

process.env.LLM_API_KEY = "test-only"; process.env.ASSET_STORAGE = "local";

const tag = `rg-${Date.now()}`;
const RATES = { linkedin_post: { base: 2, perKOutputTokens: 10 }, campaign_brief: { base: 3, perKOutputTokens: 10 } };
const POST = { title: "Booking a consult", body: "A short, plain post about booking a consult with our team.", parts: [], meta: { title: "", description: "" }, notes: [] };
const BRIEF = { title: "Spring check-up drive", body: "Objective\nMore check-up bookings from existing patients.\n\nAudience: Families within ten minutes of the clinic\n\n**Key message**\nA check-up now is easier than a problem later.\n\nOffer\nA reminder call and a flexible slot.\n\nChannels\nLinkedIn and Instagram, plus the clinic newsletter.\n\nMeasures\nBookings recorded against the campaign.", parts: ["LinkedIn — what a check-up covers", "Instagram — meet the hygienist"], meta: { title: "", description: "" }, notes: [] };

let orgA: string, orgB: string, engA: string, engB: string;
const U: Record<string, string> = {};
const user = async (n: string) => (U[n] = (await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, demo: true } })).id);
const as = (n: string, org = orgA) => signIn(U[n], org);
const grant = (amount: number, orgId = orgA) => Cr.grantCredits({ orgId, kind: "purchased", amount, expiresAt: null, sourceRef: `${tag}:${Math.random()}`, reason: "test grant (synthetic)", demo: true });
const avail = async (orgId = orgA) => (await Cr.walletSummary(orgId)).available;
const drain = async (orgId = orgA) => { const a = await avail(orgId); if (a > 0) await Cr.adjustCredits({ orgId, delta: -a, reason: "test reset", actorId: null, ref: `${tag}:${Math.random()}` }); };
async function quoteAndRun(inputs: Record<string, string>) {
  const q = await A.studioQuote({}, form(inputs));
  if (!q.quote) throw new Error(q.error ?? "no quote");
  const r = await follow(A.studioRun({}, form({ ...inputs, quoteId: q.quote.id, requestId: q.quote.requestId })));
  return r.redirect!.split("/").pop()!;
}
const post = (topic: string) => ({ toolKey: "linkedin_post", topic, length: "standard" });

beforeAll(async () => {
  installProviderFetch();
  orgA = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  orgB = (await db.losOrg.create({ data: { name: `${tag}-other`, market: "IN", demo: true } })).id; // content only: no CRM in scope
  await db.cosWorkspace.createMany({ data: [{ orgId: orgA, kind: "client", demo: true }, { orgId: orgB, kind: "client", demo: true }] });
  const tools = JSON.stringify(["linkedin_post", "campaign_brief"]);
  await db.cosContract.create({ data: { orgId: orgA, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content", "crm"]), aiTools: tools, signedAt: new Date(), demo: true } });
  await db.cosContract.create({ data: { orgId: orgB, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), aiTools: tools, signedAt: new Date(), demo: true } });
  engA = (await db.cosEngagement.create({ data: { orgId: orgA, name: `${tag} engagement`, stage: "active", demo: true } })).id;
  engB = (await db.cosEngagement.create({ data: { orgId: orgB, name: `${tag} other engagement`, stage: "active", demo: true } })).id;
  for (const [n, role, org] of [["owner", "owner", orgA], ["admin", "admin", orgA], ["cm", "campaign_manager", orgA], ["rep", "sales_rep", orgA], ["staff", "cgo_lead", orgA], ["ownerB", "owner", orgB]] as const) await db.losMembership.create({ data: { orgId: org, userId: await user(n), role } });
  const card = await Cr.createRateCard(JSON.stringify(RATES), `${tag} synthetic test rates`, null, true);
  await Cr.activateRateCard(card.id);
});
afterAll(async () => {
  const orgs = { orgId: { in: [orgA, orgB] } };
  await db.losJob.deleteMany({ where: { type: S.STUDIO_JOB } });
  await db.cosRevision.deleteMany({ where: orgs });
  await db.cosCampaign.deleteMany({ where: orgs });
  await db.cosWorkItem.deleteMany({ where: orgs });
  await db.cosEngagement.deleteMany({ where: orgs });
  await db.losAuditEvent.deleteMany({ where: orgs });
  await db.cosContract.deleteMany({ where: orgs });
  await db.cosWorkspace.deleteMany({ where: orgs });
  await db.losMembership.deleteMany({ where: orgs });
  await db.losSession.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.losUser.deleteMany({ where: { id: { in: Object.values(U) } } });
  await db.cosCreditRateCard.deleteMany({ where: { note: { startsWith: tag } } });
});
beforeEach(() => { provider.llm = { content: POST, status: 200, outputTokens: 200, timeout: false, gate: null }; mail.sent.length = 0; });

describe("A · AI Studio brief → campaign record", () => {
  it("parses the brief into explicit fields", () => {
    expect(S.parseBrief(BRIEF.body)).toMatchObject({ objective: "More check-up bookings from existing patients.", audience: "Families within ten minutes of the clinic", keyMessage: "A check-up now is easier than a problem later.", offer: "A reminder call and a flexible slot." });
    expect(S.channelsIn(S.parseBrief(BRIEF.body).channels).sort()).toEqual(["instagram", "linkedin"]);
  });

  it("saves ONE draft campaign however often it is submitted; no generation, no charge; provenance kept; staff told", async () => {
    await grant(40); await as("owner");
    provider.llm.content = BRIEF;
    const opId = await quoteAndRun({ toolKey: "campaign_brief", goal: "More check-up bookings", length: "standard", engagementId: engA });
    await S.runOperation(opId);
    expect((await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } })).status).toBe("completed");
    const calls = provider.llmCalls, balance = await avail(), ledger = await db.cosCreditLedger.count({ where: { orgId: orgA } });
    const fields = { operationId: opId, name: "Spring check-up drive", engagementId: engA, objective: "More check-up bookings (edited by the owner).", audience: "Families within ten minutes of the clinic", keyMessage: "A check-up now is easier than a problem later.", offer: "A reminder call and a flexible slot." };
    const f = () => { const fd = form(fields); fd.append("channels", "linkedin"); fd.append("channels", "not-a-channel"); return A.studioSaveCampaign({}, fd); };
    const results = await Promise.all([f(), f(), f()]);
    expect(results.every((r) => r.ok && r.href)).toBe(true);
    expect(new Set(results.map((r) => r.href)).size).toBe(1);
    expect(results.filter((r) => /No credits were used/.test(r.ok!)).length).toBe(1);
    const again = await f(); // a later repeat
    expect(again.ok).toMatch(/already saved/);
    const all = await db.cosCampaign.findMany({ where: { orgId: orgA } });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "draft", engagementId: engA, objective: fields.objective, channels: ["linkedin"], createdById: U.owner });
    expect(results[0].href).toBe(`/app/content/campaigns/${all[0].id}`);
    // nothing generated again, nothing charged
    expect([provider.llmCalls, await avail(), await db.cosCreditLedger.count({ where: { orgId: orgA } })]).toEqual([calls, balance, ledger]);
    const rev = await db.cosRevision.findFirstOrThrow({ where: { subject: "campaign", subjectId: all[0].id } });
    expect(JSON.parse(rev.snapshot).provenance).toMatchObject({ origin: "ai_studio", operationId: opId, editedFields: ["objective"], ideas: 2 });
    expect(JSON.parse((await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } })).savedTo)).toContainEqual({ kind: "campaign", id: all[0].id });
    expect(await db.cosNotification.count({ where: { orgId: orgA, audience: "staff", kind: "campaign_draft" } })).toBe(1);
    // the client still cannot manage campaigns: the draft waits for Catalyst
    const { updateCampaign } = await import("@/lib/os/content");
    await expect(updateCampaign({ orgId: orgA, userId: U.owner, role: "owner" }, all[0].id, { status: "active" })).rejects.toThrow("Forbidden");
  });

  it("refuses another tenant's run, another tenant's engagement, a non-brief run and a member without AI access", async () => {
    await as("owner");
    const opId = (await db.cosAiOperation.findFirstOrThrow({ where: { orgId: orgA, toolKey: "campaign_brief" } })).id;
    await as("ownerB", orgB);
    expect((await A.studioSaveCampaign({}, form({ operationId: opId, name: "steal" }))).error).toBe("Brief not found.");
    await as("rep");
    expect((await A.studioSaveCampaign({}, form({ operationId: opId, name: "x" }))).error).toBe("Forbidden.");
    await as("owner");
    provider.llm.content = BRIEF;
    const op2 = await quoteAndRun({ toolKey: "campaign_brief", goal: "A second brief", length: "standard" });
    await S.runOperation(op2);
    expect((await A.studioSaveCampaign({}, form({ operationId: op2, name: "Wrong engagement", engagementId: engB, objective: "", audience: "", keyMessage: "", offer: "" }))).error).toMatch(/not found/);
    expect(await db.cosCampaign.count({ where: { orgId: orgA } })).toBe(1); // the refused save left nothing behind
    provider.llm.content = POST;
    const postOp = await quoteAndRun(post("not a brief"));
    await S.runOperation(postOp);
    expect((await A.studioSaveCampaign({}, form({ operationId: postOp, name: "x" }))).error).toBe("Brief not found.");
  });
});

describe("B · data-returning LeadOS actions: a refusal is an answer, never a crash and never empty data", () => {
  it("signed out", async () => {
    signOut();
    for (const r of [await runSearch({}), await previewReveal([]), await doReveal([]), await exportLeadsCsv({})]) expect(r).toHaveProperty("error");
    expect((await submitCampaignForReview("nope")).problems[0]).toMatchObject({ severity: "error" });
  });
  it("wrong role: refused with a message; nothing exported, nothing submitted", async () => {
    await as("rep"); // leads.view + leads.edit, but no export and no campaign management
    expect(await exportLeadsCsv({})).toEqual({ error: "Forbidden." });
    expect((await submitCampaignForReview("nope")).problems).toEqual([{ severity: "error", message: "Forbidden." }]);
    expect(await db.losAuditEvent.count({ where: { orgId: orgA, action: "leads.export" } })).toBe(0);
  });
  it("outside the purchased scope", async () => {
    await as("ownerB", orgB);
    const r = await runSearch({});
    expect("error" in r && r.error).toMatch(/scope/);
    expect(await exportLeadsCsv({})).toHaveProperty("error");
  });
  it("CRM without Lead Supply: discovery is refused", async () => {
    await as("owner"); // orgA has crm but not lead_supply
    for (const r of [await runSearch({}), await previewReveal([]), await doReveal([])]) expect("error" in r && r.error).toMatch(/scope/);
  });
  it("permitted: real data comes back", async () => {
    await db.cosContract.updateMany({ where: { orgId: orgA }, data: { modules: JSON.stringify(["content", "crm", "lead_supply"]) } });
    await as("owner");
    expect(Array.isArray(await runSearch({}))).toBe(true);
    expect(await previewReveal([])).toMatchObject({ total: 0 });
    expect(await doReveal([])).toEqual([]);
    const csv = await exportLeadsCsv({});
    expect("csv" in csv && csv.csv.startsWith("First name")).toBe(true);
    expect(await db.losAuditEvent.count({ where: { orgId: orgA, action: "leads.export" } })).toBe(1);
  });
});

describe("D · low-balance notice", () => {
  const setLow = (v: string, email = true) => A.creditsSettings({}, form({ lowBalanceAt: v, ...(email ? { lowBalanceEmail: "on" } : {}) }));
  it("emails the workspace's billing members once per episode; re-arms on recovery or a new threshold; respects the cooldown and the opt-out; costs nothing", async () => {
    await as("owner"); await drain(); await grant(20);
    expect((await setLow("15")).ok).toBeTruthy();
    await S.runOperation(await quoteAndRun(post("low 1"))); // 20 → 16: above the level
    expect(mail.sent).toHaveLength(0);
    await S.runOperation(await quoteAndRun(post("low 2"))); // 16 → 12: low
    expect(mail.sent.map((m) => m.to).sort()).toEqual([`${tag}-admin@example.com`, `${tag}-owner@example.com`]); // not the campaign manager, the rep or Catalyst staff
    expect(mail.sent[0].text).toContain("12 AI credits left");
    expect(await avail()).toBe(12); // the notice itself cost nothing
    await S.runOperation(await quoteAndRun(post("low 3"))); // still low: same episode
    await Promise.all([S.lowBalanceNotice(orgA), S.lowBalanceNotice(orgA), S.lowBalanceNotice(orgA)]);
    expect(mail.sent).toHaveLength(2);
    expect(await db.cosNotification.count({ where: { orgId: orgA, kind: "ai_credits_low" } })).toBe(1); // in-app notice is still there
    // recovery re-arms, but the cooldown still holds for 24 h
    await grant(40); await S.lowBalanceNotice(orgA);
    await drain(); await grant(10); await S.lowBalanceNotice(orgA);
    expect(mail.sent).toHaveLength(2);
    await S.lowBalanceNotice(orgA, new Date(Date.now() + 25 * 3_600_000));
    expect(mail.sent).toHaveLength(4);
    // a changed threshold re-arms too (after the cooldown); switching the email off silences it
    await db.cosCreditWallet.update({ where: { orgId: orgA }, data: { lowNotifiedAt: new Date(Date.now() - 30 * 3_600_000) } });
    await setLow("12"); await S.lowBalanceNotice(orgA);
    expect(mail.sent).toHaveLength(6);
    await db.cosCreditWallet.update({ where: { orgId: orgA }, data: { lowNotifiedAt: null } });
    await setLow("11", false); await S.lowBalanceNotice(orgA);
    expect(mail.sent).toHaveLength(6);
    expect((await Cr.walletInvariant(orgA)).ok).toBe(true);
  });

  it("credits held for a run in progress are not a reason to email", async () => {
    await as("owner"); await drain(); await grant(20); await setLow("15");
    await db.cosCreditWallet.update({ where: { orgId: orgA }, data: { lowNotifiedAt: null, lowArmed: true } });
    const opId = await quoteAndRun(post("held")); // 8 held: available 12, but 20 if the hold comes back
    expect(await S.lowBalanceNotice(orgA)).toEqual({ emailed: 0 });
    expect(mail.sent).toHaveLength(0);
    await S.runOperation(opId); // charged 4 → 16, above the level
    expect(mail.sent).toHaveLength(0);
  });
});

describe("§2 · provider timeout, late answer, worker restart", () => {
  it("timeout: not sent again, client hold released, attempt marked uncertain, cost unknown (NULL)", async () => {
    await as("owner"); await drain(); await grant(30); await A.creditsSettings({}, form({ lowBalanceAt: "" }));
    const before = await avail(), calls = provider.llmCalls;
    provider.llm.timeout = true;
    const opId = await quoteAndRun(post("times out"));
    await S.runOperation(opId);
    expect(provider.llmCalls).toBe(calls + 1); // a metered timeout is never blindly re-sent
    const op = await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId }, include: { attempts: true } });
    expect(op).toMatchObject({ status: "failed", output: null });
    expect(op.error).toMatch(/too long.*not been charged/);
    expect(op.attempts.map((a) => [a.status, a.costMicros])).toEqual([["uncertain", null]]);
    expect(await db.cosAiUsage.findFirstOrThrow({ where: { operationId: opId } })).toMatchObject({ ok: false, costMicros: null, payer: "catalyst_internal" });
    expect([await avail(), await db.cosCreditLedger.count({ where: { operationId: opId, kind: "debit" } })]).toEqual([before, 0]);
    // the worker coming back (queue retry, restart) does nothing
    await S.runOperation(opId);
    expect(provider.llmCalls).toBe(calls + 1);
  });

  it("a confirmed provider rejection is a plain failure; a success keeps the provider's request id", async () => {
    await as("owner");
    provider.llm.status = 400;
    const bad = await quoteAndRun(post("rejected"));
    await S.runOperation(bad);
    expect((await db.cosAiAttempt.findFirstOrThrow({ where: { operationId: bad } })).status).toBe("failed");
    provider.llm.status = 200;
    const good = await quoteAndRun(post("fine"));
    await S.runOperation(good);
    expect((await db.cosAiAttempt.findFirstOrThrow({ where: { operationId: good } })).providerRequestId).toMatch(/^chatcmpl-test-/);
  });

  it("an answer that arrives AFTER the run was swept and released cannot debit or surface", async () => {
    await as("owner");
    const before = await avail();
    let open!: () => void;
    provider.llm.gate = new Promise<void>((r) => { open = r; });
    const opId = await quoteAndRun(post("slow"));
    const running = S.runOperation(opId); // the worker is waiting on the provider
    await vi.waitFor(async () => expect((await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } })).status).toBe("running"));
    await S.reconcileStudio(new Date(Date.now() + (S.STALE_RUNNING_MIN + 1) * 60_000)); // the sweep gives up on it
    expect((await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } })).status).toBe("uncertain");
    expect(await avail()).toBe(before - 8); // still held: uncertain is never auto-released
    await S.runOperation(opId); // nor auto-retried
    await S.resolveUncertain(opId, "provider dashboard shows no completed request", "ops@example.com");
    expect(await avail()).toBe(before);
    open(); await running; // …and now the late answer lands
    const op = await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } });
    expect(op).toMatchObject({ status: "failed", output: null });
    expect([await avail(), await db.cosCreditLedger.count({ where: { operationId: opId, kind: "debit" } })]).toEqual([before, 0]);
    expect(await db.losAuditEvent.count({ where: { orgId: orgA, action: "ai.operation_reconciled", entityId: opId } })).toBe(1);
    expect((await Cr.walletInvariant(orgA)).ok).toBe(true);
  });
});

describe("C · Facebook Page video (request shapes against documented responses — not live)", () => {
  type Call = { url: string; method: string; auth: string | null };
  const calls: Call[] = [];
  let status = "processing", postStatus = 200;
  const stub = () => vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u.replace(/https:\/\/graph(-video)?\.facebook\.com\/v[\d.]+\//, (_m, v) => (v ? "VIDEO:" : "")), method: init.method ?? "GET", auth: new Headers(init.headers).get("authorization") });
    if (u.includes("/uploads?")) return Response.json({ id: "upload:abc" });
    if (u.endsWith("/upload:abc")) return Response.json({ h: "HANDLE-1" });
    if (u.endsWith("/videos")) return postStatus === 200 ? Response.json({ id: "vid9" }) : new Response(null, { status: postStatus });
    return Response.json({ status: { video_status: status }, permalink_url: "/page/videos/vid9/" });
  });
  const mp4 = { kind: "video", mime: "video/mp4", sizeBytes: 5, publicUrl: null, bytes: async () => Buffer.from("video") };
  const input = (over: Partial<PublishInput> = {}): PublishInput => ({ token: "tok", account: { externalAccountId: "page1", accountType: "page", config: {} }, format: "video", title: "Clinic tour", text: "Come and see us", parts: [], media: [mp4], donePartIds: [], ...over });
  beforeEach(() => { calls.length = 0; status = "processing"; postStatus = 200; process.env.FB_VIDEO_POLL_MS = "1"; process.env.META_APP_ID = "app1"; stub(); });
  afterEach(() => { installProviderFetch(); delete process.env.META_APP_ID; });
  const fb = () => adapterFor("meta", "facebook")!;

  it("is an offered format", () => expect(fb().formats).toContain("video"));
  it("still processing ⇒ retryable, carrying BOTH identities; the retry neither uploads nor posts again", async () => {
    const e = (await fb().publish(input()).catch((x) => x)) as AdapterError;
    expect([e.kind, e.mediaRefs]).toEqual(["retryable", { 0: "HANDLE-1", video: "vid9" }]);
    expect(calls.slice(0, 3)).toEqual([{ url: "app1/uploads?file_name=video.mp4&file_length=5&file_type=video/mp4", method: "POST", auth: "Bearer tok" }, { url: "upload:abc", method: "POST", auth: "OAuth tok" }, { url: "VIDEO:page1/videos", method: "POST", auth: "Bearer tok" }]);
    status = "ready"; calls.length = 0;
    const r = await fb().publish(input({ mediaRefs: e.mediaRefs }));
    expect(calls.map((c) => c.method + " " + c.url.split("?")[0])).toEqual(["GET vid9"]);
    expect(r).toEqual({ externalId: "vid9", externalUrl: "https://www.facebook.com/page/videos/vid9/", partIds: ["vid9"] });
  });
  it("a refused post keeps the uploaded file; the retry posts without uploading again", async () => {
    postStatus = 429;
    const e = (await fb().publish(input()).catch((x) => x)) as AdapterError;
    expect([e.kind, e.mediaRefs]).toEqual(["retryable", { 0: "HANDLE-1" }]);
    postStatus = 200; status = "ready"; calls.length = 0;
    await fb().publish(input({ mediaRefs: e.mediaRefs }));
    expect(calls.map((c) => c.url.split("?")[0])).toEqual(["VIDEO:page1/videos", "vid9"]);
  });
  it("no answer to the post ⇒ uncertain (never retried); a processing error ⇒ definite; setup missing ⇒ said plainly", async () => {
    vi.stubGlobal("fetch", async (url: string) => { if (String(url).endsWith("/videos")) throw new Error("socket hang up"); return String(url).includes("/uploads?") ? Response.json({ id: "upload:abc" }) : Response.json({ h: "H" }); });
    expect(((await fb().publish(input()).catch((x) => x)) as AdapterError).kind).toBe("uncertain");
    stub(); status = "error";
    expect(((await fb().publish(input()).catch((x) => x)) as AdapterError).kind).toBe("definite");
    delete process.env.META_APP_ID;
    const e = (await fb().publish(input()).catch((x) => x)) as AdapterError;
    expect([e.kind, e.message]).toEqual(["definite", expect.stringContaining("META_APP_ID")]);
  });
});

describe("local operator access cannot work in production", () => {
  it("a cookie signed with the local verification secret is refused when NODE_ENV=production, even if that secret and account were configured", async () => {
    const { createSession, verifySession } = await import("@/lib/audit/adminAuth");
    vi.stubEnv("ADMIN_SESSION_SECRET", "local-verify-only-session-secret"); vi.stubEnv("ADMIN_ACCOUNTS", "dev-operator@localhost.invalid:unused-local-only");
    const cookie = await createSession("dev-operator@localhost.invalid");
    expect(await verifySession(cookie)).toBe("dev-operator@localhost.invalid"); // local: works
    vi.stubEnv("NODE_ENV", "production");
    expect(await verifySession(cookie)).toBeNull();
    await expect(createSession("dev-operator@localhost.invalid")).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});
