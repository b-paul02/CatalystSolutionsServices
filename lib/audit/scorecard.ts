// Growth Readiness Scorecard — computed DETERMINISTICALLY from scrape signals,
// intake answers, and PageSpeed. Never LLM-generated: honest and repeatable.
import type { ScrapeResult } from "./scrape";
import type { PageSpeedResult } from "./pagespeed";

export type Check = { label: string; pass: boolean; detail?: string };
export type Scorecard = {
  overall: number; // 0–100
  verdict: string;
  subscores: { key: string; label: string; score: number }[];
  checks: Check[];
  pagespeed: PageSpeedResult | null;
};

const pct = (got: number, max: number) => Math.round((got / max) * 100);

export function buildScorecard(scrape: ScrapeResult, pagespeed: PageSpeedResult | null): Scorecard | null {
  if (!scrape.ok) return null; // no website (or unreachable) → no scorecard; the report adapts
  const s = scrape.signals;

  const checks: Check[] = [
    { label: "Analytics / conversion tracking", pass: s.hasAnalytics, detail: s.hasAnalytics ? "Tracking script detected" : "No GA4, Tag Manager, or pixel found" },
    { label: "Structured data (schema markup)", pass: s.hasSchema, detail: s.hasSchema ? "JSON-LD found" : "No JSON-LD — invisible to rich results and AI answers" },
    { label: "Meta description on homepage", pass: s.hasMetaDescription },
    { label: "HTTPS", pass: s.https },
    { label: "Blog or content section", pass: s.hasBlog },
    { label: "Online booking / scheduling link", pass: s.hasBooking },
    { label: "Contact form present", pass: s.formCount > 0, detail: s.maxFormFields > 5 ? `Longest form has ${s.maxFormFields} fields — long forms suppress enquiries` : undefined },
    ...(pagespeed ? [{ label: "Mobile performance (Google PageSpeed)", pass: pagespeed.performanceScore >= 50, detail: `Score ${pagespeed.performanceScore}/100${pagespeed.lcpSeconds ? `, LCP ${pagespeed.lcpSeconds}s` : ""}` }] : []),
  ];

  const visibility = pct(
    (s.hasMetaDescription ? 1 : 0) + (s.hasSchema ? 1 : 0) + (s.hasBlog ? 1 : 0) + (scrape.pages.length > 2 ? 1 : 0), 4);
  const conversion = pct(
    (s.formCount > 0 ? 1 : 0) + (s.hasBooking ? 1 : 0) + (s.formCount > 0 && s.maxFormFields <= 5 ? 1 : 0), 3);
  const tracking = pct((s.hasAnalytics ? 2 : 0) + (s.https ? 1 : 0), 3);
  const aiReadiness = pct(
    (s.hasSchema ? 2 : 0) + (s.hasMetaDescription ? 1 : 0) + (s.homepageWordCount > 300 ? 1 : 0), 4);

  const subscores = [
    { key: "visibility", label: "Visibility", score: visibility },
    { key: "conversion", label: "Conversion readiness", score: conversion },
    { key: "tracking", label: "Tracking & data", score: tracking },
    { key: "ai", label: "AI-search readiness", score: aiReadiness },
    ...(pagespeed ? [{ key: "speed", label: "Mobile speed", score: pagespeed.performanceScore }] : []),
  ];
  const overall = Math.round(subscores.reduce((a, x) => a + x.score, 0) / subscores.length);

  const weakest = [...subscores].sort((a, b) => a.score - b.score)[0];
  const verdict =
    overall >= 75 ? `Strong foundation — your biggest gap is ${weakest.label.toLowerCase()}.`
    : overall >= 45 ? `A workable base with clear gaps — ${weakest.label.toLowerCase()} needs attention first.`
    : `Significant gaps across the basics — start with ${weakest.label.toLowerCase()}.`;

  return { overall, verdict, subscores, checks, pagespeed };
}
