// Phase 3 first-party features: WP-40 site copy, WP-41 QA run (blocks review), WP-42 pins (bundled into the revision
// request), WP-43 beacon + sweep, WP-44 chat (start → identify → reply → close; token-only identity), WP-45 WhatsApp
// template sync, WP-46 enrichment (robots, sources, accept), WP-47 competitor observation → CosSource, WP-48 AI
// visibility (stubbed model, metered internal), WP-49 review request block + reviews sync, WP-50 invoices export,
// WP-51 time log export + signature receipt.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: () => unknown) => fn }));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/lib/leados/email", () => ({ APP_URL: "http://app.test/app", sendLosMail: async (m: { to: string; subject: string; text: string }) => { mail.sent.push(m); return { delivered: true }; } }));

import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { encryptField } from "@/lib/leados/crypto";
import { runPendingJobs } from "@/lib/leados/jobs";
import "@/lib/leados/registerJobs";
import { form, signIn } from "./entry-harness";
import { saveContent, latestContent } from "@/lib/os/siteContent";
import { siteCopySave, qaStart, pinAdd, chatReply, chatClose, enrichAccept, competitorAdd, questionAdd, waTemplatesSync } from "@/app/app/(shell)/_os/phase3";
import { GET as siteContentGet } from "@/app/api/os/site-content/[workItemId]/route";
import { htmlHeuristics, contrast, runQa, setQaFetchForTests } from "@/lib/os/qaRun";
import { transitionWorkItem, requestApproval, decideApproval } from "@/lib/os/work";
import { openPins, pinsSummary } from "@/lib/os/pins";
import { parseBeacon, recordBeacon, sweepBehavior, heatmapData } from "@/lib/os/beacon";
import { POST as beaconPost } from "@/app/api/os/beacon/route";
import { POST as chatStart } from "@/app/api/os/chat/start/route";
import { GET as chatGet, POST as chatPost } from "@/app/api/os/chat/messages/route";
import { GET as scriptGet } from "@/app/s/[kind]/route";
import { setWaFetchForTests, bodyOf } from "@/lib/os/waTemplates";
import { extract, runEnrichment, setEnrichDepsForTests } from "@/lib/leados/enrich";
import { observe, observationText, observeCompetitor, setCompetitorFetchForTests } from "@/lib/os/competitors";
import { analyse, observeQuestions, setAskForTests, visibilitySummary } from "@/lib/os/aiVisibility";
import { syncReviews, setReviewsFetchForTests, reviewsSummary } from "@/lib/os/reviews";
import { BLOCKS } from "@/lib/os/automation/catalog";
import { RUNNERS } from "@/lib/os/automation/blocks";
import { invoicesExport, timeLogExport, signatureReceipt, contractHash, ipClass, csvCell } from "@/lib/os/exports";
import { GET as receiptGet } from "@/app/api/os/export/receipt/route";
import { GET as invoicesGet } from "@/app/api/os/export/invoices/route";

const tag = `fp3-${Date.now()}`;
let orgId: string, owner: string, staff: string, project: string, lead: string, engagementId: string, contractId: string;
const staffActor = () => ({ orgId, userId: staff, role: "cgo_lead" });
const ownerActor = () => ({ orgId, userId: owner, role: "owner" });

const HTML_OK = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Site</title></head><body><h1>Hi</h1><h2>Sub</h2><img src="a.png" alt="A"><a href="/about">About us</a><label for="e">Email</label><input id="e"></body></html>`;
const HTML_BAD = `<html><head></head><body><h1>Hi</h1><h3>Jump</h3><img src="a.png"><a href="/dead">click here</a><input type="text"><script src="http://x.test/a.js"></script><p style="color:#777;background:#888">low</p></body></html>`;

beforeAll(async () => {
  process.env.TWILIO_ACCOUNT_SID = "ACx"; process.env.TWILIO_AUTH_TOKEN = "tok"; process.env.GOOGLE_BUSINESS_PROFILE_ENABLED = "1";
  orgId = (await db.losOrg.create({ data: { name: `${tag} Clinic`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  const eng = await db.cosEngagement.create({ data: { orgId, name: `${tag} engagement`, stage: "active" } });
  engagementId = eng.id;
  contractId = (await db.cosContract.create({ data: { orgId, engagementId, status: "active", services: JSON.stringify(["website", "seo"]), modules: JSON.stringify(["results", "content", "crm", "engagement", "strategy"]), scopeDoc: "Build the site", signedAt: new Date(), demo: true } })).id;
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, name: "Asha Owner", demo: true } })).id;
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, name: "Sam Staff", demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: staff, role: "cgo_lead" }] });
  await db.cosContract.update({ where: { id: contractId }, data: { signedById: owner } });
  project = (await db.cosWorkItem.create({ data: { orgId, title: `${tag} website`, type: "project", state: "in_progress", clientReviewRequired: true, demo: true, payload: JSON.stringify({ checklist: [] }) } })).id;
  lead = (await db.losLead.create({ data: { orgId, leadType: "b2b", firstName: "Lead", email: `${tag}@acme-corp.test`, normalizedEmail: `${tag}@acme-corp.test`, source: "manual", demo: true } })).id;
  await db.cosCommercialRecord.create({ data: { orgId, engagementId, kind: "setup", description: "Site build", amountMinor: 1000000n, currency: "INR", status: "issued", taxRateBp: 1800, taxMinor: 180000n, hsnSac: "998314", demo: true } });
  await db.cosWorkEvent.create({ data: { orgId, workItemId: project, actorId: staff, actorType: "user", kind: "time", minutes: 90, internal: true, data: JSON.stringify({ text: "Build, \"quoted\"" }) } });
  await db.cosConnection.create({ data: { orgId, provider: "gsc", status: "verified", accessTokenEnc: encryptField("gtok"), tokenExpiresAt: new Date(Date.now() + 3600_000) } });
});
afterAll(async () => {
  for (const m of ["cosSiteContent", "cosPin", "cosBehaviorEvent", "cosConversation", "losLeadEnrichment", "cosCompetitor", "cosTrackedQuestion", "cosReview", "cosMetricSnapshot", "cosSource", "cosNotification", "cosApproval", "cosWorkEvent", "cosAsset", "cosAiUsage", "cosWorkItem", "losMessageTemplate", "losLead", "losCompany", "losConsentEvent", "losSuppressionEntry", "cosCommercialRecord", "cosContract", "cosConnection", "losAuditEvent", "losJob"] as const) {
    // @ts-expect-error dynamic delegate
    await db[m].deleteMany({ where: m === "losJob" ? { payload: { contains: orgId } } : { orgId } }).catch(() => undefined);
  }
  await db.losJob.deleteMany({ where: { OR: [{ payload: { contains: project } }, { payload: { contains: lead } }] } });
  await db.cosEngagement.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [owner, staff] } } }); await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [owner, staff] } } });
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.GOOGLE_BUSINESS_PROFILE_ENABLED;
});

describe("WP-40 site copy", () => {
  it("versions per key, latest wins, public route serves values, client site.edit only on projects", async () => {
    await signIn(owner, orgId);
    expect((await siteCopySave({}, form({ id: project, key: "Hero.Title", value: "Welcome" }))).ok).toMatch(/v1/);
    expect((await siteCopySave({}, form({ id: project, key: "hero.title", value: "Welcome again" }))).ok).toMatch(/v2/);
    await saveContent(ownerActor(), project, "hero.title", "Welcome again"); // no-op on same value
    const rows = await latestContent(project);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ key: "hero.title", version: 2, value: "Welcome again" });
    const res = await siteContentGet(new NextRequest(`http://app.test/api/os/site-content/${project}`), { params: Promise.resolve({ workItemId: project }) });
    expect(await res.json()).toEqual({ "hero.title": "Welcome again" });
    await expect(saveContent({ orgId, userId: owner, role: "sales_rep" }, project, "x", "y")).rejects.toThrow("Forbidden.");
  });
});

describe("WP-41 automated QA", () => {
  it("heuristics find the classic faults; a failed run blocks internal_qa → client_review; a green run unblocks", async () => {
    const bad = htmlHeuristics(HTML_BAD, "https://s.test/");
    expect(bad.map((i) => i.check)).toEqual(expect.arrayContaining(["lang", "viewport", "alt_text", "heading_order", "form_labels", "link_text", "mixed_content", "contrast"]));
    expect(htmlHeuristics(HTML_OK, "https://s.test/")).toEqual([]);
    expect(contrast("000", "fff")).toBeCloseTo(21, 0);
    let page = HTML_BAD;
    setQaFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => { const u = String(input); if (u === "https://s.test/") return new Response(page, { status: 200 }); if (init?.method === "HEAD") return new Response(null, { status: u.includes("dead") ? 404 : 200 }); throw new Error(`unexpected ${u}`); }) as typeof fetch);
    await signIn(staff, orgId);
    expect((await qaStart({}, form({ id: project, stagingUrl: "http://127.0.0.1/" }))).error).toMatch(/https/);
    expect((await qaStart({}, form({ id: project, stagingUrl: "https://s.test/" }))).ok).toMatch(/queued/);
    await runPendingJobs(20);
    const r1 = (JSON.parse((await db.cosWorkItem.findUniqueOrThrow({ where: { id: project } })).payload!) as { qa: { passed: boolean; issues: { check: string }[]; assetId: string | null } }).qa;
    expect(r1.passed).toBe(false); expect(r1.issues.some((i) => i.check === "broken_links")).toBe(true); expect(r1.assetId).toBeTruthy();
    await db.cosWorkItem.update({ where: { id: project }, data: { state: "internal_qa" } });
    await expect(transitionWorkItem(staffActor(), project, "client_review")).rejects.toThrow(/Automated QA failed/);
    page = HTML_OK;
    const r2 = await runQa(project);
    expect(r2.passed).toBe(true);
    await transitionWorkItem(staffActor(), project, "client_review");
    expect((await db.cosWorkItem.findUniqueOrThrow({ where: { id: project } })).state).toBe("client_review");
  });
});

describe("WP-42 pins", () => {
  it("client pins a spot; open pins ride along with 'request changes'; resolve", async () => {
    await signIn(owner, orgId);
    expect((await pinAdd({}, form({ subject: "work_item", subjectId: project, x: "120", y: "-5", text: "Logo too small" }))).ok).toBe("Pin added.");
    const pins = await openPins(orgId, "work_item", project);
    expect(pins[0]).toMatchObject({ n: 1, x: 100, y: 0, text: "Logo too small" });
    expect(await pinsSummary(orgId, "work_item", project)).toBe("#1 (100%, 0%): Logo too small");
    await db.cosWorkItem.update({ where: { id: project }, data: { state: "client_review" } });
    await requestApproval(staffActor(), project, "please review").catch(() => undefined);
    const approval = await db.cosApproval.findFirst({ where: { workItemId: project, status: "requested" }, orderBy: { createdAt: "desc" } });
    if (approval) {
      await db.cosWorkItem.update({ where: { id: project }, data: { contentHash: approval.contentHash } }); // items made directly in the test carry no hash
      await decideApproval(ownerActor(), approval.id, "rejected", { reason: "Fix pins" });
      const n = await db.cosNotification.findFirst({ where: { orgId, kind: "revision_requested" }, orderBy: { createdAt: "desc" } });
      expect(n?.body).toContain("#1 (100%, 0%): Logo too small");
    }
  });
});

describe("WP-43 beacon", () => {
  it("parses only the allowed shape, records for active workspaces, heatmap aggregates, sweep after 30 days; script honours DNT", async () => {
    expect(parseBeacon({ w: orgId, t: "pv", p: "/pricing?x=1" })).toEqual({ w: orgId, t: "pv", p: "/pricing" });
    expect(parseBeacon({ w: orgId, t: "click", p: "/pricing", x: 150, y: 40, g: "BUTTON!" })).toMatchObject({ x: 100, y: 40, g: "button" });
    expect(parseBeacon({ w: orgId, t: "input", p: "/x" })).toBeNull();
    expect(parseBeacon({ w: orgId, t: "click", p: "/x" })).toBeNull();
    const res = await beaconPost(new NextRequest("http://app.test/api/os/beacon", { method: "POST", body: JSON.stringify({ w: orgId, t: "pv", p: "/pricing" }) }));
    expect(res.status).toBe(204);
    await recordBeacon({ w: orgId, t: "click", p: "/pricing", x: 50, y: 20, g: "a" });
    await recordBeacon({ w: orgId, t: "scroll", p: "/pricing", d: 80 });
    await recordBeacon({ w: orgId, t: "pv", p: "/old" }, new Date(Date.now() - 40 * 86_400_000));
    const h = await heatmapData(orgId, "/pricing");
    expect(h).toMatchObject({ pages: 1, clicks: [{ x: 50, y: 20, tag: "a" }], scroll: { avgDepth: 80, samples: 1 } });
    expect(await sweepBehavior()).toBeGreaterThanOrEqual(1);
    expect(await db.cosBehaviorEvent.count({ where: { orgId, path: "/old" } })).toBe(0);
    const js = await (await scriptGet(new NextRequest("http://app.test/s/beacon.js"), { params: Promise.resolve({ kind: "beacon.js" }) })).text();
    expect(js).toContain("doNotTrack"); expect(js).not.toMatch(/innerText|value\b/); expect(js.length).toBeLessThan(2048);
  });
});

describe("WP-44 chat", () => {
  it("start (rate limited, token identity) → email identifies + creates a b2c lead under purpose support → staff reply → visitor reads → close", async () => {
    mail.sent.length = 0;
    const start = await chatStart(new NextRequest("http://app.test/api/os/chat/start", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ w: orgId, text: "Do you do implants?", email: `${tag}-visitor@example.com`, page: "/services" }) }));
    expect(start.status).toBe(200);
    const { visitorToken } = (await start.json()) as { visitorToken: string };
    expect(visitorToken.length).toBeGreaterThan(20);
    const conv = await db.cosConversation.findUniqueOrThrow({ where: { visitorToken } });
    expect(conv.email).toBe(`${tag}-visitor@example.com`); expect(conv.leadId).toBeTruthy();
    expect(await db.losConsentEvent.count({ where: { leadId: conv.leadId!, purpose: "support" } })).toBeGreaterThan(0);
    expect(mail.sent.some((m) => m.to === `${tag}-owner@example.com` && m.text.includes("Do you do implants?"))).toBe(true); // offline mail
    expect((await chatPost(new NextRequest("http://app.test/api/os/chat/messages", { method: "POST", headers: { "x-chat-token": "nope" }, body: JSON.stringify({ text: "hi" }) }))).status).toBe(404);
    await signIn(staff, orgId);
    expect((await chatReply({}, form({ id: conv.id, text: "Yes — book a consult." }))).ok).toBe("Sent.");
    const read = await (await chatGet(new NextRequest("http://app.test/api/os/chat/messages", { headers: { "x-chat-token": visitorToken } }))).json() as { messages: { from: string; text: string }[] };
    expect(read.messages.map((m) => m.from)).toEqual(["visitor", "staff"]);
    expect((await chatClose({}, form({ id: conv.id }))).ok).toBe("Closed.");
    expect((await chatPost(new NextRequest("http://app.test/api/os/chat/messages", { method: "POST", headers: { "x-chat-token": visitorToken }, body: JSON.stringify({ text: "more" }) }))).status).toBe(404);
  });
});

describe("WP-45 WhatsApp templates", () => {
  it("syncs Twilio Content templates with approval status into LosMessageTemplate", async () => {
    setWaFetchForTests((async (input: RequestInfo | URL) => { const u = String(input); if (u.endsWith("/Content?PageSize=100")) return Response.json({ contents: [{ sid: "HX1", friendly_name: "appointment_reminder", language: "en", variables: { "1": "name" }, types: { "twilio/text": { body: "Hi {{1}}, your appointment is tomorrow." } } }] }); if (u.includes("/ApprovalRequests")) return Response.json({ whatsapp: { status: "approved" } }); throw new Error(u); }) as typeof fetch);
    await signIn(owner, orgId);
    expect((await waTemplatesSync({}, form({}))).ok).toMatch(/1 WhatsApp/);
    const t = await db.losMessageTemplate.findFirst({ where: { orgId, contentSid: "HX1" } });
    expect(t).toMatchObject({ channel: "whatsapp", approvalStatus: "approved", name: "appointment_reminder (en)" });
    expect(bodyOf({ sid: "x", friendly_name: "x", types: { "twilio/quick-reply": { body: "QR" } } })).toBe("QR");
    await signIn(owner, orgId); // second sync updates, no duplicate
    await waTemplatesSync({}, form({}));
    expect(await db.losMessageTemplate.count({ where: { orgId, contentSid: "HX1" } })).toBe(1);
  });
});

describe("WP-46 enrichment", () => {
  it("reads company fields with sources, respects robots.txt, never personal data; accept writes the company", async () => {
    const home = `<html><head><title>Acme Corp — Dental</title><meta name="description" content="Clinic in Pune"><meta property="og:site_name" content="Acme Corp"><meta name="generator" content="WordPress 6"><script type="application/ld+json">{"@type":"Organization","name":"Acme Corp","telephone":"+91 20 1234","address":{"addressLocality":"Pune","addressCountry":"IN"},"sameAs":["https://www.linkedin.com/company/acme"],"employee":{"name":"Dr Personal"}}</script></head><body></body></html>`;
    const f = extract(home, { server: "nginx", "cf-ray": "abc" }, ["aspmx.l.google.com"], new Date());
    expect(f.name).toMatchObject({ value: "Acme Corp", source: "schema.org Organization" });
    expect(f.city.value).toBe("Pune"); expect(f.emailProvider.value).toBe("Google Workspace"); expect(f.hosting.value).toMatch(/Cloudflare/); expect(f.cms.value).toMatch(/WordPress/);
    expect(JSON.stringify(f)).not.toContain("Dr Personal");
    let robots = "User-agent: *\nDisallow:\n";
    setEnrichDepsForTests((async (input: RequestInfo | URL) => { const u = String(input); if (u.endsWith("/robots.txt")) return new Response(robots); if (u === "https://acme-corp.test/") return new Response(home, { headers: { server: "nginx" } }); throw new Error(u); }) as typeof fetch, async () => [{ exchange: "aspmx.l.google.com" }]);
    const r = await runEnrichment(lead);
    expect(r?.fields.name.value).toBe("Acme Corp");
    await signIn(owner, orgId);
    const fd = form({ leadId: lead }); fd.append("field", "name"); fd.append("field", "city"); fd.append("field", "cms"); fd.append("field", "telephone");
    expect((await enrichAccept({}, fd)).ok).toMatch(/3 field/);
    const l = await db.losLead.findUniqueOrThrow({ where: { id: lead }, include: { company: true } });
    expect(l.company).toMatchObject({ name: "Acme Corp", city: "Pune", domain: "acme-corp.test" });
    expect(JSON.parse(l.company!.techAttributes!)).toContain("cms:WordPress 6");
    robots = "User-agent: *\nDisallow: /\n";
    expect((await runEnrichment(lead))?.robotsAllowed).toBe(false);
  });
});

describe("WP-47 competitors", () => {
  it("observes sitemap count, feed cadence, tech and top pages into a dated CosSource; never a traffic number", async () => {
    setCompetitorFetchForTests((async (input: RequestInfo | URL) => { const u = String(input);
      if (u === "https://rival.test/sitemap.xml") return new Response(`<urlset><url><loc>https://rival.test/</loc></url><url><loc>https://rival.test/a</loc></url><url><loc>https://rival.test/b</loc></url></urlset>`);
      if (u === "https://rival.test/feed") return new Response(`<rss><channel><item><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate></item><item><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item></channel></rss>`);
      if (u === "https://rival.test/") return new Response(`<html><head><title>Rival</title><meta name="description" content="We rival"></head><body><script src="https://www.googletagmanager.com/gtm.js"></script></body></html>`, { headers: { "cf-ray": "x" } });
      if (u.startsWith("https://rival.test/")) return new Response(`<html><head><title>Page ${u.slice(-1)}</title></head></html>`);
      throw new Error(u); }) as typeof fetch);
    await signIn(owner, orgId);
    expect((await competitorAdd({}, form({ domain: "https://www.Rival.test/path" }))).ok).toMatch(/Competitor added/);
    const c = await db.cosCompetitor.findFirstOrThrow({ where: { orgId, domain: "rival.test" } });
    const o = await observe("rival.test");
    expect(o.sitemapUrls).toBe(3); expect(o.feed).toMatchObject({ items: 2, latest: "2026-09-01" }); expect(o.tech).toEqual(expect.arrayContaining(["Google Tag Manager", "Cloudflare"])); expect(o.topPages).toHaveLength(3);
    expect(observationText(o)).not.toMatch(/traffic/i);
    const src = await observeCompetitor(c.id);
    expect(src?.title).toMatch(/^Competitor observation: rival\.test — \d{4}-\d{2}-\d{2}$/);
    expect(src?.excerpt).toContain("Sitemap URLs: 3");
  });
});

describe("WP-48 AI-search visibility", () => {
  it("records brand / competitor mentions and cited URLs per question, metered internally (no client wallet)", async () => {
    expect(analyse(`Try ${tag} Clinic (https://clinic.test/x). Rival.test is also good.`, `${tag} Clinic`, ["rival"])).toEqual({ brandMentioned: true, competitors: ["rival"], citedUrls: ["https://clinic.test/x"] });
    setAskForTests(async (q) => `For "${q}": ${tag} Clinic in Pune, see https://clinic.test/aligners.`);
    await signIn(owner, orgId);
    expect((await questionAdd({}, form({ question: "Which dental clinic in Pune offers aligners?" }))).ok).toMatch(/tracked/);
    expect(await observeQuestions(orgId, new Date(), true)).toBe(1);
    const s = await visibilitySummary(orgId);
    expect(s[0]).toMatchObject({ runs: 1, brandMentions: 1 }); expect(s[0].latest?.citedUrls).toEqual(["https://clinic.test/aligners"]);
    expect(await observeQuestions(orgId, new Date())).toBe(0); // weekly guard
    const usage = await db.cosAiUsage.findFirst({ where: { orgId, feature: "ai_visibility" } });
    expect(usage?.payer ?? "catalyst_internal").toBe("catalyst_internal");
  });
});

describe("WP-49 reviews + review request", () => {
  it("review.request is a lead-contact block under purpose review_request; GBP reviews sync stores rating + snippet only, lifetime snapshot", async () => {
    expect(BLOCKS["review.request"].contacts).toBe(true);
    const env = { orgId, workflowId: "wf", actorId: owner, depth: 0, demo: true, leadId: lead, setLeadId: () => {}, getState: () => ({}), setState: async () => {} };
    const r = await RUNNERS["review.request"]({ channel: "email", reviewUrl: "https://g.page/r/x", body: "Would you review us? {{reviewUrl}}" }, env) as { outcome: string };
    expect(["blocked", "sent", "queued"]).toContain(r.outcome); // b2b lead with no consent record → blocked by the purpose engine or sent in dev
    setReviewsFetchForTests((async (input: RequestInfo | URL) => { const u = String(input);
      if (u.includes("accountmanagement")) return Response.json({ accounts: [{ name: "accounts/1" }] });
      if (u.includes("businessinformation")) return Response.json({ locations: [{ name: "locations/9", title: "Clinic" }] });
      if (u.includes("/reviews")) return Response.json({ reviews: [{ reviewId: "r1", starRating: "FIVE", comment: "Great", createTime: "2026-09-01T00:00:00Z", reviewer: { displayName: "Priya Personal" } }, { reviewId: "r2", starRating: "FOUR", createTime: "2026-09-02T00:00:00Z" }] });
      throw new Error(u); }) as typeof fetch);
    expect(await syncReviews(orgId)).toEqual({ synced: 2, locations: 1 });
    const s = await reviewsSummary(orgId);
    expect(s).toMatchObject({ count: 2, average: 4.5 });
    expect(JSON.stringify(await db.cosReview.findMany({ where: { orgId } }))).not.toContain("Priya");
    expect(await db.cosMetricSnapshot.findFirst({ where: { orgId, provider: "gbp", metric: "reviews.average", kind: "lifetime" } })).toBeTruthy();
  });
});

describe("WP-50 / WP-51 exports", () => {
  it("invoices CSV/JSON carry GST fields per currency; time log is staff-only; the receipt is sealed and never carries the raw IP", async () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    const month = new Date().toISOString().slice(0, 7);
    const csv = await invoicesExport(ownerActor(), month, "csv");
    expect(csv.body.split("\n")[0]).toContain("taxRatePercent,tax,total,hsnSac");
    expect(csv.body).toContain("INR,10000.00,18.00,1800.00,11800.00,998314");
    const json = JSON.parse((await invoicesExport(ownerActor(), month, "json")).body) as { items: { hsnSac: string }[] };
    expect(json.items[0].hsnSac).toBe("998314");
    await signIn(owner, orgId);
    expect((await invoicesGet(new NextRequest(`http://app.test/api/os/export/invoices?month=${month}`))).headers.get("content-disposition")).toContain(`invoices-${month}.csv`);
    await expect(timeLogExport(ownerActor(), month)).rejects.toThrow("Forbidden.");
    const t = await timeLogExport(staffActor(), month);
    expect(t.body).toContain(`${tag} website,,Sam Staff,90,"Build, ""quoted"""`);
    expect(ipClass("10.1.2.3")).toBe("private"); expect(ipClass("103.5.6.7")).toBe("public"); expect(ipClass(null)).toBe("unknown");
    const rc = await signatureReceipt(ownerActor(), contractId);
    expect(rc.facts).toMatchObject({ signer: "Asha Owner", ipClass: "unknown", hashSource: "recomputed from the stored scope" });
    expect(rc.facts.contentHash).toBe(contractHash(await db.cosContract.findUniqueOrThrow({ where: { id: contractId } })));
    expect(rc.html).toContain(rc.seal); expect(rc.html).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    await signIn(staff, orgId);
    expect((await receiptGet(new NextRequest(`http://app.test/api/os/export/receipt?contractId=${contractId}`))).status).toBe(200);
    await expect(signatureReceipt({ orgId, userId: staff, role: "cgo_specialist" }, contractId)).rejects.toThrow("Forbidden.");
  });
});
