// GrowthOS v2 — required end-to-end acceptance (brief §L, steps 1–15) plus the priority negatives
// (brief §K), against the disposable local *_test database. External steps use the EXPLICIT test
// adapter (provider "test", GROWTHOS_TEST_ADAPTER=1): they are TEST-verified, never live-verified.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { entitlements, monthlyUsage } from "@/lib/os/entitlements";
import { createWorkItem, decideApproval, instantiateProject, transitionWorkItem, type WorkActor } from "@/lib/os/work";
import * as E from "@/lib/os/engagement";
import * as C from "@/lib/os/content";
import * as P from "@/lib/os/publishing";
import * as M from "@/lib/os/commercial";
import { testAdapterPosts } from "@/lib/os/adapters";
import { campaignContentTotals, metricsFor, recordManualSnapshot, syncPublicationMetrics, upsertSnapshot } from "@/lib/os/metrics";
import { businessOutcomes, createOpportunity, setOpportunityStatus } from "@/lib/os/outcomes";
import { assetManifest, readAsset, uploadAsset } from "@/lib/os/assets";
import { buildExport } from "@/lib/os/exporter";
import { processSubmission } from "@/lib/leados/submission";
import { defaultFormSpec, defaultPageSpec } from "@/lib/leados/campaigns";
import { encryptField } from "@/lib/leados/crypto";

process.env.GROWTHOS_TEST_ADAPTER = "1";
process.env.ASSET_STORAGE = "local";

const tag = `v2-acc-${Date.now()}`;
let orgId: string, otherOrgId: string, engagementId: string;
let lead: WorkActor, specialist: WorkActor, owner: WorkActor, outsider: WorkActor;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001", "hex");

const user = async (n: string) => (await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, demo: true } })).id;
const testConn = (org: string, mode = "ok", caps = ["publish", "analytics"]) =>
  db.cosConnection.create({ data: { orgId: org, provider: "test", accountType: "user", externalAccountId: `acct-${mode}-${Math.random().toString(36).slice(2, 7)}`, accountLabel: `Test account (${mode})`, status: "verified", capabilities: caps, accessTokenEnc: encryptField("t"), config: JSON.stringify({ mode }) } });

/** master → variant → QA → client approval, returns the approved variant id */
async function approvedVariant(masterId: string, connectionId: string, input: Partial<C.VariantInput> = {}) {
  const v = await C.createVariant(specialist, masterId, { channel: "x", format: "post", body: `Synthetic post ${Math.random().toString(36).slice(2)} about booking a consult`, connectionId, ...input });
  await C.moveVariant(specialist, v.id, "internal_qa");
  await C.moveVariant(lead, v.id, "client_review");
  const approval = await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: v.id, status: "requested" } });
  await C.decideVariantApproval(owner, approval.id, "approved");
  return v.id;
}

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  otherOrgId = (await db.losOrg.create({ data: { name: `${tag}-other`, demo: true } })).id;
  await db.cosWorkspace.createMany({ data: [{ orgId, kind: "prospect", demo: true, timezone: "America/New_York" }, { orgId: otherOrgId, kind: "client", demo: true }] });
  lead = { orgId, userId: await user("lead"), role: "cgo_lead" };
  specialist = { orgId, userId: await user("spec"), role: "cgo_specialist" };
  owner = { orgId, userId: await user("owner"), role: "owner" };
  outsider = { orgId: otherOrgId, userId: await user("outsider"), role: "cgo_lead" };
  for (const a of [lead, specialist, owner]) await db.losMembership.create({ data: { orgId, userId: a.userId, role: a.role } });
});

afterAll(async () => {
  const orgs = [orgId, otherOrgId];
  await db.losJob.deleteMany({ where: { type: { in: ["os.publish", "os.metric_sync"] } } });
  await db.cosWorkItem.deleteMany({ where: { orgId: { in: orgs } } });
  for (const m of ["losFormSubmission", "losConsentEvent", "losLeadSourceRecord", "losActivity"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId: { in: orgs } } });
  await db.losAttributionEvent.deleteMany({ where: { campaignId: { in: (await db.losCampaign.findMany({ where: { orgId: { in: orgs } }, select: { id: true } })).map((c) => c.id) } } });
  await db.losCampaignVersion.deleteMany({ where: { campaign: { orgId: { in: orgs } } } });
  await db.losLead.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losCampaign.deleteMany({ where: { orgId: { in: orgs } } });
  for (const m of ["cosConnection", "cosContract", "cosGoal", "cosWorkspace", "losAuditEvent", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId: { in: orgs } } });
  await db.losOrg.deleteMany({ where: { id: { in: orgs } } }); // v2 tables cascade from the org
  await db.losUser.deleteMany({ where: { email: { startsWith: tag } } });
  await db.$disconnect();
});

describe("GrowthOS v2 acceptance", { timeout: 120_000 }, () => {
  let goalId: string, campaignId: string, masterId: string, connId: string, variantId: string, publicationId: string, leadId: string;

  it("1. staff provisions an engagement from a partner opportunity — linking the same deal twice never duplicates", async () => {
    const dealId = `deal-${tag}`;
    const [a, b] = await Promise.all([1, 2].map(() => E.createEngagement(orgId, lead.userId, { name: "Growth engagement", partnerDealId: dealId, goalFocus: ["visibility", "acquisition"], demo: true })));
    expect(a.id).toBe(b.id);
    expect(a.entrySource).toBe("partner");
    expect(await db.cosEngagement.count({ where: { partnerDealId: dealId } })).toBe(1);
    await expect(E.createEngagement(otherOrgId, outsider.userId, { name: "steal", partnerDealId: dealId })).rejects.toThrow("another organisation");
    engagementId = a.id;
    // a second engagement for the same organisation is fine
    const second = await E.createEngagement(orgId, lead.userId, { name: "Website rebuild", goalFocus: ["product"], demo: true });
    expect(second.id).not.toBe(engagementId);
    await E.moveEngagement(lead, second.id, "declined", "Postponed by the client");
  });

  it("2. the client receives the correct scope and onboarding requests; only their signature accepts", async () => {
    await E.moveEngagement(lead, engagementId, "discovery");
    await E.moveEngagement(lead, engagementId, "proposal");
    await expect(E.moveEngagement(lead, engagementId, "accepted")).rejects.toThrow("signs");
    const services = ["social", "content", "website", "crm"];
    const contract = await db.cosContract.create({ data: { orgId, engagementId, kind: "project", services: JSON.stringify(services), modules: JSON.stringify(["content", "projects", "crm"]), status: "proposed", demo: true } });
    // what signContract does once the owner signs:
    await db.cosContract.update({ where: { id: contract.id }, data: { status: "active", signedById: owner.userId, signedAt: new Date() } });
    await E.acceptEngagementBySignature(orgId, engagementId, owner.userId);
    const created = await E.seedChecklist(orgId, engagementId, services);
    expect(created).toBeGreaterThan(8);
    expect(await E.seedChecklist(orgId, engagementId, services)).toBe(0); // idempotent
    const e = await db.cosEngagement.findUniqueOrThrow({ where: { id: engagementId } });
    expect(e.stage).toBe("accepted");
    const items = await db.cosChecklistItem.findMany({ where: { engagementId } });
    expect(items.filter((i) => i.key === "brand_assets")).toHaveLength(1); // shared intake asked once
    expect(items.some((i) => i.key === "website.domain_dns" && i.kind === "access")).toBe(true);
    const ent = await entitlements(orgId);
    expect([...ent.services].sort()).toEqual([...services].sort());
    expect(ent.modules.has("content") && ent.modules.has("crm") && !ent.modules.has("ads")).toBe(true);
    await E.moveEngagement(lead, engagementId, "onboarding");
    await expect(E.resolveChecklistItem(owner, items.find((i) => i.key === "website_access")!.id, "available", { note: "password: hunter2" })).rejects.toThrow("Never paste passwords");
  });

  it("3. missing access blocks dependent work while independent work continues", async () => {
    await E.moveEngagement(lead, engagementId, "active", "Starting with what we can; access-dependent work waits");
    const project = await instantiateProject(lead, "website", "New website", true, { engagementId });
    const ms = await db.cosWorkItem.findMany({ where: { parentId: project.id } });
    const by = (k: string) => ms.find((m) => m.templateKey === `website.${k}`)!;
    expect(by("design").assignRole).toBe("designer");
    expect(by("launch").acceptanceCriteria).toContain("rollback");
    // discovery needs the discovery profile (pending) → blocked
    for (const s of ["scoped", "ready"]) await transitionWorkItem(lead, by("discovery").id, s);
    await expect(transitionWorkItem(lead, by("discovery").id, "in_progress")).rejects.toThrow("Waiting on");
    // independent work (no prerequisites) is NOT held up by it
    const independent = await createWorkItem(lead, { title: "Audit current CRM fields", serviceSlug: "crm", engagementId });
    for (const s of ["scoped", "ready", "in_progress"]) await transitionWorkItem(lead, independent.id, s);
    expect((await db.cosWorkItem.findUniqueOrThrow({ where: { id: independent.id } })).state).toBe("in_progress");
    // the client provides the input → the dependent item is free
    const profile = await db.cosChecklistItem.findFirstOrThrow({ where: { engagementId, key: "discovery_profile" } });
    await E.resolveChecklistItem(owner, profile.id, "available", { note: "Completed in Settings" });
    await transitionWorkItem(lead, by("discovery").id, "in_progress");
    // milestone order is enforced too: sitemap waits for discovery
    for (const s of ["scoped", "ready"]) await transitionWorkItem(lead, by("sitemap").id, s);
    await expect(transitionWorkItem(lead, by("sitemap").id, "in_progress")).rejects.toThrow("Discovery");
    // an access item naming a provider cannot be ticked without a verified connection
    const social = await db.cosChecklistItem.findFirstOrThrow({ where: { engagementId, key: "social.social_accounts" } });
    await expect(E.resolveChecklistItem(owner, social.id, "available")).rejects.toThrow("Connect and verify");
  });

  it("4. a goal links to a campaign and a delivery plan", async () => {
    goalId = (await db.cosGoal.create({ data: { orgId, engagementId, focus: "acquisition", metric: "Qualified enquiries", target: 40, unit: "per month", horizon: "6 months" } })).id;
    const c = await C.createCampaign(lead, { name: "Spring Consult Drive", goalId, objective: "Book consultations", destinationUrl: "https://example.com/book", channels: ["x", "linkedin", "blog"], cta: "Book a consult" });
    campaignId = c.id;
    expect(c.code).toBe("spring-consult-drive");
    expect(c.engagementId).toBe(engagementId);
    expect((await C.createCampaign(lead, { name: "Spring Consult Drive" })).code).toBe("spring-consult-drive-2"); // codes stay unique + stable
    await expect(C.createCampaign(outsider, { name: "x", goalId })).rejects.toThrow(); // other tenant: no content scope, and the goal is not theirs
    const plan = await instantiateProject(lead, "social", "Social programme", true, { engagementId, goalId, campaignId });
    expect(plan.goalId).toBe(goalId);
    expect(plan.campaignId).toBe(campaignId);
  });

  it("5. source-grounded master content becomes separately editable channel variants", async () => {
    const src = await C.addSource(lead, { title: "Clinic fact sheet", excerpt: "Open six days a week. 1200 patients served since 2015." });
    const claim = await C.proposeClaim(lead, "1200 patients served since 2015", { sourceId: src.id });
    await expect(C.decideClaim(lead, claim.id, "approved")).rejects.toThrow("Forbidden"); // staff cannot approve a client's claim
    await C.decideClaim(owner, claim.id, "approved");
    const master = await C.createMaster(lead, { title: "Why a consult first", campaignId, brief: "Explain the consult", body: "Master copy about consults.", sourceIds: [src.id], claimIds: [claim.id] });
    masterId = master.id;
    expect(master.type).toBe("content");
    expect(master.campaignId).toBe(campaignId);
    expect(master.goalId).toBe(goalId); // inherited from the campaign
    connId = (await testConn(orgId)).id;
    const x = await C.createVariant(specialist, masterId, { channel: "x", format: "post", body: "Thinking about treatment? Start with a consult.", connectionId: connId, destinationUrl: "https://example.com/book" });
    const thread = await C.createVariant(specialist, masterId, { channel: "x", format: "thread", parts: ["1/ Why a consult first", "2/ What happens in it", "3/ How to book"], connectionId: connId });
    const yt = await C.createVariant(specialist, masterId, { channel: "youtube", format: "short", title: "Consult in 30s", body: "SCRIPT: hook, 3 points, CTA" });
    variantId = x.id;
    await C.editVariant(specialist, thread.id, { parts: ["1/ Why a consult comes first", "2/ What happens in it", "3/ How to book"] });
    const [x2, t2] = await Promise.all([x.id, thread.id].map((id) => db.cosContentVariant.findUniqueOrThrow({ where: { id } })));
    expect([x2.version, t2.version]).toEqual([1, 2]); // editing one variant leaves its sibling alone
    expect(await db.cosRevision.count({ where: { subject: "variant", subjectId: thread.id } })).toBe(2);
    // a script is not a video: a Short without a finished video file cannot go to review
    await C.moveVariant(specialist, yt.id, "internal_qa");
    await expect(C.moveVariant(lead, yt.id, "client_review")).rejects.toThrow("not a video");
    await expect(C.createVariant(specialist, masterId, { channel: "x", format: "post", body: "b", connectionId: (await testConn(otherOrgId)).id })).rejects.toThrow("not found"); // another tenant's account
    // duplicate-content safeguard
    const dup = await C.createVariant(specialist, masterId, { channel: "x", format: "post", body: "THINKING about treatment?  Start with a consult!" });
    expect((await C.duplicatesOf(orgId, dup.id)).map((d) => d.id)).toContain(x.id);
    await C.moveVariant(specialist, dup.id, "cancelled");
  });

  it("6. internal QA precedes the required client approval; staff can never approve", async () => {
    await expect(C.moveVariant(specialist, variantId, "client_review")).rejects.toThrow("Cannot move"); // draft → review skips QA
    await C.moveVariant(specialist, variantId, "internal_qa");
    await expect(C.moveVariant(specialist, variantId, "client_review")).rejects.toThrow("Forbidden"); // a specialist cannot pass their own QA
    await expect(C.moveVariant(lead, variantId, "approved")).rejects.toThrow("client's approval");
    await C.moveVariant(lead, variantId, "client_review");
    const approval = await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: variantId, status: "requested" } });
    await expect(C.decideVariantApproval(lead, approval.id, "approved")).rejects.toThrow("Forbidden");
    await expect(decideApproval(owner, approval.id, "approved")).rejects.toThrow("not found"); // the work-item engine refuses variant approvals
    await expect(C.decideVariantApproval({ ...outsider, role: "owner" }, approval.id, "approved")).rejects.toThrow("not found"); // other tenant
    await C.decideVariantApproval(owner, approval.id, "approved");
    expect((await db.cosContentVariant.findUniqueOrThrow({ where: { id: variantId } })).state).toBe("approved");
    expect(await db.cosNotification.count({ where: { orgId, audience: "client", kind: "approval_requested" } })).toBeGreaterThan(0);
  });

  it("7. editing an approved variant invalidates ITS approval — shared-source changes only flag", async () => {
    const sibling = await approvedVariant(masterId, connId);
    // brief change = shared source: variants are flagged, approvals stay
    await C.updateCampaign(lead, campaignId, { keyMessage: "A consult costs nothing" });
    const flagged = await db.cosContentVariant.findUniqueOrThrow({ where: { id: sibling } });
    expect([flagged.sourceChanged, flagged.state]).toEqual([true, "approved"]);
    await C.acknowledgeSourceChange(lead, sibling);
    await P.schedulePublication(specialist, sibling, { localTime: "2030-06-01T09:00", timezone: "America/New_York" });
    // material edit: approval revoked, scheduled publication cancelled, back to QA
    const r = await C.editVariant(specialist, sibling, { destinationUrl: "https://example.com/other" });
    expect(r).toEqual({ material: true, approvalsRevoked: true });
    const after = await db.cosContentVariant.findUniqueOrThrow({ where: { id: sibling } });
    expect([after.state, after.version, after.scheduledAt]).toEqual(["internal_qa", 2, null]);
    expect((await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: sibling }, orderBy: { createdAt: "desc" } })).status).toBe("revoked");
    expect((await db.cosPublication.findFirstOrThrow({ where: { variantId: sibling } })).status).toBe("cancelled");
    await expect(P.schedulePublication(specialist, sibling, { now: true })).rejects.toThrow("approved");
    // the untouched variant keeps its approval
    expect((await db.cosContentVariant.findUniqueOrThrow({ where: { id: variantId } })).state).toBe("approved");
  });

  it("8. an approved variant schedules in the workspace zone and publishes exactly once", async () => {
    const s = await P.schedulePublication(specialist, variantId, { localTime: "2030-03-10T02:30" }); // workspace zone = New York; 02:30 does not exist that day
    expect(s.dstNote).toBe("gap_shifted_forward");
    expect(s.publication.scheduledAt.toISOString()).toBe("2030-03-10T07:30:00.000Z");
    expect(s.publication.adapter).toBe("test");
    await expect(P.schedulePublication(specialist, variantId, { now: true })).rejects.toThrow("Only an approved variant"); // a scheduled variant cannot be scheduled twice
    expect(await P.executePublication(s.publication.id)).toBe("skipped"); // not due yet
    await P.reschedulePublication(specialist, s.publication.id, "2030-03-11T09:00");
    const pub = await db.cosPublication.findFirstOrThrow({ where: { variantId } });
    publicationId = pub.id;
    await db.cosPublication.update({ where: { id: pub.id }, data: { scheduledAt: new Date(Date.now() - 1000) } }); // time passes
    // ten workers race for the same publication
    const results = await Promise.all(Array.from({ length: 10 }, () => P.executePublication(pub.id)));
    expect(results.filter((r) => r === "published")).toHaveLength(1);
    expect(results.filter((r) => r === "skipped")).toHaveLength(9);
    const done = await db.cosPublication.findUniqueOrThrow({ where: { id: pub.id }, include: { attempts: true } });
    expect([done.status, done.attempts.length, done.attemptCount]).toEqual(["published", 1, 1]);
    const posted = testAdapterPosts().get(done.externalId!)![0];
    expect(posted).toContain("utm_campaign=spring-consult-drive");
    expect(posted).toContain(`utm_content=${variantId}`);
    expect(await P.executePublication(pub.id)).toBe("skipped");
    await expect(P.schedulePublication(specialist, variantId, { now: true })).rejects.toThrow("approved"); // published variants cannot go again
  });

  it("8b. provider outcomes: retry only when safe, never after an ambiguous answer, resume threads without re-posting", async () => {
    const due = (id: string) => db.cosPublication.updateMany({ where: { variantId: id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
    const run = async (mode: string, input: Partial<C.VariantInput> = {}) => {
      const v = await approvedVariant(masterId, (await testConn(orgId, mode)).id, input);
      const { publication } = await P.schedulePublication(specialist, v, { now: true });
      return { v, id: publication.id, result: await P.executePublication(publication.id) };
    };
    const retry = await run("retryable_once");
    expect(retry.result).toBe("retry_scheduled");
    await due(retry.v);
    expect(await P.executePublication(retry.id)).toBe("published");
    expect((await db.cosPublishAttempt.findMany({ where: { publicationId: retry.id }, orderBy: { n: "asc" } })).map((a) => a.outcome)).toEqual(["retryable_failure", "success"]);

    const unsure = await run("uncertain");
    expect(unsure.result).toBe("uncertain");
    expect(await P.executePublication(unsure.id)).toBe("skipped"); // nothing re-runs it
    expect(await P.runDuePublications()).toBe(0);
    expect((await db.cosContentVariant.findUniqueOrThrow({ where: { id: unsure.v } })).state).toBe("needs_review");
    await expect(P.reconcilePublication(specialist, unsure.id, "live", {})).rejects.toThrow("link");
    await P.reconcilePublication(specialist, unsure.id, "live", { externalUrl: "https://test.invalid/post/found-it" });
    expect((await db.cosPublication.findUniqueOrThrow({ where: { id: unsure.id } })).status).toBe("published");

    const partial = await run("partial", { format: "thread", body: "", parts: ["one", "two", "three"] });
    expect(partial.result).toBe("partial");
    const p = await db.cosPublication.findUniqueOrThrow({ where: { id: partial.id } });
    expect([p.partsDone, p.partsTotal]).toEqual([1, 3]);
    await expect(P.reconcilePublication(specialist, partial.id, "not_live", {})).rejects.toThrow("Some parts are live");

    const rejected = await run("definite");
    expect(rejected.result).toBe("failed");
    expect(await db.cosNotification.count({ where: { orgId, kind: { in: ["publish_failed", "publish_uncertain"] } } })).toBeGreaterThanOrEqual(3);
  });

  it("8c. publish-time revalidation: kill switch, lost connection, lost capability", async () => {
    const v = await approvedVariant(masterId, connId);
    const { publication } = await P.schedulePublication(specialist, v, { now: true });
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: true } });
    expect(await P.executePublication(publication.id)).toBe("failed");
    expect((await db.cosPublication.findUniqueOrThrow({ where: { id: publication.id } })).lastError).toContain("Kill switch");
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: false } });
    const readOnly = await testConn(orgId, "ok", ["analytics"]);
    const v2 = await approvedVariant(masterId, readOnly.id);
    await expect(P.schedulePublication(specialist, v2, { now: true })).rejects.toThrow("cannot publish");
    // manual execution is recorded honestly, with evidence, and still needs the approval
    const manual = await P.recordManualPublication(specialist, v2, "https://www.linkedin.com/feed/update/urn:li:share:1/");
    expect([manual.adapter, manual.status]).toEqual(["manual", "published"]);
    const draft = await C.createVariant(specialist, masterId, { channel: "linkedin", format: "post", body: "Not approved yet, synthetic" });
    await expect(P.recordManualPublication(specialist, draft.id, "https://example.com/x")).rejects.toThrow("approved");
  });

  it("9. publication identity links to synced and imported analytics — lifetime totals are never summed across days", async () => {
    expect(await syncPublicationMetrics(publicationId)).toBe(2);
    expect(await syncPublicationMetrics(publicationId)).toBe(2); // re-sync overwrites the same day
    await upsertSnapshot(orgId, { provider: "test", metric: "impressions", kind: "lifetime", value: 900, day: new Date(Date.now() - 86_400_000), publicationId, demo: true });
    await recordManualSnapshot(lead, { provider: "ga4", metric: "sessions", kind: "daily", value: 30, day: new Date(), campaignId, grade: "C" });
    await recordManualSnapshot(lead, { provider: "ga4", metric: "sessions", kind: "daily", value: 12, day: new Date(Date.now() - 86_400_000), campaignId, grade: "C" });
    const range = { start: new Date(Date.now() - 7 * 86_400_000), end: new Date(Date.now() + 86_400_000) };
    const pubMetrics = await metricsFor(orgId, { publicationId }, range, true);
    expect(pubMetrics.find((m) => m.metric === "impressions")!.value).toBe(1200); // latest lifetime, not 900 + 1200
    const camp = await metricsFor(orgId, { campaignId }, range, true);
    expect(camp.find((m) => m.metric === "sessions")).toMatchObject({ value: 42, source: "manual" }); // daily increments DO add
    expect(await metricsFor(orgId, { publicationId }, range, false)).toEqual([]); // demo rows are excluded from a real client's report
    expect(camp.find((m) => m.metric === "watch_time_minutes")).toBeUndefined(); // unsupported = absent, never 0
    const totals = await campaignContentTotals(orgId, campaignId, range, true);
    expect(totals.totals.find((t) => t.metric === "impressions")!.value).toBeGreaterThanOrEqual(1200);
    await expect(recordManualSnapshot(owner, { provider: "x", metric: "likes", kind: "daily", value: 1, day: new Date() })).rejects.toThrow("Forbidden");
    await expect(recordManualSnapshot(lead, { provider: "ads", metric: "spend", kind: "daily", value: 100, day: new Date() })).rejects.toThrow("currency");
  });

  it("10. a campaign link generates an enquiry on the hosted form", async () => {
    const form = await db.losCampaign.create({ data: { orgId, name: `${tag} consult form`, status: "active", marketingCampaignId: campaignId, createdById: lead.userId, demo: true } });
    await db.losCampaignVersion.create({ data: { campaignId: form.id, version: 1, formSpec: JSON.stringify(defaultFormSpec()), pageSpec: JSON.stringify(defaultPageSpec("Synthetic Clinic")) } });
    const submit = (email: string, utm: Record<string, string>, extra: Record<string, string> = {}) => processSubmission({ campaignId: form.id, values: { firstName: "Asha", lastName: "Synthetic", email, phone: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, ...extra }, consentChecked: true, utm });
    expect((await submit(`${tag}-tagged@example.com`, { utm_source: "x", utm_medium: "social", utm_campaign: "spring-consult-drive", utm_content: variantId })).outcome).toBe("accepted");
    expect((await submit(`${tag}-untagged@example.com`, {})).outcome).toBe("accepted");
    expect((await submit(`${tag}-foreign@example.com`, { utm_campaign: "someone-elses-campaign", utm_content: "not-a-variant" })).outcome).toBe("accepted");
    const tagged = await db.losLead.findFirstOrThrow({ where: { orgId, normalizedEmail: `${tag}-tagged@example.com` } });
    leadId = tagged.id;
    expect([tagged.attributionKind, tagged.marketingCampaignId, tagged.variantId, tagged.utmSource]).toEqual(["known", campaignId, variantId, "x"]);
    const untagged = await db.losLead.findFirstOrThrow({ where: { orgId, normalizedEmail: `${tag}-untagged@example.com` } });
    expect([untagged.attributionKind, untagged.marketingCampaignId]).toEqual(["unknown", campaignId]); // the form tells us the campaign, not the source
    const foreign = await db.losLead.findFirstOrThrow({ where: { orgId, normalizedEmail: `${tag}-foreign@example.com` } });
    expect([foreign.attributionKind, foreign.variantId]).toEqual(["unknown", null]); // unknown tags are never trusted
  });

  it("11. the enquiry links to a sales opportunity and a recorded outcome", async () => {
    const opp = await createOpportunity({ ...owner, role: "owner" }, { leadId, title: "Implant treatment" });
    expect([opp.campaignId, opp.variantId, opp.engagementId, opp.attributionKind]).toEqual([campaignId, variantId, engagementId, "known"]);
    await expect(setOpportunityStatus(owner, opp.id, "won")).rejects.toThrow("amount, currency and close date");
    await setOpportunityStatus(owner, opp.id, "won", { value: "85000", currency: "INR", closeDate: new Date() });
    expect((await db.losLead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("converted");
    await expect(createOpportunity({ ...outsider, role: "owner" }, { leadId })).rejects.toThrow("not found");
    // full chain, in one query path: engagement → goal → campaign → content → variant → publication → lead → sale
    const chain = await db.cosOpportunity.findUniqueOrThrow({ where: { id: opp.id } });
    const variant = await db.cosContentVariant.findUniqueOrThrow({ where: { id: chain.variantId! }, include: { publications: true, workItem: true } });
    const campaign = await db.cosCampaign.findUniqueOrThrow({ where: { id: variant.workItem.campaignId! } });
    expect([campaign.goalId, campaign.engagementId, variant.publications[0].status]).toEqual([goalId, engagementId, "published"]);
  });

  it("12. reports preserve source, date, currency and attribution limits — currencies are never mixed", async () => {
    const usd = await createOpportunity(owner, { leadId, title: "US referral" });
    await setOpportunityStatus(owner, usd.id, "won", { value: "1200", currency: "USD", closeDate: new Date() });
    const range = { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + 86_400_000) };
    const o = await businessOutcomes(orgId, range, { includeDemo: true });
    expect(o.leads).toMatchObject({ known: 1, unknown: 2, self_reported: 0, total: 3 });
    expect(Object.keys(o.sales).sort()).toEqual(["INR", "USD"]);
    expect([o.sales.INR.valueMinor, o.sales.INR.known, o.sales.USD.valueMinor]).toEqual([8_500_000n, 8_500_000n, 120_000n]);
    expect(o.limitations).toContain("not proof");
    expect((await businessOutcomes(orgId, range, { includeDemo: false })).leads.total).toBe(0); // synthetic rows never reach a real report
    const snap = await db.cosMetricSnapshot.findFirstOrThrow({ where: { orgId, publicationId, metric: "impressions" }, orderBy: { periodStart: "desc" } });
    expect([snap.source, snap.kind, snap.provider, snap.syncedAt instanceof Date]).toEqual(["api", "lifetime", "test", true]);
  });

  it("13. a recurring engagement generates its next cycle once, and honours a pause", async () => {
    await E.updateEngagement(lead, engagementId, { billingInterval: "monthly", recurringFeeMinor: 5_000_000n, currency: "INR" });
    const results = await Promise.all([1, 2, 3, 4].map(() => E.generateCycle(orgId, engagementId)));
    expect(results.filter((r) => r.created > 0)).toHaveLength(1);
    expect(results.filter((r) => r.skipped === "already generated")).toHaveLength(3);
    const cycle = await db.cosCycle.findFirstOrThrow({ where: { engagementId } });
    expect(await db.cosWorkItem.count({ where: { orgId, cycleId: cycle.id } })).toBe(results.find((r) => r.created > 0)!.created);
    expect(await db.cosCommercialRecord.count({ where: { engagementId, kind: "recurring" } })).toBe(1); // one fee per cycle
    const nextMonth = new Date(Date.now() + 32 * 86_400_000);
    await E.setHold(lead, engagementId, "paused", "Client travelling");
    expect((await E.generateCycle(orgId, engagementId, nextMonth)).skipped).toBe("paused");
    await E.setHold(lead, engagementId, "none", "");
    // delivered work is counted by deliveredAt, in the workspace zone — touching it later changes nothing
    const item = await createWorkItem(lead, { title: "Monthly report", serviceSlug: "content", engagementId, clientReviewRequired: false, riskTier: 1 });
    for (const s of ["scoped", "ready", "in_progress", "internal_qa", "approved", "delivered"]) await transitionWorkItem(lead, item.id, s);
    const before = (await monthlyUsage(orgId, new Date(), "America/New_York")).delivered;
    await db.cosWorkItem.update({ where: { id: item.id }, data: { priority: 1 } });
    expect((await monthlyUsage(orgId, new Date(), "America/New_York")).delivered).toBe(before);
    expect((await monthlyUsage(orgId, nextMonth, "America/New_York")).delivered).toBe(0);
    expect((await monthlyUsage(orgId)).aiCostMicros).toBeNull(); // no AI calls priced → unknown, not zero
  });

  it("14. an out-of-scope request follows commercial approval, charged once, paid only on evidence", async () => {
    const cr = await createWorkItem(lead, { title: "Paid ads pilot", serviceSlug: "paid-ads", engagementId, commercial: { incrementalCharge: 25000 } });
    expect(cr.type).toBe("change_request");
    await transitionWorkItem(lead, cr.id, "scoped");
    await expect(transitionWorkItem(lead, cr.id, "ready")).rejects.toThrow("Out of contracted scope");
    const { requestApproval } = await import("@/lib/os/work");
    const approval = await requestApproval(lead, cr.id);
    await expect(decideApproval({ ...owner, role: "admin" }, approval.id, "approved")).rejects.toThrow("owner"); // money needs the owner
    await decideApproval(owner, approval.id, "approved");
    const rec = await db.cosCommercialRecord.findFirstOrThrow({ where: { engagementId, kind: "change", workItemId: cr.id } });
    expect([rec.amountMinor, rec.currency, rec.status]).toEqual([2_500_000n, "INR", "draft"]);
    await M.recordApprovedChange(orgId, engagementId, cr.id, cr.title, 25000, owner.userId); // replay
    expect(await db.cosCommercialRecord.count({ where: { engagementId, kind: "change" } })).toBe(1);
    await transitionWorkItem(lead, cr.id, "ready");
    await M.issueRecord(lead, rec.id, "INV-SYN-001");
    expect((await db.cosEngagement.findUniqueOrThrow({ where: { id: engagementId } })).paymentStatus).toBe("invoiced");
    await expect(M.recordExternalPayment(owner, rec.id, "25000", "NEFT-1")).rejects.toThrow("Forbidden");
    // provider-verified payment: signed webhook, applied exactly once, amount + currency must match
    const event = { id: `evt_${tag}`, type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 2_500_000, currency: "inr", metadata: { kind: "growthos_record", recordId: rec.id } } } };
    const raw = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
    expect(M.verifyStripeSignature(raw, `t=${t},v1=${createHmac("sha256", "whsec_x").update(`${t}.${raw}`).digest("hex")}`, "whsec_x")).toBe(true);
    const [first, second] = [await M.handleStripeEvent(event), await M.handleStripeEvent(event)];
    expect([first.appliedTo, first.duplicate, second.duplicate]).toEqual(["commercial_record", false, true]);
    const paid = await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: rec.id } });
    expect([paid.status, paid.paidBasis, paid.paidMinor]).toEqual(["paid", "webhook", 2_500_000n]);
    const wrong = await M.handleStripeEvent({ ...event, id: `evt_${tag}_2`, data: { object: { ...event.data.object, amount_total: 1 } } });
    expect(wrong.appliedTo).toBe("unmatched");
  });

  it("15. a completed engagement has an export and handover path; history survives, new work does not start", async () => {
    await uploadAsset(specialist, { name: "logo.png", mime: "image/png", bytes: PNG, category: "brand", rightsNote: "Client owned" });
    const internal = await uploadAsset(specialist, { name: "working-notes.png", mime: "image/png", bytes: PNG, clientVisible: false });
    await expect(uploadAsset(specialist, { name: "x.png", mime: "image/png", bytes: Buffer.from("<script>alert(1)</script>") })).rejects.toThrow("do not match");
    await expect(uploadAsset(specialist, { name: "run.exe", mime: "application/x-msdownload", bytes: PNG })).rejects.toThrow("not accepted");
    await expect(readAsset(owner, internal.id)).rejects.toThrow("not found"); // staff-only file
    await expect(readAsset(outsider, internal.id)).rejects.toThrow("not found"); // other tenant
    expect((await assetManifest(owner)).map((a) => a.name)).toEqual(["logo.png"]);

    await expect(E.handOver(lead, engagementId)).rejects.toThrow("Complete the engagement");
    await E.moveEngagement(lead, engagementId, "completed");
    await db.cosPublication.updateMany({ where: { orgId, status: "scheduled" }, data: { status: "cancelled" } });
    expect((await E.handOver(lead, engagementId)).readOnly).toBe(true);

    const ent = await entitlements(orgId);
    expect([ent.accessMode, ent.services.size, ent.modules.has("content")]).toEqual(["read_only", 0, true]); // history visible, no active services
    await expect(createWorkItem(lead, { title: "More work" })).rejects.toThrow("read-only");
    await expect(C.createVariant(specialist, masterId, { channel: "x", format: "post", body: "late" })).rejects.toThrow("read-only");
    expect(await db.cosApproval.count({ where: { orgId, status: "approved" } })).toBeGreaterThan(0); // approval evidence is untouched
    const exported = await buildExport(owner);
    expect(exported.engagements.find((e) => e.id === engagementId)!.events.map((e) => e.toValue)).toContain("offboarded");
    expect(exported.publications.some((p) => p.externalUrl?.startsWith("https://test.invalid/"))).toBe(true);
    expect(exported.history.every((h) => !h.internal)).toBe(true); // a client copy never carries internal notes
    expect(JSON.stringify(exported.workItems)).not.toContain("incrementalCharge\":25000,\"estMinutes");
    expect(exported.assets.map((a) => a.name)).toEqual(["logo.png"]);
  });
});
