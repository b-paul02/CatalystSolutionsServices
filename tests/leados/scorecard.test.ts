// WP-10a · scorecard campaign type: pure scoring + the real public route → processSubmission → stored score, lead
// score with the band weight, workflow payload, result page, Results rows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", async () => (await import("../os/entry-harness")).nextNavigationMock);

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { bandFor, defaultScorecard, sanitizeScorecard, scoreAnswers, scorecardProblems } from "@/lib/leados/scorecard";
import { sanitizeFormSpec, defaultFormSpec } from "@/lib/leados/campaigns";
import { scoreLead, DEFAULT_WEIGHTS } from "@/lib/leados/scoring";
import { POST as submitRoute } from "@/app/api/leados/public/forms/[publicId]/route";
import { POST as startRoute } from "@/app/api/leados/public/forms/[publicId]/start/route";
import { scorecardSummary } from "@/lib/os/scorecardResults";
import { TEMPLATES } from "@/lib/os/automation/templates";
import { validateDefinition } from "@/lib/os/automation/definition";
import { BLOCKS } from "@/lib/os/automation/catalog";
import ResultPage from "@/app/app/c/[publicId]/r/[submissionId]/page";

const tag = `sc-${Date.now()}`;
let orgId: string, campaignId: string, publicId: string;
const spec = defaultScorecard();

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  const user = await db.losUser.create({ data: { email: `${tag}@example.com`, demo: true } });
  const formSpec = { ...defaultFormSpec(), fields: [{ key: "firstName", label: "First name", kind: "text", required: true }, { key: "email", label: "Email", kind: "email", required: true }, { key: "phone", label: "Phone", kind: "phone", required: false }], scorecard: spec };
  const c = await db.losCampaign.create({ data: { orgId, name: `${tag} scorecard`, type: "scorecard", status: "active", formSpec: JSON.stringify(formSpec), pageSpec: JSON.stringify({ template: "clean", headline: "h", body: "b", cta: "See my score", brandColor: "#6d28d9", thankYouMessage: "Here is your result." }), createdById: user.id, demo: true } });
  campaignId = c.id; publicId = c.publicId;
  await db.losCampaignVersion.create({ data: { campaignId, version: 1, formSpec: c.formSpec!, pageSpec: c.pageSpec! } });
});
afterAll(async () => {
  await db.cosMetricSnapshot.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } });
  await db.cosHeartbeat.deleteMany({ where: { key: { startsWith: `scorecard.starts:${campaignId}` } } });
  await db.losScoreEvent.deleteMany({ where: { orgId } }); await db.losFormSubmission.deleteMany({ where: { orgId } }); await db.losAttributionEvent.deleteMany({ where: { campaignId } });
  await db.losConsentEvent.deleteMany({ where: { orgId } }); await db.losActivity.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.losLeadB2c.deleteMany({ where: { lead: { orgId } } }); await db.losLead.deleteMany({ where: { orgId } });
  await db.losCampaignVersion.deleteMany({ where: { campaignId } }); await db.losCampaign.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { email: `${tag}@example.com` } });
});

const post = (values: Record<string, string>) => submitRoute(new NextRequest(`http://app.test/api/leados/public/forms/${publicId}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ values, consentChecked: true, utm: {}, trackingCode: null }) }), { params: Promise.resolve({ publicId }) });

describe("scorecard: pure", () => {
  it("scores answers per category, picks the band, and the default spec is valid", () => {
    expect(scorecardProblems(spec)).toEqual([]);
    const top = scoreAnswers(spec, { q_search: 0, q_reviews: 0, q_form: 0, q_booking: 0 });
    expect(top.pct).toBe(100); expect(top.band).toBe("Established"); expect(top.categories.map((c) => c.pct)).toEqual([100, 100]);
    const mixed = scoreAnswers(spec, { q_search: 1, q_reviews: 2, q_form: 2, q_booking: 1 }); // 5+0+0+4 = 9/40
    expect(mixed.pct).toBe(23); expect(mixed.band).toBe("Getting started"); expect(mixed.categories[0].pct).toBe(25); expect(mixed.categories[1].pct).toBe(20);
    expect(scoreAnswers(spec, { q_search: "9", bogus: "1" }).total).toBe(0); // out-of-range and unknown answers score nothing
    expect(bandFor(spec, 40).band?.label).toBe("Building"); expect(bandFor(spec, 69).band?.label).toBe("Building"); expect(bandFor(spec, 70).band?.label).toBe("Established");
  });
  it("sanitises a client-posted spec and reports gaps between bands", () => {
    const s = sanitizeScorecard({ categories: [{ label: "Sales", pillar: "nonsense" }], questions: [{ text: "One answer only", category: "sales", answers: [{ label: "a", points: 5 }] }, { text: "Ok", category: "sales", answers: [{ label: "a", points: 500 }, { label: "b", points: -3 }] }], bands: [{ min: 0, max: 50, label: "Low" }, { min: 60, max: 100, label: "High", ctaHref: "javascript:alert(1)" }], gate: "whatever" });
    expect(s.categories[0]).toEqual({ key: "sales", label: "Sales", pillar: "conversion" });
    expect(s.questions).toHaveLength(1); expect(s.questions[0].answers.map((a) => a.points)).toEqual([100, 0]);
    expect(s.bands[1].ctaHref).toBeUndefined(); expect(s.gate).toBe("email_before_results");
    expect(scorecardProblems(s).join(" ")).toMatch(/gaps/);
    expect(sanitizeFormSpec({ ...defaultFormSpec(), scorecard: spec }).scorecard?.questions).toHaveLength(4);
    expect(sanitizeFormSpec(defaultFormSpec()).scorecard).toBeUndefined();
  });
  it("the scorecardBand weight scales with band rank", () => {
    const base = { firstName: "A", email: null, phone: null, emailStatus: "unverified", phoneStatus: "unverified", city: null, country: null, source: "form", status: "new", createdAt: new Date(), updatedAt: new Date() };
    const none = scoreLead(base).intent, top = scoreLead({ ...base, scorecardBandRank: 1 }).intent, mid = scoreLead({ ...base, scorecardBandRank: 0.5 }).intent;
    expect(top - none).toBe(DEFAULT_WEIGHTS.intent.scorecardBand); expect(mid - none).toBe(Math.round(DEFAULT_WEIGHTS.intent.scorecardBand / 2));
  });
  it("ships a Scorecard follow-up workflow template that validates", () => {
    const t = TEMPLATES.find((x) => x.key === "T32")!;
    expect(validateDefinition(t.definition, BLOCKS)).toEqual([]);
    expect(JSON.stringify(t.definition)).toContain("{{trigger.band}}");
  });
});

describe("scorecard: public route → stored score → lead → Results", () => {
  it("scores server-side, stores it on the submission, weights the lead, counts the day, serves the result page", async () => {
    await startRoute(new NextRequest("http://app.test/x", { method: "POST" }), { params: Promise.resolve({ publicId }) });
    const res = await post({ firstName: "Priya", email: `${tag}-priya@example.com`, phone: "+919876543210", sc_q_search: "0", sc_q_reviews: "1", sc_q_form: "0", sc_q_booking: "0", sc_q_search_hack: "0" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: { pct: number; band: string }; resultUrl: string };
    expect(body.score.pct).toBe(88); expect(body.score.band).toBe("Established"); expect(body.resultUrl).toMatch(new RegExp(`^/app/c/${publicId}/r/`));
    const sub = (await db.losFormSubmission.findFirst({ where: { campaignId }, orderBy: { createdAt: "desc" } }))!;
    expect(JSON.parse(sub.score!).pct).toBe(88);
    expect(JSON.parse(sub.data)).not.toHaveProperty("sc_q_search_hack"); // only real question keys are kept
    const lead = (await db.losLead.findUnique({ where: { id: sub.leadId! } }))!;
    const ev = await db.losScoreEvent.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });
    expect(ev?.explanation).toContain("Scorecard: Established (88%)");
    expect(lead.intentScore).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.intent.base + DEFAULT_WEIGHTS.intent.scorecardBand);
    // a second, low completion
    expect((await post({ firstName: "Raj", email: `${tag}-raj@example.com`, phone: "+919876543211", sc_q_search: "2", sc_q_reviews: "2", sc_q_form: "2", sc_q_booking: "2" })).status).toBe(200);
    const range = { start: new Date(Date.now() - 86_400_000 * 2), end: new Date(Date.now() + 86_400_000) };
    const [row] = await scorecardSummary(orgId, range, true);
    expect(row).toMatchObject({ campaignId, starts: 1, completions: 2, leads: 2, averageScore: 44 });
    expect(row.bands).toEqual({ established: 1, getting_started: 1 });
    expect(await scorecardSummary(orgId, range, false)).toEqual([]); // demo rows stay out of real reports
    expect(await db.cosNotification.count({ where: { orgId, kind: "new_lead" } })).toBe(2);
    // result page renders the stored score only
    const el = await ResultPage({ params: Promise.resolve({ publicId, submissionId: sub.id }) });
    const html = JSON.stringify(el);
    expect(html).toContain("Established"); expect(html).not.toContain("Priya"); expect(html).not.toContain("priya@");
    await expect(ResultPage({ params: Promise.resolve({ publicId, submissionId: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
