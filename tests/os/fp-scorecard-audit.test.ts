// WP-10b/10c · scorecard → audit run (self_reported), findings, pairing, baseline retake, goal suggestions, accept.
// WP-10d · results widget data + CSV route + weekly report section.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { defaultScorecard, scoreAnswers } from "@/lib/leados/scorecard";
import { auditFromScorecard, importScorecardRun, pairedRuns, suggestGoalsFromScorecard, whereYouAreFacts } from "@/lib/os/scorecardAudit";
import { acceptGoal } from "@/app/app/(shell)/_os/actions";
import { GET as csvRoute } from "@/app/api/os/export/scorecard/route";
import { weeklyScorecardSection } from "@/lib/leados/metrics";
import { recomputeScorecardDay } from "@/lib/os/scorecardResults";

const tag = `sca-${Date.now()}`;
const spec = defaultScorecard();
let orgId: string, owner: string, staff: string, campaignId: string;

async function submission(email: string, answers: Record<string, string>, website?: string) {
  const lead = await db.losLead.create({ data: { orgId, leadType: "b2c", source: "form", email, normalizedEmail: email, status: "new", demo: true } });
  const score = scoreAnswers(spec, answers);
  const sub = await db.losFormSubmission.create({ data: { campaignId, orgId, data: JSON.stringify({ firstName: "T", email, ...(website ? { website } : {}) }), status: "accepted", leadId: lead.id, score: JSON.stringify(score) } });
  return { sub, score, lead };
}

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, website: "https://example-dental.test", demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["seo"]), modules: JSON.stringify(["strategy", "audit", "results"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: staff, role: "cgo_lead" }] });
  campaignId = (await db.losCampaign.create({ data: { orgId, name: `${tag} sc`, type: "scorecard", status: "active", formSpec: JSON.stringify({ fields: [], qualifying: [], otpVerify: false, emailVerify: false, consentPurposes: ["sales_contact"], consentChannels: ["email"], scorecard: spec }), createdById: staff, demo: true } })).id;
  // a verified audit of the same site, to pair with
  await db.cosAuditRun.create({ data: { orgId, url: "https://www.example-dental.test/", kind: "initial", scoringVersion: "scorecard-v2", scores: JSON.stringify({ visibility: { score: 40, label: "verified" }, conversion: { score: 55, label: "detected" } }), summary: JSON.stringify({ snapshot: "verified" }), demo: true } });
});
afterAll(async () => {
  await db.cosFinding.deleteMany({ where: { orgId } }); await db.cosBaseline.deleteMany({ where: { orgId } }); await db.cosAuditRun.deleteMany({ where: { orgId } });
  await db.cosGoal.deleteMany({ where: { orgId } }); await db.cosMetricSnapshot.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } });
  await db.losFormSubmission.deleteMany({ where: { orgId } }); await db.losLead.deleteMany({ where: { orgId } }); await db.losCampaign.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [owner, staff] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [owner, staff] } } });
});

describe("WP-10b scorecard → audit", () => {
  it("maps categories to pillars as self_reported, unmapped pillars stay unavailable, lowest-band categories become findings", () => {
    const score = scoreAnswers(spec, { q_search: 2, q_reviews: 2, q_form: 0, q_booking: 0 }); // visibility 0%, conversion 100%
    const m = auditFromScorecard(score, spec);
    expect(m.scores.visibility).toEqual({ score: 0, label: "self_reported" }); expect(m.scores.conversion).toEqual({ score: 100, label: "self_reported" });
    expect(m.scores.speed).toEqual({ score: null, label: "unavailable" });
    expect(m.findings).toHaveLength(1); expect(m.findings[0]).toMatchObject({ pillar: "visibility", label: "self_reported" });
    expect(m.summary.limitations[0]).toMatch(/own answer/);
  });

  it("one run per submission, paired to the verified run of the same site; retake creates a baseline version; goals suggested as drafts", async () => {
    const campaign = (await db.losCampaign.findUniqueOrThrow({ where: { id: campaignId } }));
    const first = await submission(`${tag}-a@example.com`, { q_search: "2", q_reviews: "2", q_form: "1", q_booking: "1" }, "example-dental.test");
    const run = await importScorecardRun(campaign, first.sub.id, first.score, spec);
    expect(await importScorecardRun(campaign, first.sub.id, first.score, spec)).toMatchObject({ id: run.id }); // idempotent
    expect(run.kind).toBe("scorecard"); expect(run.label).toBe("self_reported"); expect(run.pairedRunId).not.toBeNull();
    expect(await db.cosFinding.count({ where: { auditRunId: run.id, label: "self_reported" } })).toBe(1);
    const pair = (await pairedRuns(orgId))!;
    expect(pair.scorecard.id).toBe(run.id); expect(pair.verified!.url).toContain("example-dental");
    // goals: weakest categories, draft until accepted, idempotent
    const drafts = await db.cosGoal.findMany({ where: { orgId, agreedAt: null } });
    expect(drafts.map((g) => g.metric).sort()).toEqual(["scorecard.conversion", "scorecard.visibility"]);
    expect(drafts.find((g) => g.metric === "scorecard.visibility")!.target).toBe(40); // next band's lower bound
    expect(drafts.find((g) => g.metric === "scorecard.visibility")!.pillar).toBe("digital_visibility");
    expect(await suggestGoalsFromScorecard(orgId, first.score, spec)).toBe(0);
    // staff records the first scorecard run as baseline v1; the person retakes → v2 with reason scorecard_retake, v1 untouched
    await db.cosBaseline.create({ data: { orgId, version: 1, auditRunId: run.id, snapshot: JSON.stringify({ scores: JSON.parse(run.scores) }), approvedById: staff } });
    const retake = await db.losFormSubmission.create({ data: { campaignId, orgId, data: JSON.stringify({ email: `${tag}-a@example.com` }), status: "duplicate_updated", leadId: first.lead.id, score: JSON.stringify(scoreAnswers(spec, { q_search: 0, q_reviews: 0, q_form: 0, q_booking: 0 })) } });
    const run2 = await importScorecardRun(campaign, retake.id, JSON.parse(retake.score!), spec);
    const baselines = await db.cosBaseline.findMany({ where: { orgId }, orderBy: { version: "asc" } });
    expect(baselines.map((b) => [b.version, b.reason, b.auditRunId])).toEqual([[1, null, run.id], [2, "scorecard_retake", run2.id]]);
    expect(baselines[1].supersedesId).toBe(baselines[0].id);
    // where-you-are facts contain only stored numbers
    const facts = whereYouAreFacts(pair.scorecard, pair.verified, []);
    expect(facts["Search visibility (self-reported)"]).toBe(0); expect(facts["Search visibility (verified)"]).toBe(40); expect(facts["Mobile & speed (self-reported)"]).toBeNull();
  });

  it("only a decision-maker or strategist accepts a suggested goal; a refusal is a message", async () => {
    const draft = (await db.cosGoal.findFirst({ where: { orgId, agreedAt: null } }))!;
    await signIn(owner, orgId);
    expect((await acceptGoal({}, form({ id: draft.id }))).ok).toBe("Goal accepted.");
    expect((await db.cosGoal.findUnique({ where: { id: draft.id } }))!.agreedById).toBe(owner);
    expect((await acceptGoal({}, form({ id: draft.id }))).error).toMatch(/already accepted/);
  });
});

describe("WP-10d scorecard on Results and reports", () => {
  it("daily rows recompute idempotently; the CSV route and the weekly section report counts only", async () => {
    const campaign = await db.losCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    const day = new Date().toISOString().slice(0, 10);
    await recomputeScorecardDay(campaign, day); await recomputeScorecardDay(campaign, day);
    const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, provider: "scorecard", metric: "scorecard.completions" } });
    expect(rows).toHaveLength(1); expect(rows[0].value).toBe(2); expect(rows[0].demo).toBe(true);
    await signIn(owner, orgId);
    const res = await csvRoute(new NextRequest("http://app.test/api/os/export/scorecard?period=last30"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv.split("\n")[0]).toContain("campaign"); expect(csv).toContain(`${tag} sc`); expect(csv).not.toContain("@example.com");
    const section = await weeklyScorecardSection(orgId, new Date(Date.now() - 7 * 86_400_000));
    expect(section).toContain("2 completed"); expect(section).toContain("Established: 1"); expect(section).not.toContain("@");
  });
});
