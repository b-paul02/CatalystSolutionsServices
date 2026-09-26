// WP-10e · combined public report: verify route (rate limit, honeypot, Turnstile) runs the deterministic site checks
// against a fixture site, stores the verified column next to the self-reported one, pairs a verified audit run, and the
// page shows both; share image URLs are signed (WP-22 route).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { defaultScorecard, scoreAnswers } from "@/lib/leados/scorecard";
import { POST as verifyRoute } from "@/app/api/os/public/verify/route";
import { combinedRows, verifySubmission, type StoredScore } from "@/lib/os/scorecardVerify";
import { signedGraphicUrl, verifyGraphicParams } from "@/lib/os/graphics";
import { importScorecardRun } from "@/lib/os/scorecardAudit";
import ResultPage from "@/app/app/c/[publicId]/r/[submissionId]/page";

const ORIGIN = "https://verify-fixture.test";
const HOME = `<!doctype html><html><head><title>Verify Dental Clinic — family dentistry in town for everyone</title><meta name="description" content="A seventy-plus character description that explains what the page offers and why to click it now."><link rel="canonical" href="${ORIGIN}/"><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Welcome</h1><img src="/a.png" alt="clinic"><form><input name="a"><input name="b"></form><a href="/services">Services</a></body></html>`;
const tag = `fsp-${Date.now()}`;
let orgId: string, campaignId: string, publicId: string, submissionId: string;
const spec = defaultScorecard();

beforeAll(async () => {
  process.env.LEADOS_SECRET ??= "test-only-field-key";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://www.googleapis.com/pagespeedonline/")) return Response.json({ lighthouseResult: { categories: { performance: { score: 0.61 } }, audits: { "largest-contentful-paint": { numericValue: 2100 }, "cumulative-layout-shift": { numericValue: 0.01 } } } });
    if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: String(init?.body).includes("response=good") });
    if (url.startsWith(ORIGIN)) { const p = new URL(url).pathname; if (p === "/robots.txt") return new Response("User-agent: *\n", { headers: { "content-type": "text/plain" } }); if (p === "/" || p === "/services") return new Response(HOME, { headers: { "content-type": "text/html", "strict-transport-security": "max-age=1" } }); return new Response("nope", { status: 404 }); }
    if (url.startsWith("https://unreachable.test")) throw new Error("ECONNREFUSED");
    throw new Error(`Unexpected outbound request in a test: ${url}`);
  });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  const user = await db.losUser.create({ data: { email: `${tag}@example.com`, demo: true } });
  const c = await db.losCampaign.create({ data: { orgId, name: `${tag} sc`, type: "scorecard", status: "active", formSpec: JSON.stringify({ fields: [], qualifying: [], otpVerify: false, emailVerify: false, consentPurposes: ["sales_contact"], consentChannels: ["email"], scorecard: spec }), pageSpec: JSON.stringify({ template: "clean", headline: "h", body: "b", cta: "Go", brandColor: "#123456", thankYouMessage: "t" }), createdById: user.id, demo: true } });
  campaignId = c.id; publicId = c.publicId;
  await db.losCampaignVersion.create({ data: { campaignId, version: 1, formSpec: c.formSpec!, pageSpec: c.pageSpec! } });
  const score = scoreAnswers(spec, { q_search: "1", q_reviews: "1", q_form: "0", q_booking: "1" });
  submissionId = (await db.losFormSubmission.create({ data: { campaignId, orgId, data: JSON.stringify({ firstName: "Priya", email: `${tag}-p@example.com` }), status: "accepted", score: JSON.stringify(score) } })).id;
  await importScorecardRun({ id: campaignId, orgId, name: c.name, demo: true, createdById: user.id }, submissionId, score, spec);
  await db.cosBookingType.create({ data: { orgId, name: "Intro call", hostId: user.id, status: "active", demo: true } });
});
afterAll(async () => {
  await db.cosBookingType.deleteMany({ where: { orgId } }); await db.cosFinding.deleteMany({ where: { orgId } }); await db.cosAuditRun.deleteMany({ where: { orgId } }); await db.cosGoal.deleteMany({ where: { orgId } });
  await db.losFormSubmission.deleteMany({ where: { orgId } }); await db.losCampaignVersion.deleteMany({ where: { campaignId } }); await db.losCampaign.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { email: `${tag}@example.com` } });
  vi.unstubAllGlobals();
});

const post = (body: unknown, ip: string) => verifyRoute(new NextRequest("http://app.test/api/os/public/verify", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

describe("WP-10e combined public report", () => {
  it("signed share URLs verify and a tampered one does not", () => {
    const url = signedGraphicUrl("scorecard_share", { title: "58 / 100 · Building", brand: "Acme", color: "#123456" });
    const params = new URL(`http://x${url}`).searchParams;
    expect(verifyGraphicParams(params)?.title).toBe("58 / 100 · Building");
    params.set("title", "100 / 100 · Perfect");
    expect(verifyGraphicParams(params)).toBeNull();
  });

  it("verify route: honeypot, Turnstile, bad URL, unreachable site; then the real checks land next to the self-reported column and pair a verified run", async () => {
    expect((await post({ publicId, submissionId, url: ORIGIN, website: "bot" }, "198.51.100.20")).status).toBe(200);
    expect(JSON.parse((await db.losFormSubmission.findUniqueOrThrow({ where: { id: submissionId } })).score!).verified).toBeUndefined();
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect((await post({ publicId, submissionId, url: ORIGIN, turnstileToken: "bad" }, "198.51.100.21")).status).toBe(400);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(((await (await post({ publicId, submissionId, url: "localhost:3000" }, "198.51.100.22")).json()) as { error: string }).error).toMatch(/public website/);
    expect(((await (await post({ publicId, submissionId, url: "https://unreachable.test" }, "198.51.100.23")).json()) as { error: string }).error).toMatch(/could not reach/);
    const ok = await post({ publicId, submissionId, url: "verify-fixture.test" }, "198.51.100.24");
    expect(ok.status).toBe(200);
    const stored = JSON.parse((await db.losFormSubmission.findUniqueOrThrow({ where: { id: submissionId } })).score!) as StoredScore;
    expect(stored.verified?.url).toBe(`${ORIGIN}/`); expect(stored.verified?.overall).toBeGreaterThan(0); expect(stored.verified?.pagespeed?.performanceScore).toBe(61);
    expect(stored.categories.length).toBe(2); // self-reported untouched
    const rows = combinedRows(stored);
    expect(rows.find((r) => r.key === "speed")!.verified).not.toBeNull(); expect(rows.find((r) => r.key === "visibility")!.self).toBe(50);
    // idempotent: a second verify returns the stored result without new fetches
    const before = (await db.cosAuditRun.count({ where: { orgId, kind: "verified_scorecard" } }));
    expect((await verifySubmission(publicId, submissionId, "https://other.test")).url).toBe(`${ORIGIN}/`);
    expect(await db.cosAuditRun.count({ where: { orgId, kind: "verified_scorecard" } })).toBe(before);
    const sc = (await db.cosAuditRun.findFirst({ where: { orgId, kind: "scorecard", sourceSubmissionId: submissionId } }))!;
    const paired = (await db.cosAuditRun.findUnique({ where: { id: sc.pairedRunId! } }))!;
    expect(paired.kind).toBe("verified_scorecard"); expect(JSON.parse(paired.scores).speed.score).toBeGreaterThan(0);
    // the page shows both columns, the booking CTA and the share link — no personal data
    const html = JSON.stringify(await ResultPage({ params: Promise.resolve({ publicId, submissionId }) }));
    expect(html).toContain("We measured"); expect(html).toContain("Book a call"); expect(html).toContain("/api/os/graphics/scorecard_share?"); expect(html).not.toContain("Priya"); expect(html).not.toContain("@example.com");
    // rate limit: 3 per hour per IP
    let last = 200; for (let i = 0; i < 4; i++) last = (await post({ publicId, submissionId, url: ORIGIN }, "198.51.100.30")).status;
    expect(last).toBe(429);
  });
});
