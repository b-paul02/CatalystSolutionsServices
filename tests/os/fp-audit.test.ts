// WP-13 · first-party site audit against a fixture site served from the test harness (stubbed fetch), through the real
// job chain: seed → crawl steps → PSI → findings with why/fix copy → scores; plus the public submit route's guards.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { runPendingJobs } from "@/lib/leados/jobs";
import "@/lib/leados/registerJobs";
import { auditState, checkPage, CHECKS, startSiteAudit } from "@/lib/os/siteAudit";
import { startSiteAuditAction } from "@/app/app/(shell)/_os/actions";
import { POST as auditSubmit } from "@/app/api/audit/submit/route";
import { PROPOSED_RATES } from "@/lib/os/pricing";

const ORIGIN = "https://fixture-site.test";
const page = (title: string, body: string, opts: { desc?: string; canonical?: string; noindex?: boolean; ld?: boolean } = {}) =>
  `<!doctype html><html><head><title>${title}</title>${opts.desc ? `<meta name="description" content="${opts.desc}">` : ""}${opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : ""}${opts.noindex ? `<meta name="robots" content="noindex">` : ""}${opts.ld ? `<script type="application/ld+json">{"@type":"Organization"}</script>` : ""}</head><body>${body}</body></html>`;
const GOOD_DESC = "A seventy-plus character description that explains what the page offers and why to click.";
const SITE: Record<string, { status: number; body: string; headers?: Record<string, string> }> = {
  "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private\n" },
  "/sitemap.xml": { status: 200, body: `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/services</loc></url><url><loc>${ORIGIN}/private/secret</loc></url></urlset>` },
  "/": { status: 200, body: page("Fixture Dental Clinic — family dentistry in town", `<h1>Welcome</h1><img src="/a.png" alt="clinic"><a href="/services">Services</a><a href="/blog/one">Blog</a><a href="/missing">Old page</a><a href="/old">Moved</a><a href="/private/secret">Private</a>`, { desc: GOOD_DESC, canonical: `${ORIGIN}/`, ld: true }) },
  "/services": { status: 200, body: page("Services", `<h1>A</h1><h1>B</h1><img src="/x.png"><img src="http://cdn.example/y.png" alt="y">`, { canonical: `${ORIGIN}/services` }) },
  "/blog/one": { status: 200, body: page("A blog post about teeth whitening at home safely", `<h1>Post</h1>`, { desc: GOOD_DESC, canonical: `${ORIGIN}/blog/one`, noindex: true, ld: true }) },
  "/missing": { status: 404, body: "gone" },
  "/old": { status: 301, body: "", headers: { location: "/older" } },
  "/older": { status: 301, body: "", headers: { location: "/services" } },
  "/private/secret": { status: 200, body: page("Private page that must never be crawled by anyone", "<h1>private</h1>") },
};
const fetched: string[] = [];

const tag = `fpa-${Date.now()}`;
let orgId: string, staff: string, owner: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); fetched.push(url);
    if (url.startsWith("https://www.googleapis.com/pagespeedonline/")) return Response.json({ lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { "largest-contentful-paint": { numericValue: 3400 }, "cumulative-layout-shift": { numericValue: 0.02 } } } });
    if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: String(init?.body).includes("response=good-token") });
    if (url.startsWith(ORIGIN)) { const p = new URL(url).pathname; const r = SITE[p] ?? { status: 404, body: "nope" }; return new Response(r.body, { status: r.status, headers: { "content-type": r.status < 300 ? (p.endsWith(".xml") ? "application/xml" : p.endsWith(".txt") ? "text/plain" : "text/html") : "text/html", ...(r.headers ?? {}) } }); }
    throw new Error(`Unexpected outbound request in a test: ${url}`);
  });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, website: ORIGIN, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["seo"]), modules: JSON.stringify(["audit"]), signedAt: new Date(), demo: true } });
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: staff, role: "cgo_lead" }, { orgId, userId: owner, role: "owner" }] });
});
afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: "os.audit_crawl" } });
  await db.cosFinding.deleteMany({ where: { orgId } }); await db.cosAuditRun.deleteMany({ where: { orgId } }); await db.cosAiUsage.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [staff, owner] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [staff, owner] } } });
  vi.unstubAllGlobals();
});

describe("WP-13 site audit", () => {
  it("checkPage is deterministic parsing", () => {
    const r = checkPage(`${ORIGIN}/services`, { status: 200, html: SITE["/services"].body, hops: 0, finalUrl: `${ORIGIN}/services`, bytes: 500 }, ORIGIN);
    expect(r.fails.sort()).toEqual(["description_missing", "h1_count", "img_alt_missing", "mixed_content", "schema_missing", "title_length"].sort());
    expect(checkPage(`${ORIGIN}/x`, { status: 500, html: "", hops: 0, finalUrl: "", bytes: 0 }, ORIGIN).fails).toEqual(["http_error"]);
    expect(Object.keys(CHECKS).every((k) => CHECKS[k as keyof typeof CHECKS].why && CHECKS[k as keyof typeof CHECKS].fix)).toBe(true);
    expect(PROPOSED_RATES.site_audit.base).toBeGreaterThan(0);
  });

  it("crawls the fixture site through the job chain, respects robots, follows the chain, runs PSI, writes findings and scores", async () => {
    await signIn(staff, orgId);
    const r = await startSiteAuditAction({}, form({ url: "fixture-site.test" }));
    expect(r.ok).toMatch(/Crawling https:\/\/fixture-site.test/);
    let run = (await db.cosAuditRun.findFirst({ where: { orgId, kind: "site_audit" } }))!;
    expect(auditState(run)!.queue).not.toContain(`${ORIGIN}/private/secret`); // sitemap entry under Disallow is dropped
    for (let i = 0; i < 20 && auditState(run)!.status !== "done"; i++) { await runPendingJobs(5); run = (await db.cosAuditRun.findUniqueOrThrow({ where: { id: run.id } })); }
    const st = auditState(run)!;
    expect(st.status).toBe("done"); expect(st.pages).toBeGreaterThanOrEqual(5);
    expect(fetched.some((u) => u.includes("/private/secret"))).toBe(false); // robots respected for discovered links too
    expect(fetched.filter((u) => u.startsWith("https://www.googleapis.com/pagespeedonline/")).length).toBeGreaterThanOrEqual(1);
    const findings = await db.cosFinding.findMany({ where: { auditRunId: run.id } });
    const byText = (s: string) => findings.find((f) => f.text.startsWith(s));
    expect(byText("Page returns an error")).toBeTruthy(); expect(byText("Broken internal link")!.evidence).toContain(`${ORIGIN}/ → ${ORIGIN}/missing`);
    expect(byText("Redirect chain")).toBeTruthy(); expect(byText("Mixed content")!.severity).toBe("error");
    expect(byText("Page is set to noindex")!.severity).toBe("notice"); expect(byText("Images without alt text")!.evidence).toMatch(/Why it matters:.*How to fix:/);
    expect(byText("Low mobile performance score")).toBeTruthy(); expect(byText("Largest Contentful Paint")).toBeTruthy();
    expect(findings.every((f) => f.label === "verified")).toBe(true);
    const scores = JSON.parse(run.scores) as Record<string, { score: number | null; label: string }>;
    expect(scores.speed).toEqual({ score: 42, label: "verified" }); expect(scores.conversion).toEqual({ score: null, label: "unavailable" });
    expect(scores.visibility.score).toBeLessThan(100); expect(scores.visibility.label).toBe("verified");
    expect(await db.cosNotification.count({ where: { orgId, kind: "audit_finished" } })).toBe(2);
    expect((await db.cosAiUsage.findFirst({ where: { orgId, feature: "site_audit" } }))!.payer).toBe("catalyst_internal");
  });

  it("clients are pointed at the Studio tool; read-only and bad URLs are refused with a message", async () => {
    await signIn(owner, orgId);
    expect((await startSiteAuditAction({}, form({ url: ORIGIN }))).error).toMatch(/AI Studio/);
    await expect(startSiteAudit(orgId, "http://localhost:3000")).rejects.toThrow(/public website/);
    await expect(startSiteAudit(orgId, "not a url")).rejects.toThrow(/valid website|public website/);
  });

  it("public audit submit: rate limited, honeypot dropped, Turnstile enforced when configured", async () => {
    const req = (body: unknown, ip: string) => new NextRequest("http://site.test/api/audit/submit", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
    expect((await auditSubmit(req({ website: "spam" }, "198.51.100.1"))).status).toBe(200); // honeypot: 200 and nothing happens
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect((await auditSubmit(req({ leadId: "x", intake: {}, turnstileToken: "bad" }, "198.51.100.2"))).status).toBe(400);
    expect((await auditSubmit(req({ leadId: "nope", intake: {}, turnstileToken: "good-token" }, "198.51.100.3"))).status).toBe(404); // passed the bot check, unknown lead
    delete process.env.TURNSTILE_SECRET_KEY;
    let last = 200;
    for (let i = 0; i < 7; i++) last = (await auditSubmit(req({ leadId: "nope", intake: {} }, "198.51.100.9"))).status;
    expect(last).toBe(429);
  });
});
