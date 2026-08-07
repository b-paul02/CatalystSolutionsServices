// Growth Readiness Scorecard v2 — computed DETERMINISTICALLY, never by the model.
//
// Defensibility rules:
// - Every check carries a verification level: "verified" (independently measured),
//   "detected" (a signal was seen but not proven to work), "assumed" (inferred).
// - Detected passes earn 70% of a verified pass. A pillar can only reach 100 if
//   every one of its checks passed at "verified" level.
// - The owner's own answers cap scores: an analytics script plus "we don't track
//   cost per lead" is NOT a working measurement setup.
// - Each pillar lists its deductions in plain language.
import type { ScrapeResult } from "./scrape";
import type { PageSpeedResult } from "./pagespeed";
import type { Intake } from "./score";

export type Verification = "verified" | "detected" | "assumed";
export type Check = {
  label: string;
  pass: boolean;
  verification: Verification;
  pillar: string;
  detail?: string;
};
export type Subscore = {
  key: string;
  label: string;
  score: number;
  confidence: "high" | "medium" | "low";
  deductions: string[];
};
export type Scorecard = {
  overall: number; // 0–100
  verdict: string;
  subscores: Subscore[];
  checks: Check[];
  pagespeed: PageSpeedResult | null;
  pagesReviewed: string[];
  checkedAt: string;
};

const PASS_WEIGHT: Record<Verification, number> = { verified: 1, detected: 0.7, assumed: 0.5 };

function pillarScore(checks: Check[], key: string): Subscore & { label: string } {
  const mine = checks.filter((c) => c.pillar === key);
  const earned = mine.reduce((a, c) => a + (c.pass ? PASS_WEIGHT[c.verification] : 0), 0);
  const score = mine.length ? Math.round((earned / mine.length) * 100) : 0;
  const verifiedFraction = mine.length ? mine.filter((c) => c.verification === "verified").length / mine.length : 0;
  const confidence = verifiedFraction >= 0.7 ? "high" : verifiedFraction >= 0.4 ? "medium" : "low";
  const deductions = mine
    .filter((c) => !c.pass || c.verification !== "verified")
    .map((c) => (!c.pass ? `−: ${c.label}${c.detail ? ` — ${c.detail}` : ""}` : `~: ${c.label} detected but not verified working`));
  return { key, label: "", score, confidence, deductions };
}

export function buildScorecard(
  scrape: ScrapeResult,
  pagespeed: PageSpeedResult | null,
  intake?: Intake,
  moduleAnswers?: Record<string, string>
): Scorecard | null {
  if (!scrape.ok) return null; // no website (or unreachable) → no scorecard; the report adapts
  const s = scrape.signals;
  const checks: Check[] = [];
  const add = (pillar: string, label: string, pass: boolean, verification: Verification, detail?: string) =>
    checks.push({ pillar, label, pass, verification, detail });

  // ---- Search visibility & indexing ----
  add("visibility", "robots.txt present", s.hasRobotsTxt, "verified");
  add("visibility", "XML sitemap found", s.hasSitemap, "verified");
  add("visibility", "Canonical tag on homepage", s.hasCanonical, "verified");
  add("visibility", "Homepage title tag length 15–65 characters", s.titleLength >= 15 && s.titleLength <= 65, "verified", `${s.titleLength} characters`);
  add("visibility", "Meta description on homepage", s.hasMetaDescription, "verified", s.metaDescriptionLength ? `${s.metaDescriptionLength} characters` : undefined);
  add("visibility", "All scanned pages have meta descriptions", s.pagesMissingMetaDescription === 0, "verified", s.pagesMissingMetaDescription ? `${s.pagesMissingMetaDescription} of ${scrape.pages.length} pages missing` : undefined);
  add("visibility", "No duplicate titles across scanned pages", s.duplicateTitles === 0, "verified", s.duplicateTitles ? `${s.duplicateTitles} duplicate(s)` : undefined);
  add("visibility", "Exactly one H1 on homepage", s.homepageH1Count === 1, "verified", `${s.homepageH1Count} found`);
  add("visibility", "No broken internal links in sample", s.brokenLinks.length === 0, "verified", s.brokenLinks.length ? `broken: ${s.brokenLinks.join(", ")}` : "5-link sample");

  // ---- Content & authority ----
  add("content", "Blog or content section", s.hasBlog, "detected");
  add("content", "Substantial homepage copy (300+ words)", s.homepageWordCount > 300, "verified", `${s.homepageWordCount} words`);
  add("content", "Multiple key pages reachable", scrape.pages.length > 2, "verified", `${scrape.pages.length} pages scanned`);

  // ---- Conversion readiness ----
  add("conversion", "Contact form present", s.formCount > 0, "verified");
  add("conversion", "Form length reasonable (≤5 fields)", s.formCount > 0 && s.maxFormFields <= 5, "verified", s.formCount ? `longest form: ${s.maxFormFields} fields` : "no form found");
  add("conversion", "Online booking / scheduling link", s.hasBooking, "detected");

  // ---- Analytics & attribution ----
  // The owner's answers cap this pillar: a script alone is not working measurement.
  const tracksConversions = (moduleAnswers?.["LG-4"] ?? "").startsWith("Yes, and I trust it");
  const ownerSaysUntracked = /don't track|do not track|not sure|no\b/i.test(moduleAnswers?.["LG-2"] ?? "") || (moduleAnswers?.["LG-4"] ?? "").match(/^(No|Not sure|Yes, but)/);
  add("tracking", "Analytics script installed", s.hasAnalytics, "detected");
  add("tracking", "Conversion tracking working", s.hasAnalytics && !!tracksConversions, tracksConversions ? "verified" : "assumed",
    tracksConversions ? "owner confirms tracking is trusted" : ownerSaysUntracked ? "owner reports conversions/cost per lead are not reliably tracked" : "not verified — no access to analytics account");
  add("tracking", "HTTPS", s.https, "verified");
  add("tracking", "HSTS security header", s.hstsHeader, "verified");
  add("tracking", "X-Content-Type-Options header", s.noSniffHeader, "verified");
  add("tracking", "No mixed http/https content", !s.mixedContent, "verified");

  // ---- AI-search readiness ----
  add("ai", "Structured data (JSON-LD) present", s.hasSchema, "detected", s.hasSchema ? "markup found — validity not independently verified" : "no JSON-LD found");
  add("ai", "Open Graph tags", s.hasOgTags, "verified");
  add("ai", "Machine-readable page structure (title + meta + H1)", s.titleLength > 0 && s.hasMetaDescription && s.homepageH1Count >= 1, "verified");

  // ---- Mobile & speed ----
  add("speed", "Mobile viewport configured", s.hasViewport, "verified");
  add("speed", "Favicon present", s.hasFavicon, "verified");
  add("speed", "Images have alt text", s.imageCount > 0 && s.imagesMissingAlt === 0, "verified", s.imageCount ? `${s.imagesMissingAlt} of ${s.imageCount} homepage images missing alt` : "no images sampled");
  if (pagespeed) {
    add("speed", "Google PageSpeed mobile score ≥ 50", pagespeed.performanceScore >= 50, "verified", `${pagespeed.performanceScore}/100`);
    if (pagespeed.lcpSeconds !== null)
      add("speed", "Largest Contentful Paint ≤ 2.5s (Google 'good')", pagespeed.lcpSeconds <= 2.5, "verified", `${pagespeed.lcpSeconds}s`);
    if (pagespeed.cls !== null)
      add("speed", "Cumulative Layout Shift ≤ 0.1", pagespeed.cls <= 0.1, "verified", `${pagespeed.cls}`);
    if (pagespeed.inpMs !== null)
      add("speed", "Interaction to Next Paint ≤ 200ms (real users)", pagespeed.inpMs <= 200, "verified", `${pagespeed.inpMs}ms`);
  }

  const pillars: [string, string][] = [
    ["visibility", "Search visibility"],
    ["content", "Content & authority"],
    ["conversion", "Conversion readiness"],
    ["tracking", "Analytics & trust"],
    ["ai", "AI-search readiness"],
    ["speed", "Mobile & speed"],
  ];
  const subscores: Subscore[] = pillars.map(([key, label]) => ({ ...pillarScore(checks, key), label }));
  const overall = Math.round(subscores.reduce((a, x) => a + x.score, 0) / subscores.length);

  const weakest = [...subscores].sort((a, b) => a.score - b.score)[0];
  const verdict =
    overall >= 75 ? `Strong foundation — your biggest gap is ${weakest.label.toLowerCase()}.`
    : overall >= 45 ? `A workable base with clear gaps — ${weakest.label.toLowerCase()} needs attention first.`
    : `Significant gaps across the basics — start with ${weakest.label.toLowerCase()}.`;

  return {
    overall, verdict, subscores, checks, pagespeed,
    pagesReviewed: scrape.pages.map((p) => p.path),
    checkedAt: scrape.checkedAt ?? new Date().toISOString().slice(0, 10),
  };
}
