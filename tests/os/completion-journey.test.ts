// The delivery half of the acceptance walkthrough (brief §17 steps 3, 11–13, 15–16), driven through what people and the
// scheduler actually hit: server actions, the authenticated tick route, the public form route. Fixtures insert the
// workspace, contract, test account and the LeadOS capture form; every business operation below is an entry point.
// External steps use the explicit TEST adapter — test-verified, never live-verified.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { follow, form, signIn } from "./entry-harness";
import * as A from "@/app/app/(shell)/_os/actions";
import * as V from "@/app/app/(shell)/_os/v2";
import { GET as tickRoute } from "@/app/api/os/tick/route";
import { POST as publicForm } from "@/app/api/leados/public/forms/[publicId]/route";
import { createEngagement, seedChecklist } from "@/lib/os/engagement";
import { metricsFor } from "@/lib/os/metrics";
import { businessOutcomes } from "@/lib/os/outcomes";
import { testAdapterLastMediaRefs, testAdapterPosts } from "@/lib/os/adapters";
import * as C from "@/lib/os/content";
import * as P from "@/lib/os/publishing";
import { uploadAsset } from "@/lib/os/assets";
import { defaultFormSpec, defaultPageSpec } from "@/lib/leados/campaigns";
import { encryptField } from "@/lib/leados/crypto";

process.env.GROWTHOS_TEST_ADAPTER = "1"; process.env.CRON_SECRET = "test-cron-secret";
vi.stubGlobal("fetch", async (u: unknown) => { throw new Error(`No network in tests: ${String(u).slice(0, 60)}`); });

const tag = `cj-${Date.now()}`;
let orgId: string, engagementId: string, connectionId: string, goalId: string;
const U: Record<string, string> = {};
const as = (n: string) => signIn(U[n], orgId);
const tick = () => tickRoute(new NextRequest("http://localhost/api/os/tick", { headers: { authorization: "Bearer test-cron-secret" } }));
const ok = (s: { ok?: string; error?: string }) => { expect(s.error).toBeUndefined(); return s; };

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true, timezone: "America/New_York", currency: "INR" } });
  for (const [n, role] of [["owner", "owner"], ["admin", "admin"], ["lead", "cgo_lead"], ["spec", "cgo_specialist"]] as const) {
    U[n] = (await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, demo: true } })).id;
    await db.losMembership.create({ data: { orgId, userId: U[n], role } });
  }
  engagementId = (await createEngagement(orgId, U.lead, { name: `${tag} engagement`, demo: true })).id;
  await db.cosEngagement.update({ where: { id: engagementId }, data: { stage: "active", currency: "INR" } });
  await db.cosContract.create({ data: { orgId, engagementId, status: "active", services: JSON.stringify(["content", "social", "crm"]), modules: JSON.stringify(["content", "crm"]), signedById: U.owner, signedAt: new Date(), demo: true } });
  await seedChecklist(orgId, engagementId, ["content", "social", "crm"]);
  connectionId = (await db.cosConnection.create({ data: { orgId, provider: "test", accountType: "user", externalAccountId: `acct-${tag}`, accountLabel: "Test account", status: "verified", capabilities: ["publish", "analytics"], accessTokenEnc: encryptField("t"), config: JSON.stringify({ mode: "ok" }) } })).id;
  goalId = (await db.cosGoal.create({ data: { orgId, engagementId, metric: "Booked consults", target: 30, unit: "count", horizon: "Q4 2026" } })).id;
});

afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: { in: ["os.publish", "os.metric_sync"] } } });
  await db.cosWorkItem.deleteMany({ where: { orgId } });
  for (const m of ["losFormSubmission", "losConsentEvent", "losLeadSourceRecord", "losActivity"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId } });
  await db.losAttributionEvent.deleteMany({ where: { campaignId: { in: (await db.losCampaign.findMany({ where: { orgId }, select: { id: true } })).map((c) => c.id) } } });
  await db.losCampaignVersion.deleteMany({ where: { campaign: { orgId } } });
  for (const m of ["losLead", "losCampaign", "cosConnection", "cosContract", "cosGoal", "cosWorkspace", "losAuditEvent", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId } });
  await db.losSession.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.losUser.deleteMany({ where: { id: { in: Object.values(U) } } });
});

let campaignId: string, campaignCode: string, variantId: string, leadRowId: string;

describe("delivery journey through entry points", () => {
  it("step 3 — a missing client input blocks only the work that depends on it", async () => {
    await as("lead");
    ok(await A.newWorkItem({}, form({ title: "Write the brand story page", type: "task", serviceSlug: "content" })));
    ok(await A.newWorkItem({}, form({ title: "Tidy CRM stages", type: "task", serviceSlug: "crm" })));
    const dependent = await db.cosWorkItem.findFirstOrThrow({ where: { orgId, title: "Write the brand story page" } });
    const independent = await db.cosWorkItem.findFirstOrThrow({ where: { orgId, title: "Tidy CRM stages" } });
    const profile = await db.cosChecklistItem.findFirstOrThrow({ where: { engagementId, key: "discovery_profile" } });
    ok(await V.dependencyAdd({}, form({ workItemId: dependent.id, onChecklistId: profile.id, note: "Needs the discovery answers" })));
    for (const to of ["scoped", "ready"]) ok(await A.moveWorkItem({}, form({ id: dependent.id, to })));
    expect((await A.moveWorkItem({}, form({ id: dependent.id, to: "in_progress" }))).error).toMatch(/waiting on/i);
    for (const to of ["scoped", "ready", "in_progress"]) ok(await A.moveWorkItem({}, form({ id: independent.id, to }))); // not held up
    await as("owner");
    ok(await V.checklistResolve({}, form({ id: profile.id, status: "available", note: "Filled in the profile" })));
    await as("lead");
    ok(await A.moveWorkItem({}, form({ id: dependent.id, to: "in_progress" })));
  });

  it("steps 8–11 — goal-linked campaign → master → variant → QA → client approval → scheduled → published exactly once by the scheduler", async () => {
    await as("lead");
    const c = await follow(V.campaignCreate({}, form({ name: `${tag} consult drive`, goalId, engagementId, objective: "Book consults", destinationUrl: "https://example.com/consult" })));
    campaignId = c.redirect!.split("/").pop()!;
    campaignCode = (await db.cosCampaign.findUniqueOrThrow({ where: { id: campaignId } })).code;
    const m = await follow(V.masterCreate({}, form({ title: "Why a consult first", campaignId, brief: "Explain the consult", body: "A consult first means a plan that fits." })));
    const masterId = m.redirect!.split("/").pop()!;
    await as("spec");
    ok(await V.variantCreate({}, form({ masterId, channelFormat: "x:post", body: "A consult first means a plan that fits. Book yours.", destinationUrl: "https://example.com/consult", connectionId })));
    variantId = (await db.cosContentVariant.findFirstOrThrow({ where: { orgId, workItemId: masterId } })).id;
    expect((await V.publicationSchedule({}, form({ variantId, now: "1" }))).error).toMatch(/approved/i); // nothing unapproved can be scheduled
    ok(await V.variantMove({}, form({ id: variantId, to: "internal_qa" })));
    await as("lead");
    ok(await V.variantMove({}, form({ id: variantId, to: "client_review" })));
    const approval = await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: variantId, status: "requested" } });
    expect((await A.decide({}, form({ approvalId: approval.id, decision: "approved" }))).error).toBeTruthy(); // staff can never approve
    await as("owner");
    ok(await A.decide({}, form({ approvalId: approval.id, decision: "approved" })));
    await as("spec");
    // 02:30 on 10 March 2030 does not exist in New York (clocks go forward): moved to the next valid time, and said so
    const s = ok(await V.publicationSchedule({}, form({ variantId, localTime: "2030-03-10T02:30" })));
    expect(s.ok).toMatch(/does not exist/i);
    const pub = await db.cosPublication.findFirstOrThrow({ where: { variantId } });
    expect(pub.scheduledAt!.toISOString()).toBe("2030-03-10T07:30:00.000Z");
    expect((await (await tick()).json()).published).toBe(0); // not due
    await db.cosPublication.update({ where: { id: pub.id }, data: { scheduledAt: new Date(Date.now() - 1000) } }); // fixture: time passes
    const runs = await Promise.all([tick(), tick(), tick()]); // overlapping schedulers
    expect(runs.every((r) => r.status === 200)).toBe(true);
    await tick();
    const done = await db.cosPublication.findUniqueOrThrow({ where: { id: pub.id }, include: { attempts: true } });
    expect([done.status, done.attempts.length]).toEqual(["published", 1]);
    const posted = testAdapterPosts().get(done.externalId!)![0];
    const short = (await db.cosShortLink.findFirst({ where: { code: posted.match(/\/l\/([A-Za-z0-9_-]+)/)![1] } }))!.url; // WP-05: short link posted, tagged destination behind it
    expect(short).toContain(`utm_campaign=${campaignCode}`); expect(short).toContain(`utm_content=${variantId}`);
  });

  it("a provider refusal AFTER the media upload: the retry reuses the original upload, posts once, and a finished publication forgets it", async () => {
    const lead = { orgId, userId: U.lead, role: "cgo_lead" }, spec = { orgId, userId: U.spec, role: "cgo_specialist" }, owner = { orgId, userId: U.owner, role: "owner" };
    const busy = await db.cosConnection.create({ data: { orgId, provider: "test", accountType: "user", externalAccountId: `busy-${tag}`, accountLabel: "Busy test account", status: "verified", capabilities: ["publish"], accessTokenEnc: encryptField("t"), config: JSON.stringify({ mode: "retryable_once" }) } });
    const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001", "hex");
    const asset = await uploadAsset(spec, { name: "post.png", mime: "image/png", bytes: PNG, category: "production" });
    const master = await db.cosWorkItem.findFirstOrThrow({ where: { orgId, type: "content" } });
    const v = await C.createVariant(spec, master.id, { channel: "x", format: "post", body: `Retry with media ${tag}`, connectionId: busy.id, mediaAssetIds: [asset.id] });
    await C.moveVariant(spec, v.id, "internal_qa"); await C.moveVariant(lead, v.id, "client_review");
    await C.decideVariantApproval(owner, (await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: v.id, status: "requested" } })).id, "approved");
    const { publication } = await P.schedulePublication(spec, v.id, { now: true });
    await tick(); // attempt 1: upload ok, post refused (503)
    const waiting = await db.cosPublication.findUniqueOrThrow({ where: { id: publication.id } });
    expect(waiting.status).toBe("scheduled");
    expect(JSON.parse(waiting.providerMedia!)[0].id).toBe(`test_media_busy-${tag}`);
    await db.cosPublication.update({ where: { id: publication.id }, data: { scheduledAt: new Date(Date.now() - 1000) } }); // fixture: the back-off elapses
    await Promise.all([tick(), tick()]); await tick();
    const done = await db.cosPublication.findUniqueOrThrow({ where: { id: publication.id }, include: { attempts: true } });
    expect([done.status, done.attempts.map((a) => a.outcome).sort()]).toEqual(["published", ["retryable_failure", "success"]]);
    expect(testAdapterLastMediaRefs()).toEqual({ 0: `test_media_busy-${tag}` }); // the retry was handed the ORIGINAL upload
  });

  it("step 12 — metrics attach to the publication and the campaign; manual rows are labelled; lifetime is not summed", async () => {
    await tick(); // the metric-sync job the scheduler enqueued for the new publication runs here
    const pub = await db.cosPublication.findFirstOrThrow({ where: { variantId } });
    const range = { start: new Date(Date.now() - 7 * 86_400_000), end: new Date(Date.now() + 86_400_000) };
    const synced = await metricsFor(orgId, { publicationId: pub.id }, range, true);
    expect(synced.find((x) => x.metric === "impressions")).toMatchObject({ value: 1200, kind: "lifetime", source: "api" });
    await as("lead");
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    ok(await V.metricRecord({}, form({ provider: "ga4", metric: "sessions", kind: "daily", value: "30", day: day(0), campaignId })));
    ok(await V.metricRecord({}, form({ provider: "ga4", metric: "sessions", kind: "daily", value: "12", day: day(1), campaignId })));
    expect((await metricsFor(orgId, { campaignId }, range, true)).find((x) => x.metric === "sessions")).toMatchObject({ value: 42, source: "manual" });
    await as("owner");
    expect((await V.metricRecord({}, form({ provider: "ga4", metric: "sessions", kind: "daily", value: "999", day: day(0), campaignId }))).error).toBeTruthy(); // clients do not type results
  });

  it("step 13 — a tagged enquiry on the public form becomes an opportunity and a recorded sale; an untagged one stays unknown", async () => {
    const lf = await db.losCampaign.create({ data: { orgId, name: `${tag} consult form`, status: "active", createdById: U.lead, demo: true } });
    await db.losCampaignVersion.create({ data: { campaignId: lf.id, version: 1, formSpec: JSON.stringify(defaultFormSpec()), pageSpec: JSON.stringify(defaultPageSpec("Synthetic Clinic")) } });
    await as("lead");
    ok(await V.captureFormLink({}, form({ campaignId, losCampaignId: lf.id })));
    const submit = (email: string, utm: Record<string, string>, ip: string) => publicForm(new NextRequest(`http://localhost/api/leados/public/forms/${lf.publicId}`, { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ values: { firstName: "Asha", lastName: "Synthetic", email, phone: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` }, consentChecked: true, utm }) }), { params: Promise.resolve({ publicId: lf.publicId }) });
    expect((await submit(`${tag}-tagged@example.com`, { utm_source: "x", utm_medium: "social", utm_campaign: campaignCode, utm_content: variantId }, "10.9.0.1")).status).toBe(200);
    expect((await submit(`${tag}-plain@example.com`, {}, "10.9.0.2")).status).toBe(200);
    const tagged = await db.losLead.findFirstOrThrow({ where: { orgId, attributionKind: "known" } });
    expect(tagged).toMatchObject({ marketingCampaignId: campaignId, variantId });
    expect(await db.losLead.count({ where: { orgId, attributionKind: "unknown" } })).toBeGreaterThanOrEqual(1);
    leadRowId = tagged.id;
    expect((await V.opportunityCreate({}, form({ leadId: leadRowId, title: "x" }))).error).toMatch(/forbidden/i); // sales outcomes are the CLIENT's to record, not Catalyst's
    await as("owner");
    ok(await V.opportunityCreate({}, form({ leadId: leadRowId, title: "Implant consult", value: "85000", currency: "inr" })));
    const opp = await db.cosOpportunity.findFirstOrThrow({ where: { orgId, leadId: leadRowId } });
    expect(opp).toMatchObject({ campaignId, attributionKind: "known", status: "open" });
    ok(await V.opportunityStatus({}, form({ id: opp.id, status: "won", value: "82000", currency: "inr", closeDate: new Date().toISOString().slice(0, 10) })));
    const out = await businessOutcomes(orgId, { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + 86_400_000) }, { campaignId, includeDemo: true });
    expect(out.sales.INR).toMatchObject({ count: 1, valueMinor: 8_200_000n, known: 8_200_000n });
  });

  it("step 15 — the scheduler generates a recurring cycle once, however often it runs", async () => {
    await as("lead");
    ok(await V.engagementUpdate({}, form({ id: engagementId, billingInterval: "monthly", recurringFee: "50000", currency: "INR", startsAt: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) })));
    await Promise.all([tick(), tick()]); await tick();
    expect(await db.cosCycle.count({ where: { engagementId } })).toBe(1);
    expect(await db.cosCommercialRecord.count({ where: { engagementId, kind: "recurring" } })).toBe(1);
    expect((await V.cycleGenerate({}, form({ id: engagementId }))).ok).toMatch(/already generated/i);
  });

  it("step 16 — a client request outside scope cannot start until the OWNER approves its fee; it is charged once", async () => {
    await as("owner");
    ok(await A.requestService({}, form({ title: "Paid ads pilot", serviceSlug: "paid-ads", details: "Try a small Google Ads test" })));
    const cr = await db.cosWorkItem.findFirstOrThrow({ where: { orgId, title: "Paid ads pilot" } });
    expect(cr.type).toBe("change_request");
    expect((await A.requestChangeApproval({}, form({ id: cr.id }))).error).toBeTruthy(); // a client cannot send it to themselves
    await as("lead");
    expect((await A.requestChangeApproval({}, form({ id: cr.id }))).error).toMatch(/scope the request first/i);
    ok(await A.moveWorkItem({}, form({ id: cr.id, to: "scoped" })));
    ok(await A.saveWorkItem({}, form({ id: cr.id, title: "Paid ads pilot", estMinutes: "600", incrementalCharge: "25000" })));
    expect((await A.moveWorkItem({}, form({ id: cr.id, to: "ready" }))).error).toMatch(/out of contracted scope/i);
    ok(await A.requestChangeApproval({}, form({ id: cr.id })));
    const approval = await db.cosApproval.findFirstOrThrow({ where: { workItemId: cr.id, status: "requested" } });
    await as("admin");
    expect((await A.decide({}, form({ approvalId: approval.id, decision: "approved" }))).error).toMatch(/owner/i); // money needs the owner
    await as("owner");
    ok(await A.decide({}, form({ approvalId: approval.id, decision: "approved" })));
    await A.decide({}, form({ approvalId: approval.id, decision: "approved" })); // double click
    const recs = await db.cosCommercialRecord.findMany({ where: { engagementId, kind: "change", workItemId: cr.id } });
    expect(recs.map((r) => [r.amountMinor, r.currency, r.status])).toEqual([[2_500_000n, "INR", "draft"]]);
    await as("lead");
    ok(await A.moveWorkItem({}, form({ id: cr.id, to: "ready" })));
  });
});
