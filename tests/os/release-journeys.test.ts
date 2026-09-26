// Release pass §3: the client journeys through REAL entry points, starting from the real password login (no injected
// session): login → switch workspace → Studio → editorial → calendar → lifecycle → isolation. Fixture setup writes rows;
// every business step under test is an action or a route. Synthetic data, disposable local *_test database, test adapter.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => { throw new Error("no request scope"); } }));

import { db } from "@/lib/audit/db";
import { follow, form, installProviderFetch, jar, provider, signOut } from "./entry-harness";
import { login } from "@/app/app/(auth)/actions";
import * as A from "@/app/app/(shell)/_os/actions";
import * as V from "@/app/app/(shell)/_os/v2";
import * as St from "@/app/app/(shell)/_os/studio";
import { GET as tickRoute } from "@/app/api/os/tick/route";
import { GET as exportRoute } from "@/app/api/os/export/route";
import * as Cr from "@/lib/os/credits";
import * as S from "@/lib/os/studio";
import { hashPassword } from "@/lib/leados/auth";
import { encryptField } from "@/lib/leados/crypto";
import { generateCycle } from "@/lib/os/engagement";

process.env.LLM_API_KEY = "test-only"; process.env.GROWTHOS_TEST_ADAPTER = "1"; process.env.CRON_SECRET = "test-cron-secret";

const tag = `rj-${Date.now()}`, SECRET = `synthetic-${tag}`; // a throwaway password for throwaway users
const RATES = { linkedin_post: { base: 2, perKOutputTokens: 10 }, x_thread: { base: 2, perKOutputTokens: 10 } };
let orgA: string, orgB: string, e1: string, e2: string, connectionId: string, variantId: string, campaignE2: string;
const U: Record<string, string> = {};
const ok = (s: { ok?: string; error?: string }) => { expect(s.error).toBeUndefined(); return s; };
const tick = () => tickRoute(new NextRequest("http://localhost/api/os/tick", { headers: { authorization: "Bearer test-cron-secret" } }));
/** the real login action, then the real workspace switch — the cookie jar is all the "browser" keeps */
async function logIn(n: string, org = orgA) {
  signOut();
  expect((await follow(login({}, form({ email: `${tag}-${n}@example.com`, password: SECRET })))).redirect).toBe("/app/dashboard");
  expect((await follow(A.switchOrg({}, form({ orgId: org })))).redirect).toBe("/app/dashboard");
}

beforeAll(async () => {
  installProviderFetch();
  orgA = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  orgB = (await db.losOrg.create({ data: { name: `${tag}-second`, market: "IN", demo: true } })).id;
  await db.cosWorkspace.createMany({ data: [{ orgId: orgA, kind: "client", demo: true, timezone: "Asia/Kolkata" }, { orgId: orgB, kind: "client", demo: true, timezone: "Asia/Kolkata" }] });
  for (const [n, role, orgs] of [["owner", "owner", [orgA, orgB]], ["lead", "cgo_lead", [orgA]], ["spec", "cgo_specialist", [orgA]]] as const) {
    U[n] = (await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, passwordHash: hashPassword(SECRET), emailVerifiedAt: new Date(), demo: true } })).id;
    for (const o of orgs) await db.losMembership.create({ data: { orgId: o, userId: U[n], role } });
  }
  const mk = async (orgId: string, name: string) => (await db.cosEngagement.create({ data: { orgId, name, stage: "active", billingInterval: "monthly", startsAt: new Date(Date.now() - 86_400_000), demo: true } })).id;
  e1 = await mk(orgA, `${tag} social`); e2 = await mk(orgA, `${tag} website`); await mk(orgB, `${tag} other`);
  const tools = JSON.stringify(["linkedin_post", "x_thread"]);
  for (const [o, e] of [[orgA, e1], [orgA, e2], [orgB, null]] as const) await db.cosContract.create({ data: { orgId: o, engagementId: e, status: "active", services: JSON.stringify(["content", "social"]), modules: JSON.stringify(["content"]), aiTools: tools, signedById: U.owner, signedAt: new Date(), demo: true } });
  connectionId = (await db.cosConnection.create({ data: { orgId: orgA, provider: "test", accountType: "user", externalAccountId: `acct-${tag}`, accountLabel: "Test account", status: "verified", capabilities: ["publish"], accessTokenEnc: encryptField("t"), config: JSON.stringify({ mode: "ok" }) } })).id;
  await Cr.activateRateCard((await Cr.createRateCard(JSON.stringify(RATES), `${tag} synthetic test rates`, null, true)).id);
  await Cr.grantCredits({ orgId: orgA, kind: "included", amount: 30, expiresAt: null, sourceRef: `${tag}:grant`, reason: "test grant (synthetic)", demo: true });
});
afterAll(async () => {
  const orgs = { orgId: { in: [orgA, orgB] } };
  await db.losJob.deleteMany({ where: { type: { in: [S.STUDIO_JOB, "os.publish"] } } });
  for (const m of ["cosRevision", "cosWorkItem", "cosCampaign", "cosCycle", "cosConnection", "cosContract", "cosEngagement", "cosWorkspace", "losAuditEvent", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: orgs });
  await db.losSession.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.losUser.deleteMany({ where: { id: { in: Object.values(U) } } });
  await db.cosCreditRateCard.deleteMany({ where: { note: { startsWith: tag } } });
});

describe("client journeys from a real login", { timeout: 60_000 }, () => {
  it("login: a wrong password gets nothing; the right one gets a session cookie", async () => {
    signOut();
    expect((await login({}, form({ email: `${tag}-owner@example.com`, password: "wrong" }))).error).toBe("Incorrect email or password.");
    expect(jar.has("los_session")).toBe(false);
    expect((await St.studioQuote({}, form({ toolKey: "linkedin_post", topic: "x", length: "standard" }))).error).toBeTruthy(); // signed out: refused, not crashed
    await logIn("owner");
    expect(jar.has("los_session")).toBe(true);
  });

  it("A · creation: choose engagement → quote → run → charge shown → edit → save as a channel variant (a draft, unapproved)", async () => {
    await logIn("owner");
    provider.llm = { content: { title: "Thread", body: "", parts: ["One clear idea about consults.", "Book a consult with our team."], meta: { title: "", description: "" }, notes: [] }, status: 200, outputTokens: 200, timeout: false, gate: null };
    const inputs = { toolKey: "x_thread", topic: "Why a consult first", length: "standard", posts: "4", engagementId: e2 };
    const q = (await St.studioQuote({}, form(inputs))).quote!;
    expect(q.maxCredits).toBeGreaterThan(0);
    const opId = (await follow(St.studioRun({}, form({ ...inputs, quoteId: q.id, requestId: q.requestId })))).redirect!.split("/").pop()!;
    await S.runOperation(opId); // the queue worker
    const op = await db.cosAiOperation.findUniqueOrThrow({ where: { id: opId } });
    expect(op).toMatchObject({ status: "completed", engagementId: e2, payer: "client_wallet" });
    expect(op.chargedCredits).toBeLessThanOrEqual(q.maxCredits);
    expect((await Cr.walletSummary(orgA)).available).toBe(30 - op.chargedCredits!);
    ok(await St.studioSave({}, form({ operationId: opId, title: "Consult thread (edited)", body: "", parts: "One clear idea about consults, edited by the owner.\n---\nBook a consult with our team.", saveAs: "x:thread" })));
    const v = await db.cosContentVariant.findFirstOrThrow({ where: { orgId: orgA, channel: "x", format: "thread" } });
    expect([v.state, v.parts.length, v.parts[0]]).toEqual(["draft", 2, "One clear idea about consults, edited by the owner."]);
    expect((await Cr.walletSummary(orgA)).available).toBe(30 - op.chargedCredits!); // saving cost nothing
  });

  it("B · editorial: edit → QA → client approval → edit again ⇒ THAT approval is withdrawn and its schedule cancelled", async () => {
    await logIn("lead");
    const c = await follow(V.campaignCreate({}, form({ name: `${tag} website launch`, engagementId: e2, objective: "Launch" })));
    campaignE2 = c.redirect!.split("/").pop()!;
    const masterId = (await follow(V.masterCreate({}, form({ title: "Launch note", campaignId: campaignE2, brief: "Announce", body: "The new site is live." })))).redirect!.split("/").pop()!;
    await logIn("spec");
    ok(await V.variantCreate({}, form({ masterId, channelFormat: "x:post", body: "The new site is live.", connectionId })));
    variantId = (await db.cosContentVariant.findFirstOrThrow({ where: { orgId: orgA, workItemId: masterId } })).id;
    ok(await V.variantEdit({}, form({ id: variantId, body: "The new site is live. Take a look." })));
    ok(await V.variantMove({}, form({ id: variantId, to: "internal_qa" })));
    await logIn("lead");
    ok(await V.variantMove({}, form({ id: variantId, to: "client_review" })));
    const approval = await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: variantId, status: "requested" } });
    expect((await A.decide({}, form({ approvalId: approval.id, decision: "approved" }))).error).toBeTruthy(); // staff never approve
    await logIn("owner");
    ok(await A.decide({}, form({ approvalId: approval.id, decision: "approved" })));
    await logIn("spec");
    ok(await V.publicationSchedule({}, form({ variantId, localTime: "2031-01-15T10:00" })));
    const edited = ok(await V.variantEdit({}, form({ id: variantId, body: "The new site is live. Come and look around." })));
    expect(edited.ok).toMatch(/approval was withdrawn/);
    expect((await db.cosApproval.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe("revoked");
    expect((await db.cosPublication.findFirstOrThrow({ where: { variantId } })).status).toBe("cancelled");
    expect((await V.publicationSchedule({}, form({ variantId, now: "1" }))).error).toMatch(/approved/i);
  });

  it("C · calendar: account chosen → schedule in the workspace zone → reschedule → cancel → schedule → the scheduler publishes once through the test adapter", async () => {
    expect((await db.cosContentVariant.findUniqueOrThrow({ where: { id: variantId } })).state).toBe("internal_qa"); // the edit sent it back for review
    await logIn("lead"); ok(await V.variantMove({}, form({ id: variantId, to: "client_review" })));
    await logIn("owner");
    ok(await A.decide({}, form({ approvalId: (await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: variantId, status: "requested" } })).id, decision: "approved" })));
    await logIn("spec");
    ok(await V.publicationSchedule({}, form({ variantId, localTime: "2031-01-15T10:00" })));
    let pub = await db.cosPublication.findFirstOrThrow({ where: { variantId, status: "scheduled" } });
    expect([pub.scheduledAt!.toISOString(), pub.connectionId]).toEqual(["2031-01-15T04:30:00.000Z", connectionId]); // 10:00 in Kolkata
    ok(await V.publicationReschedule({}, form({ id: pub.id, localTime: "2031-01-16T18:15" })));
    expect((await db.cosPublication.findUniqueOrThrow({ where: { id: pub.id } })).scheduledAt!.toISOString()).toBe("2031-01-16T12:45:00.000Z");
    ok(await V.publicationCancel({}, form({ id: pub.id })));
    expect((await db.cosPublication.findUniqueOrThrow({ where: { id: pub.id } })).status).toBe("cancelled");
    expect((await (await tick()).json()).published).toBe(0);
    ok(await V.publicationSchedule({}, form({ variantId, localTime: "2031-02-01T09:00" })));
    pub = await db.cosPublication.findFirstOrThrow({ where: { variantId, status: "scheduled" } });
    await db.cosPublication.update({ where: { id: pub.id }, data: { scheduledAt: new Date(Date.now() - 1000) } }); // fixture: time passes
    await Promise.all([tick(), tick()]); await tick();
    const done = await db.cosPublication.findUniqueOrThrow({ where: { id: pub.id }, include: { attempts: true } });
    expect([done.status, done.attempts.length, Boolean(done.externalId)]).toEqual(["published", 1, true]);
  });

  it("F · two engagements, two workspaces: scope, campaigns and actions stay where they belong", async () => {
    await logIn("owner");
    expect((await db.cosCampaign.findUniqueOrThrow({ where: { id: campaignE2 } })).engagementId).toBe(e2); // not the default engagement
    await logIn("owner", orgB); // same person, other workspace
    expect((await V.variantEdit({}, form({ id: variantId, body: "hijack" }))).error).toBeTruthy();
    expect((await St.studioQuote({}, form({ toolKey: "x_thread", topic: "t", posts: "4", length: "standard", engagementId: e1 }))).error).toMatch(/not found/i);
    expect((await St.studioQuote({}, form({ toolKey: "x_thread", topic: "t", posts: "4", length: "standard", campaignId: campaignE2 }))).error).toMatch(/not found/i);
    const opA = await db.cosAiOperation.findFirstOrThrow({ where: { orgId: orgA } });
    expect((await St.studioSave({}, form({ operationId: opA.id, title: "x", body: "y" }))).error).toBe("Draft not found.");
    const exported = await (await exportRoute()).text();
    expect(exported.includes(tag + "-second") && !exported.includes(`${tag} website launch`)).toBe(true); // B's export holds nothing of A
    const qB = (await St.studioQuote({}, form({ toolKey: "x_thread", topic: "t", posts: "4", length: "standard" }))).quote!;
    const runB = await St.studioRun({}, form({ toolKey: "x_thread", topic: "t", posts: "4", length: "standard", quoteId: qB.id, requestId: qB.requestId }));
    expect(runB.needCredits).toMatchObject({ available: 0, canBuy: true }); // A's wallet is not B's; the owner is pointed at the purchase page
  });

  it("E · lifecycle: pause (staff only) skips the recurring cycle, resume restores it; handover ⇒ read-only, history and export stay", async () => {
    await logIn("owner");
    expect((await V.engagementHold({}, form({ id: e1, hold: "paused", reason: "client asked" }))).error).toBeTruthy(); // a client cannot pause delivery state
    await logIn("lead");
    ok(await V.engagementHold({}, form({ id: e1, hold: "paused", reason: "Client asked to pause for a month" })));
    expect(await generateCycle(orgA, e1, new Date(Date.now() + 40 * 86_400_000))).toMatchObject({ created: 0, skipped: "paused" }); // next period (this one was generated by the scheduler in C) // the scheduler's unit of recurring work
    ok(await V.engagementHold({}, form({ id: e1, hold: "none", reason: "" })));
    expect((await db.cosEngagement.findUniqueOrThrow({ where: { id: e1 } })).hold).toBe("none");
    expect(await db.cosEngagementEvent.count({ where: { engagementId: e1, kind: "hold" } })).toBe(2);
    for (const id of [e1, e2]) { ok(await V.engagementMove({}, form({ id, to: "completed", reason: "done" }))); ok(await V.handover({}, form({ id }))); }
    expect((await db.cosWorkspace.findUniqueOrThrow({ where: { orgId: orgA } })).accessMode).toBe("read_only");
    await logIn("owner");
    expect((await V.profileSave({}, form({ audience: "after handover" }))).error).toMatch(/read-only/);
    await logIn("spec");
    expect((await V.variantEdit({}, form({ id: variantId, body: "after handover" }))).error).toMatch(/read-only/);
    await logIn("owner");
    expect((await St.studioQuote({}, form({ toolKey: "x_thread", topic: "t", posts: "4", length: "standard" }))).error).toBeTruthy(); // credits left over unlock nothing
    const res = await exportRoute();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.includes(`${tag} website launch`) && text.includes("Come and look around")).toBe(true); // history is all there
    expect((await db.cosPublication.findFirstOrThrow({ where: { variantId, status: "published" } })).externalId).toBeTruthy();
  });
});
