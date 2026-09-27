// Scorecard campaigns (WP-10a). Pure: spec shape, sanitising, scoring and validation. A scorecard answer is
// SELF-REPORTED evidence — it is shown next to verified checks, never blended into them (plan §7).
import { AUDIT_PILLARS as PILLARS } from "@/lib/os/pillarDefs";

export type ScorecardAnswer = { label: string; points: number };
export type ScorecardQuestion = { key: string; text: string; category: string; answers: ScorecardAnswer[] };
/** `pillar` is an audit category key (lib/os/audit.ts PILLARS) so scores map onto the Growth Audit. */
export type ScorecardCategory = { key: string; label: string; pillar: string };
export type ScorecardBand = { min: number; max: number; label: string; headline: string; body: string; ctaLabel?: string; ctaHref?: string };
export type ScorecardSpec = { categories: ScorecardCategory[]; questions: ScorecardQuestion[]; bands: ScorecardBand[]; gate: "none" | "email_before_results" };

export type CategoryScore = { key: string; label: string; pillar: string; points: number; max: number; pct: number };
export type ScoreResult = { total: number; max: number; pct: number; band: string; bandIndex: number; categories: CategoryScore[] };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function defaultScorecard(): ScorecardSpec {
  return {
    categories: [{ key: "visibility", label: "Being found", pillar: "visibility" }, { key: "conversion", label: "Turning visitors into enquiries", pillar: "conversion" }],
    questions: [
      { key: "q_search", text: "When you search your main service and city, where does your website appear?", category: "visibility", answers: [{ label: "First page", points: 10 }, { label: "Second or third page", points: 5 }, { label: "Not at all / don't know", points: 0 }] },
      { key: "q_reviews", text: "How many Google reviews did you receive in the last 90 days?", category: "visibility", answers: [{ label: "10 or more", points: 10 }, { label: "1 to 9", points: 5 }, { label: "None", points: 0 }] },
      { key: "q_form", text: "How quickly does a website enquiry get a reply?", category: "conversion", answers: [{ label: "Within an hour", points: 10 }, { label: "Same day", points: 6 }, { label: "Longer, or it varies", points: 0 }] },
      { key: "q_booking", text: "Can a visitor book or buy without calling you?", category: "conversion", answers: [{ label: "Yes, online", points: 10 }, { label: "Only by phone or WhatsApp", points: 4 }, { label: "No", points: 0 }] },
    ],
    bands: [
      { min: 0, max: 39, label: "Getting started", headline: "There is a lot of room to grow", body: "Most enquiries you could be getting are going elsewhere. The good news: the fixes are well known.", ctaLabel: "Book a free call", ctaHref: "" },
      { min: 40, max: 69, label: "Building", headline: "You have the foundations", body: "Some parts work. Closing the gaps below is where the next customers come from.", ctaLabel: "Book a free call", ctaHref: "" },
      { min: 70, max: 100, label: "Established", headline: "You are ahead of most", body: "Now it is about compounding: consistency, measurement and small tests.", ctaLabel: "Book a free call", ctaHref: "" },
    ],
    gate: "email_before_results",
  };
}

/** Client-posted spec → safe spec. Unknown pillars, empty questions and malformed bands are dropped or normalised. */
export function sanitizeScorecard(raw: unknown): ScorecardSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ScorecardSpec>;
  const pillarKeys = new Set(PILLARS.map((p) => p.key));
  const categories: ScorecardCategory[] = (Array.isArray(r.categories) ? r.categories : []).slice(0, 8)
    .filter((c): c is ScorecardCategory => Boolean(c && typeof c === "object" && (c as ScorecardCategory).label))
    .map((c) => ({ key: key(String(c.key || c.label)) || "cat", label: String(c.label).slice(0, 80), pillar: pillarKeys.has(String(c.pillar)) ? String(c.pillar) : "conversion" }));
  const catKeys = new Set(categories.map((c) => c.key));
  const questions: ScorecardQuestion[] = (Array.isArray(r.questions) ? r.questions : []).slice(0, 30)
    .filter((q): q is ScorecardQuestion => Boolean(q && typeof q === "object" && (q as ScorecardQuestion).text))
    .map((q, i) => ({
      key: key(String(q.key || `q${i + 1}`)) || `q${i + 1}`, text: String(q.text).slice(0, 300), category: catKeys.has(String(q.category)) ? String(q.category) : categories[0]?.key ?? "cat",
      answers: (Array.isArray(q.answers) ? q.answers : []).slice(0, 8).filter((a) => a && typeof a === "object" && (a as ScorecardAnswer).label).map((a) => ({ label: String(a.label).slice(0, 120), points: Math.max(0, Math.min(100, Math.round(Number(a.points)) || 0)) })),
    }))
    .filter((q) => q.answers.length >= 2);
  const bands: ScorecardBand[] = (Array.isArray(r.bands) ? r.bands : []).slice(0, 6)
    .filter((b): b is ScorecardBand => Boolean(b && typeof b === "object" && (b as ScorecardBand).label))
    .map((b) => ({ min: clampPct(Number(b.min) || 0), max: clampPct(Number(b.max) || 0), label: String(b.label).slice(0, 60), headline: String(b.headline ?? "").slice(0, 160), body: String(b.body ?? "").slice(0, 1200), ctaLabel: b.ctaLabel ? String(b.ctaLabel).slice(0, 60) : undefined, ctaHref: b.ctaHref && /^(https:\/\/|\/)/.test(String(b.ctaHref)) ? String(b.ctaHref).slice(0, 300) : undefined }))
    .sort((a, b) => a.min - b.min);
  return { categories, questions, bands, gate: r.gate === "none" ? "none" : "email_before_results" };
}

/** Errors that block launch. Bands must be contiguous over 0–100 with no gaps or overlaps. */
export function scorecardProblems(spec: ScorecardSpec): string[] {
  const problems: string[] = [];
  if (spec.categories.length === 0) problems.push("Add at least one category.");
  if (spec.questions.length === 0) problems.push("Add at least one question with two or more answers.");
  for (const c of spec.categories) if (!spec.questions.some((q) => q.category === c.key)) problems.push(`Category "${c.label}" has no questions.`);
  if (spec.bands.length === 0) problems.push("Add at least one result band.");
  let cursor = 0;
  for (const b of spec.bands) {
    if (b.min !== cursor) { problems.push(`Result bands must cover 0–100 without gaps or overlaps (problem at ${b.min}).`); break; }
    if (b.max < b.min) { problems.push(`Band "${b.label}" ends before it starts.`); break; }
    cursor = b.max + 1;
  }
  if (spec.bands.length && cursor !== 101 && !problems.some((p) => p.includes("cover 0–100"))) problems.push("The last result band must end at 100.");
  return problems;
}

export const bandFor = (spec: ScorecardSpec, pct: number): { band: ScorecardBand | null; index: number } => {
  const i = spec.bands.findIndex((b) => pct >= b.min && pct <= b.max);
  return { band: i >= 0 ? spec.bands[i] : spec.bands.at(-1) ?? null, index: i >= 0 ? i : Math.max(0, spec.bands.length - 1) };
};

/** answers: question key → answer index (as posted). Unanswered = 0 points; total is over the max of every question. */
export function scoreAnswers(spec: ScorecardSpec, answers: Record<string, string | number>): ScoreResult {
  const categories: CategoryScore[] = spec.categories.map((c) => ({ key: c.key, label: c.label, pillar: c.pillar, points: 0, max: 0, pct: 0 }));
  let total = 0, max = 0;
  for (const q of spec.questions) {
    const qMax = Math.max(...q.answers.map((a) => a.points));
    const idx = Number(answers[q.key]);
    const pts = Number.isInteger(idx) && idx >= 0 && idx < q.answers.length ? q.answers[idx].points : 0;
    total += pts; max += qMax;
    const cat = categories.find((c) => c.key === q.category);
    if (cat) { cat.points += pts; cat.max += qMax; }
  }
  for (const c of categories) c.pct = c.max ? clampPct((c.points / c.max) * 100) : 0;
  const pct = max ? clampPct((total / max) * 100) : 0;
  const { band, index } = bandFor(spec, pct);
  return { total, max, pct, band: band?.label ?? "", bandIndex: index, categories };
}

/** 0..1 rank of the band inside the spec (top band = 1) — the lead-scoring input. */
export const bandRank = (spec: ScorecardSpec, bandIndex: number): number => (spec.bands.length <= 1 ? 1 : bandIndex / (spec.bands.length - 1));

/** Answers arrive inside the form values as sc_<questionKey>=<answerIndex>. */
export const answersFromValues = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith("sc_")).map(([k, v]) => [k.slice(3), v]));
