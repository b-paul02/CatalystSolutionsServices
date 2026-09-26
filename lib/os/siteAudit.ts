// WP-13 · first-party site audit: a chunked crawl (job chain, 20 URLs per step, ≤ 60 s each) with pure-TS HTML checks,
// then Google PSI/CrUX for the homepage and top templates, then CosFinding rows with plain "why it matters / how to
// fix" copy. No headless browser, no package: fetch + regex parsing. Same host only, robots.txt respected, 300-URL cap.
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { fetchPageSpeed, type PageSpeedResult } from "@/lib/audit/pagespeed";
import { logLosAudit } from "@/lib/leados/audit";
import { SCORING_VERSION, type PillarScore } from "./audit";
import { notify } from "./notify";
import { flagOn } from "./flags";
import { WorkError } from "./work";

export const SITE_AUDIT_JOB = "os.audit_crawl";
export const SITE_AUDIT_KIND = "site_audit";
export const URL_CAP = 300, PER_STEP = 20, FETCH_TIMEOUT_MS = 10_000, MAX_HOPS = 5, PSI_MAX = 6;
const UA = "CatalystGrowthOS-SiteAudit/1.0 (+https://catalystsolutionservices.com)";

export type CheckId = "http_error" | "redirect_chain" | "canonical_missing" | "canonical_mismatch" | "title_missing" | "title_length" | "description_missing" | "description_length" | "h1_count" | "img_alt_missing" | "broken_internal_link" | "mixed_content" | "noindex" | "response_size" | "schema_missing" | "psi_performance" | "psi_lcp";
export const CHECKS: Record<CheckId, { label: string; severity: "error" | "warning" | "notice"; pillar: string; why: string; fix: string }> = {
  http_error: { label: "Page returns an error", severity: "error", pillar: "visibility", why: "Search engines drop pages that return 4xx/5xx and visitors hit a dead end.", fix: "Restore the page or redirect it (301) to the closest live page; remove links to it." },
  redirect_chain: { label: "Redirect chain", severity: "warning", pillar: "speed", why: "Each hop adds latency and dilutes link signals.", fix: "Point links and redirects straight at the final URL (one hop at most)." },
  canonical_missing: { label: "No canonical tag", severity: "warning", pillar: "visibility", why: "Without a canonical, parameter and trailing-slash variants compete with each other.", fix: "Add <link rel=\"canonical\"> pointing at the preferred URL of each page." },
  canonical_mismatch: { label: "Canonical points elsewhere", severity: "notice", pillar: "visibility", why: "The page tells search engines to index a different URL. Fine when intended, a silent de-index when not.", fix: "Check the canonical target is the page you actually want ranked." },
  title_missing: { label: "Missing <title>", severity: "error", pillar: "visibility", why: "The title is the headline in search results; without it the engine invents one.", fix: "Add a unique title of 30–60 characters that says what the page is and for whom." },
  title_length: { label: "Title too short or too long", severity: "warning", pillar: "visibility", why: "Under 30 characters wastes the space; over 60 gets cut off in results.", fix: "Rewrite to 30–60 characters, main phrase first." },
  description_missing: { label: "Missing meta description", severity: "warning", pillar: "visibility", why: "The engine will pick a random sentence as the snippet.", fix: "Add a 70–160 character description that states the outcome and a reason to click." },
  description_length: { label: "Meta description too short or too long", severity: "notice", pillar: "visibility", why: "Very short snippets look thin; long ones are truncated.", fix: "Keep it 70–160 characters." },
  h1_count: { label: "Zero or multiple H1 headings", severity: "warning", pillar: "content", why: "One H1 tells readers and engines what the page is about.", fix: "Use exactly one H1 per page; make sub-sections H2/H3." },
  img_alt_missing: { label: "Images without alt text", severity: "warning", pillar: "content", why: "Screen readers skip them and image search cannot index them.", fix: "Add alt text describing the image; empty alt (alt=\"\") only for purely decorative images." },
  broken_internal_link: { label: "Broken internal link", severity: "error", pillar: "visibility", why: "Visitors and crawlers hit an error page; crawl budget is wasted.", fix: "Update or remove the link on the page listed." },
  mixed_content: { label: "Mixed content (http resources on an https page)", severity: "error", pillar: "analytics", why: "Browsers block or warn on insecure resources; the padlock disappears.", fix: "Serve every image, script and stylesheet over https." },
  noindex: { label: "Page is set to noindex", severity: "notice", pillar: "visibility", why: "The page is excluded from search on purpose — make sure that is intended.", fix: "Remove the noindex meta/header if the page should rank." },
  response_size: { label: "HTML over 2 MB", severity: "warning", pillar: "speed", why: "Very large documents are slow to download and parse on mobile.", fix: "Move inline scripts/styles and data blobs out of the HTML; paginate long listings." },
  schema_missing: { label: "No schema.org structured data", severity: "notice", pillar: "ai", why: "Structured data helps search engines and AI assistants understand the business, offers and reviews.", fix: "Add JSON-LD for Organization / LocalBusiness on the homepage and the relevant type on key pages." },
  psi_performance: { label: "Low mobile performance score (PageSpeed)", severity: "warning", pillar: "speed", why: "Slow pages lose visitors before they see the offer, and speed is a ranking signal.", fix: "Follow the PageSpeed report: compress images, defer scripts, reduce third-party tags." },
  psi_lcp: { label: "Largest Contentful Paint over 2.5 s", severity: "warning", pillar: "speed", why: "The main content takes too long to appear on mobile.", fix: "Optimise the hero image/text, preload it, and cut render-blocking resources." },
};

export type AuditState = {
  status: "crawling" | "psi" | "done" | "failed"; origin: string; queue: string[]; seen: string[]; pages: number; cap: number; disallow: string[];
  issues: Partial<Record<CheckId, string[]>>; linkedFrom: Record<string, string>; psiQueue: string[]; psi: { url: string; result: PageSpeedResult | null }[];
  startedAt: string; finishedAt?: string; error?: string; step: number; requestedById: string | null; operationId: string | null;
};

const normalise = (u: string) => { const x = new URL(u); x.hash = ""; return x.toString(); };
const sameHost = (u: string, origin: string) => { try { return new URL(u).origin === origin; } catch { return false; } };
const allowed = (u: string, disallow: string[]) => { const p = new URL(u).pathname; return !disallow.some((d) => d && p.startsWith(d)); };
const isHtml = (ct: string | null) => !ct || /text\/html|application\/xhtml/.test(ct);

/** Fetch with manual redirects so chains are visible. Returns the final response and the hop count. */
async function fetchPage(url: string): Promise<{ status: number; html: string; contentType: string | null; hops: number; finalUrl: string; bytes: number }> {
  let current = url, hops = 0;
  for (;;) {
    const res = await fetch(current, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location") && hops < MAX_HOPS) { current = new URL(res.headers.get("location")!, current).toString(); hops++; continue; }
    const ct = res.headers.get("content-type");
    const html = isHtml(ct) && res.status < 400 ? (await res.text()).slice(0, 3_000_000) : "";
    return { status: res.status, html, contentType: ct, hops, finalUrl: current, bytes: Number(res.headers.get("content-length")) || html.length };
  }
}

/** Pure per-page checks. Returns the check ids that fail, plus the internal links found. */
export function checkPage(url: string, page: { status: number; html: string; hops: number; finalUrl: string; bytes: number }, origin: string): { fails: CheckId[]; links: string[]; noindex: boolean } {
  const fails: CheckId[] = [];
  if (page.status >= 400) return { fails: ["http_error"], links: [], noindex: false };
  if (page.hops > 1) fails.push("redirect_chain");
  const html = page.html;
  if (!html) return { fails, links: [], noindex: false };
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (!title) fails.push("title_missing"); else if (title.length < 30 || title.length > 60) fails.push("title_length");
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ?? "";
  if (!desc.trim()) fails.push("description_missing"); else if (desc.length < 70 || desc.length > 160) fails.push("description_length");
  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) fails.push("h1_count");
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgs.some((i) => !/\balt\s*=/i.test(i))) fails.push("img_alt_missing");
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  if (!canonical) fails.push("canonical_missing");
  else { try { if (normalise(new URL(canonical, url).toString()) !== normalise(page.finalUrl)) fails.push("canonical_mismatch"); } catch { fails.push("canonical_mismatch"); } }
  if (/^https:/.test(url) && /(src|href)=["']http:\/\//i.test(html)) fails.push("mixed_content");
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  if (noindex) fails.push("noindex");
  if (page.bytes > 2_000_000) fails.push("response_size");
  if (!/application\/ld\+json|itemtype=["']https?:\/\/schema\.org/i.test(html)) fails.push("schema_missing");
  const links: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try { const abs = new URL(m[1], url); if (abs.origin === origin && /^https?:$/.test(abs.protocol)) links.push(normalise(abs.toString())); } catch { /* skip */ }
  }
  return { fails, links: [...new Set(links)], noindex };
}

function parseRobots(txt: string): string[] {
  const out: string[] = []; let applies = false;
  for (const raw of txt.split("\n")) { const line = raw.replace(/#.*/, "").trim(); const [k, ...rest] = line.split(":"); const v = rest.join(":").trim(); if (/^user-agent$/i.test(k)) applies = v === "*"; else if (applies && /^disallow$/i.test(k) && v) out.push(v); }
  return out;
}

/** Start: seed from sitemap.xml (else homepage), read robots.txt, create the run, enqueue step 0. */
export async function startSiteAudit(orgId: string, rawUrl: string, opts: { requestedById?: string | null; operationId?: string | null; demo?: boolean } = {}) {
  if (!(await flagOn("site_audit", orgId))) throw new WorkError("Site audits are switched off by the Catalyst team at the moment.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`); } catch { throw new WorkError("Enter a valid website address."); }
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) || !url.hostname.includes(".")) throw new WorkError("Enter a public website address.");
  const origin = url.origin, home = normalise(url.toString());
  const running = await db.cosAuditRun.findFirst({ where: { orgId, kind: SITE_AUDIT_KIND, url: home, summary: { contains: '"status":"crawling"' } } });
  if (running) return running;
  let disallow: string[] = [], queue = [home];
  try { const r = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); if (r.ok) disallow = parseRobots(await r.text()); } catch { /* none */ }
  try {
    const r = await fetch(`${origin}/sitemap.xml`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (r.ok) { const locs = [...(await r.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((u) => sameHost(u, origin)).map(normalise); queue = [...new Set([home, ...locs])].slice(0, URL_CAP); }
  } catch { /* no sitemap */ }
  const state: AuditState = { status: "crawling", origin, queue: queue.filter((u) => allowed(u, disallow)), seen: [], pages: 0, cap: URL_CAP, disallow, issues: {}, linkedFrom: {}, psiQueue: [], psi: [], startedAt: new Date().toISOString(), step: 0, requestedById: opts.requestedById ?? null, operationId: opts.operationId ?? null };
  const run = await db.cosAuditRun.create({ data: { orgId, url: home, kind: SITE_AUDIT_KIND, scoringVersion: SCORING_VERSION, scores: "{}", summary: JSON.stringify(state), demo: opts.demo ?? false } });
  await enqueueJob({ type: SITE_AUDIT_JOB, payload: { runId: run.id, cursor: 0 }, idempotencyKey: `${SITE_AUDIT_JOB}:${run.id}:0`, maxAttempts: 3 });
  await logLosAudit({ orgId, actorUserId: opts.requestedById ?? undefined, actorType: opts.requestedById ? "user" : "system", action: "audit.site_started", entity: "CosAuditRun", entityId: run.id, data: { seeded: state.queue.length } });
  return run;
}

export const auditState = (run: { summary: string }): AuditState | null => { try { const s = JSON.parse(run.summary) as AuditState; return s && typeof s === "object" && "status" in s && "queue" in s ? s : null; } catch { return null; } };

/** One chunk. Crawls up to PER_STEP URLs (5 at a time), or runs ONE PSI check, or finalises. Re-enqueues itself. */
export async function siteAuditStep(runId: string, cursor: number): Promise<void> {
  const run = await db.cosAuditRun.findUnique({ where: { id: runId } });
  const st = run ? auditState(run) : null;
  if (!run || !st || st.status === "done" || st.status === "failed" || st.step !== cursor) return; // stale or duplicate step
  try {
    if (st.status === "crawling") {
      const batch: string[] = [];
      while (batch.length < PER_STEP && st.queue.length && st.seen.length + batch.length < st.cap) { const u = st.queue.shift()!; if (!st.seen.includes(u) && !batch.includes(u)) batch.push(u); }
      for (let i = 0; i < batch.length; i += 5) {
        const results = await Promise.all(batch.slice(i, i + 5).map(async (u) => { try { return { u, page: await fetchPage(u) }; } catch { return { u, page: null }; } }));
        for (const { u, page } of results) {
          st.seen.push(u); st.pages++;
          if (!page) { (st.issues.http_error ??= []).push(u); continue; }
          const { fails, links } = checkPage(u, page, st.origin);
          for (const f of fails) { const list = (st.issues[f] ??= []); if (list.length < 100) list.push(u); }
          if (page.status >= 400 && st.linkedFrom[u]) { const list = (st.issues.broken_internal_link ??= []); if (list.length < 100) list.push(`${st.linkedFrom[u]} → ${u}`); }
          for (const l of links) { if (!st.linkedFrom[l]) st.linkedFrom[l] = u; if (!st.seen.includes(l) && !st.queue.includes(l) && allowed(l, st.disallow) && st.seen.length + st.queue.length < st.cap) st.queue.push(l); }
        }
      }
      if (st.queue.length === 0 || st.seen.length >= st.cap) {
        // PSI for the homepage + top templates (distinct first path segment), at most PSI_MAX, one per step
        const seenPaths = st.seen.map((u) => ({ u, seg: new URL(u).pathname.split("/")[1] ?? "" }));
        const templates = [...new Map(seenPaths.filter((x) => x.seg).map((x) => [x.seg, x.u])).values()].slice(0, PSI_MAX - 1);
        st.psiQueue = [...new Set([run.url, ...templates])].slice(0, PSI_MAX); st.status = "psi";
      }
    } else if (st.status === "psi") {
      const u = st.psiQueue.shift();
      if (u) st.psi.push({ url: u, result: await fetchPageSpeed(u) });
      if (st.psiQueue.length === 0) return await finalise(run.id, st);
    }
    st.step = cursor + 1;
    await db.cosAuditRun.update({ where: { id: run.id }, data: { summary: JSON.stringify(st) } });
    await enqueueJob({ type: SITE_AUDIT_JOB, payload: { runId: run.id, cursor: st.step }, idempotencyKey: `${SITE_AUDIT_JOB}:${run.id}:${st.step}`, maxAttempts: 3 });
  } catch (e) {
    st.status = "failed"; st.error = (e instanceof Error ? e.message : String(e)).slice(0, 300); st.finishedAt = new Date().toISOString();
    await db.cosAuditRun.update({ where: { id: run.id }, data: { summary: JSON.stringify(st) } });
    await notify({ orgId: run.orgId, audience: "staff", kind: "job_failed", title: `Site audit failed: ${run.url}`, body: st.error, href: "/app/audit", dedupeKey: `audit-failed:${run.id}` });
  }
}

async function finalise(runId: string, st: AuditState) {
  const run = await db.cosAuditRun.findUniqueOrThrow({ where: { id: runId } });
  const pages = Math.max(1, st.pages);
  for (const p of st.psi) { if (!p.result) continue; if (p.result.performanceScore < 50) (st.issues.psi_performance ??= []).push(`${p.url} (${p.result.performanceScore})`); if (p.result.lcpSeconds !== null && p.result.lcpSeconds > 2.5) (st.issues.psi_lcp ??= []).push(`${p.url} (${p.result.lcpSeconds}s)`); }
  // pillar score = share of pages free of that pillar's error/warning checks; speed from PSI when measured
  const scores: Record<string, PillarScore> = {};
  for (const pillar of ["visibility", "content", "conversion", "analytics", "ai", "speed"]) {
    const ids = (Object.keys(CHECKS) as CheckId[]).filter((id) => CHECKS[id].pillar === pillar && CHECKS[id].severity !== "notice" && !id.startsWith("psi_"));
    const affected = new Set(ids.flatMap((id) => (st.issues[id] ?? []).map((x) => x.split(" → ")[0])));
    if (pillar === "speed") { const measured = st.psi.filter((p) => p.result).map((p) => p.result!.performanceScore); scores[pillar] = measured.length ? { score: Math.round(measured.reduce((a, b) => a + b, 0) / measured.length), label: "verified" } : { score: null, label: "unavailable" }; }
    else if (pillar === "conversion") scores[pillar] = { score: null, label: "unavailable" }; // not something a crawl can measure
    else scores[pillar] = { score: Math.round(100 * (1 - Math.min(1, affected.size / pages))), label: ids.length ? "verified" : "unavailable" };
  }
  const findings = (Object.entries(st.issues) as [CheckId, string[]][]).filter(([, urls]) => urls.length).map(([id, urls]) => { const c = CHECKS[id]; return { orgId: run.orgId, auditRunId: run.id, pillar: c.pillar, text: `${c.label} (${urls.length} of ${st.pages} pages)`, severity: c.severity, label: "verified", evidence: `Why it matters: ${c.why} How to fix: ${c.fix} Affected (${urls.length}): ${urls.slice(0, 8).join(", ")}${urls.length > 8 ? " …" : ""}`.slice(0, 1800), sourceUrl: urls[0].split(" → ").pop() ?? null, observedAt: new Date() }; });
  st.status = "done"; st.finishedAt = new Date().toISOString();
  const prev = await db.cosAuditRun.findFirst({ where: { orgId: run.orgId, kind: SITE_AUDIT_KIND, url: run.url, id: { not: run.id }, summary: { contains: '"status":"done"' } }, orderBy: { createdAt: "desc" }, select: { scores: true } });
  const summary = { ...st, queue: [], linkedFrom: {}, snapshot: `Crawled ${st.pages} page(s) on ${st.origin}; ${findings.filter((f) => f.severity === "error").length} errors, ${findings.filter((f) => f.severity === "warning").length} warnings, ${findings.filter((f) => f.severity === "notice").length} notices.`, keyPoints: findings.slice(0, 6).map((f) => f.text), limitations: ["HTML checks are deterministic parsing of the fetched source, not a browser render.", "Conversion readiness is not measured by a crawl.", ...(st.psi.every((p) => !p.result) ? ["PageSpeed Insights returned no data, so speed is not measured."] : []), ...(st.seen.length >= st.cap ? [`Stopped at the ${st.cap}-URL cap.`] : [])], previousScores: prev ? JSON.parse(prev.scores) : null };
  await db.$transaction([
    db.cosAuditRun.update({ where: { id: run.id }, data: { scores: JSON.stringify(scores), summary: JSON.stringify(summary) } }),
    ...(findings.length ? [db.cosFinding.createMany({ data: findings })] : []),
  ]);
  await db.cosAiUsage.create({ data: { orgId: run.orgId, feature: "site_audit", modality: "audit", model: "crawler+psi", units: st.pages, costMicros: null, ok: true, userId: st.requestedById, demo: run.demo, payer: st.operationId ? "client_wallet" : "catalyst_internal", billingPurpose: st.operationId ? "client_self_service" : "internal_delivery", operationId: st.operationId } });
  await notify({ orgId: run.orgId, audience: "client", kind: "audit_finished", title: `Site audit finished: ${run.url}`, body: summary.snapshot, href: "/app/audit", dedupeKey: `audit-done:${run.id}` });
  await notify({ orgId: run.orgId, audience: "staff", kind: "audit_finished", title: `Site audit finished: ${run.url}`, body: summary.snapshot, href: "/app/audit", dedupeKey: `audit-done-staff:${run.id}` });
}

registerJobHandler(SITE_AUDIT_JOB, async (payload) => { const p = payload as { runId: string; cursor: number }; await siteAuditStep(p.runId, p.cursor); });
