// AI roles for CatalystGrowthOS (blueprint §11). Topology: tenant-scoped context
// → model → structured JSON → DETERMINISTIC validators → human review gate. The
// model never executes anything; every output lands as a draft a person reviews.
// Provider-agnostic: reuses the site's OpenAI-compatible client (LLM_* env).
import { db } from "@/lib/audit/db";
import { callClaudeJSON, withLlmUsage } from "@/lib/audit/anthropic";
import { priceForModel } from "./providerPrices";

export const aiAvailable = (): boolean => Boolean(process.env.LLM_API_KEY);
export const aiModel = (): string => process.env.LLM_MODEL ?? "default";

// ── deterministic validators (pure, unit-tested) ─────────────────────────────

// Claims the sales deck forbids (PDF pp. 16–17; blueprint §1.3): no guarantees.
const BANNED = [
  /\bguarantee[ds]?\b/i, /\b(#\s?1|number one|first page)\s+(on|in|of)\s+google\b/i, /\bwill\s+rank\b/i,
  /\b\d{2,}\s?%\s+(more|increase|growth|roi)\b.*\bguarant/i, /\brisk[- ]free\b/i, /\bdouble your (revenue|leads|sales)\b/i,
];

export function copyProblems(text: string): string[] {
  const problems: string[] = [];
  for (const re of BANNED) if (re.test(text)) problems.push(`Unsupported claim: "${text.match(re)?.[0]}"`);
  for (const url of text.match(/https?:\/\/\S+/g) ?? []) {
    try { new URL(url.replace(/[).,]+$/, "")); } catch { problems.push(`Invalid URL: ${url}`); }
  }
  if (/\[(insert|todo|tbd|placeholder)[^\]]*\]/i.test(text) || /lorem ipsum/i.test(text)) problems.push("Contains placeholder text.");
  return problems;
}

export type PlanPayload = {
  summary: string;
  allocation: { channel: string; pct: number; rationale: string; evidenceIds: string[] }[];
  focus: { title: string; why: string; effort: string; risk: string; successMetric: string; evidenceIds: string[] }[];
  assumptions: string[];
  risks: string[];
  alternatives: { name: string; tradeoff: string }[];
};

/**
 * Evidence discipline for a plan: allocation must sum to 100, every cited id
 * must be a real finding/learning of THIS tenant (hallucinated citations are
 * stripped and reported), and an uncited recommendation is only acceptable if
 * the plan declares assumptions.
 */
export function validatePlan(plan: PlanPayload, knownEvidenceIds: Set<string>): { plan: PlanPayload; problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const total = plan.allocation.reduce((a, r) => a + (Number.isFinite(r.pct) ? r.pct : 0), 0);
  if (plan.allocation.length === 0) problems.push("Plan has no allocation.");
  else if (Math.abs(total - 100) > 1) problems.push(`Allocation sums to ${total}%, not 100%.`);
  if (plan.allocation.some((r) => r.pct < 0)) problems.push("Negative allocation.");
  const clean = <T extends { evidenceIds: string[] }>(rows: T[], what: string): T[] =>
    rows.map((r) => {
      const ids = (r.evidenceIds ?? []).filter((id) => knownEvidenceIds.has(id));
      const dropped = (r.evidenceIds ?? []).length - ids.length;
      if (dropped > 0) notes.push(`Removed ${dropped} citation(s) that don't exist from ${what}.`);
      return { ...r, evidenceIds: ids };
    });
  const allocation = clean(plan.allocation ?? [], "allocation");
  const focus = clean(plan.focus ?? [], "focus areas");
  const uncited = [...allocation, ...focus].filter((r) => r.evidenceIds.length === 0).length;
  if (uncited > 0 && (plan.assumptions ?? []).length === 0) problems.push("Uncited recommendations but no stated assumptions.");
  if (uncited > 0) notes.push(`${uncited} recommendation(s) rest on assumptions, not evidence — label them as hypotheses.`);
  problems.push(...copyProblems(JSON.stringify(plan)));
  return { plan: { ...plan, allocation, focus, assumptions: plan.assumptions ?? [], risks: plan.risks ?? [], alternatives: plan.alternatives ?? [] }, problems, notes };
}

export type CalendarDraft = { dayOffset: number; channel: string; persona: string; topic: string; hook: string; format: string; cta: string };

// WP-19: formats are an enum; unknown formats are dropped (strict on shape). Aliases absorb small-model drift.
export const CALENDAR_FORMATS = ["text_post", "thread", "carousel", "image_post", "blog", "email", "reel", "short", "video"] as const;
const FORMAT_ALIASES: Record<string, string> = { post: "text_post", "text post": "text_post", text: "text_post", "linkedin post": "text_post", "x post": "text_post", tweet: "text_post", update: "text_post", article: "blog", "blog post": "blog", "long-form": "blog", longform: "blog", newsletter: "email", "email newsletter": "email", image: "image_post", "image post": "image_post", photo: "image_post", graphic: "image_post", "carousel post": "carousel", document: "carousel", reels: "reel", shorts: "short", "short video": "short", "video post": "video", "long video": "video", "youtube video": "video", "x thread": "thread", "twitter thread": "thread" };
export function normaliseFormat(raw: string, channel = ""): string | null {
  const f = raw.trim().toLowerCase().replace(/_/g, " "); const key = f.replace(/ /g, "_");
  if (!f) return channel === "blog" ? "blog" : channel === "email" ? "email" : channel === "youtube" ? "video" : "text_post"; // absent = the channel default
  if ((CALENDAR_FORMATS as readonly string[]).includes(key)) return key;
  return FORMAT_ALIASES[f] ?? null;
}

const CHANNEL_ALIASES: Record<string, string> = { twitter: "x", "x/twitter": "x", "linkedin post": "linkedin", "facebook page": "facebook", "blog post": "blog", article: "blog", newsletter: "email", "email newsletter": "email" };

/** Tolerant of shape drift from small models; strict on channels, dates and claims. */
export function validateCalendar(raw: unknown, allowedChannels: string[], days: number): { items: CalendarDraft[]; dropped: string[] } {
  const allowed = new Set(allowedChannels.map((c) => c.toLowerCase()));
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items
    : Array.isArray((raw as { calendar?: unknown })?.calendar) ? (raw as { calendar: unknown[] }).calendar : [];
  const items: CalendarDraft[] = [];
  const dropped: string[] = [];
  for (const it of list) {
    const o = (it ?? {}) as Record<string, unknown>;
    const rawChannel = String(o.channel ?? "").trim().toLowerCase();
    const channel = CHANNEL_ALIASES[rawChannel] ?? rawChannel;
    const dayOffset = Math.floor(Number(o.dayOffset ?? o.day ?? NaN));
    const topic = String(o.topic ?? o.title ?? "").trim();
    const text = `${topic} ${o.hook ?? ""} ${o.cta ?? ""}`;
    if (!allowed.has(channel)) { dropped.push(`channel "${rawChannel}"`); continue; }
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset >= days) { dropped.push(`day ${o.dayOffset ?? o.day}`); continue; }
    if (!topic) { dropped.push("no topic"); continue; }
    const problems = copyProblems(text);
    if (problems.length) { dropped.push(problems[0]); continue; }
    const format = normaliseFormat(String(o.format ?? ""), channel);
    if (!format) { dropped.push(`format "${String(o.format ?? "")}"`); continue; }
    items.push({ dayOffset, channel, persona: String(o.persona ?? ""), topic, hook: String(o.hook ?? ""), format, cta: String(o.cta ?? "") });
  }
  return { items, dropped };
}

// ── structured output (WP-27) ────────────────────────────────────────────────

/**
 * Model text → JSON → shape check → validated value. Malformed JSON or a failed check is a validation failure
 * (WorkError), never a draft. `check` receives the parsed value and returns the validated result or throws.
 */
export function parseJsonOutput<T>(text: string, check: (raw: unknown) => T): T {
  let raw: unknown;
  try { raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); }
  catch (e) { throw new AiOutputError(`The model did not return valid JSON (${(e as Error).message.slice(0, 80)}).`); }
  try { return check(raw); } catch (e) { if (e instanceof AiOutputError) throw e; throw new AiOutputError(e instanceof Error ? e.message : "The model output did not match the expected shape."); }
}
export class AiOutputError extends Error {}

/** Strings the model cited that are not in the allowed list (case-insensitive) — the string-valued twin of inventedNumbers. */
export function inventedStrings(cited: string[], allowed: string[]): string[] {
  const ok = new Set(allowed.map((a) => a.trim().toLowerCase()));
  return [...new Set(cited.map((c) => c.trim()).filter((c) => c && !ok.has(c.toLowerCase())))];
}

// ── tenant-scoped context ────────────────────────────────────────────────────

/** `sourceIds`: when the person picked sources for this run, ONLY those are given to the model (approved claims always are). */
export async function tenantContext(orgId: string, opts: { sourceIds?: string[] } = {}) {
  const brandRules = await db.cosBrandRules.findUnique({ where: { orgId }, select: { toneNotes: true, bannedPhrases: true, requiredPhrases: true } });
  const [org, ws, goals, run, findings, learnings, profile, claims, sources] = await Promise.all([
    db.losOrg.findUnique({ where: { id: orgId }, select: { name: true, industry: true, market: true, website: true } }),
    db.cosWorkspace.findUnique({ where: { orgId }, select: { brandProfile: true } }),
    db.cosGoal.findMany({ where: { orgId, archivedAt: null } }),
    db.cosAuditRun.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    db.cosFinding.findMany({ where: { orgId, status: { notIn: ["archived", "rejected"] } }, take: 40, orderBy: { createdAt: "desc" } }),
    // only APPROVED learnings may inform a plan (§7.3)
    db.cosLearning.findMany({ where: { orgId, status: "approved" }, take: 20 }),
    db.cosBusinessProfile.findUnique({ where: { orgId } }),
    // only claims the CLIENT approved may be stated as fact
    db.cosClaim.findMany({ where: { orgId, status: "approved" }, take: 40 }),
    db.cosSource.findMany({ where: { orgId, archivedAt: null, ...(opts.sourceIds?.length ? { id: { in: opts.sourceIds } } : {}) }, take: 20, orderBy: { createdAt: "desc" } }),
  ]);
  const evidenceIds = new Set([...findings.map((f) => f.id), ...learnings.map((l) => l.id)]);
  const text = JSON.stringify({
    business: org,
    brand: ws?.brandProfile ? JSON.parse(ws.brandProfile) : null,
    brandVoiceRules: brandRules ? { tone: brandRules.toneNotes, neverSay: brandRules.bannedPhrases, includeWhenItFits: brandRules.requiredPhrases } : null,
    profile: profile ? { businessModel: profile.businessModel, audience: profile.audience, offers: profile.offers, geography: profile.geography, brandVoice: profile.brandVoice, contentPillars: profile.contentPillars, constraints: profile.constraints, competitors: profile.competitors } : null,
    approvedClaims: claims.map((c) => ({ id: c.id, text: c.text })),
    sources: sources.map((s) => ({ id: s.id, title: s.title, url: s.url, excerpt: s.excerpt?.slice(0, 600) ?? null })),
    goals: goals.map((g) => ({ metric: g.metric, target: g.target, unit: g.unit, horizon: g.horizon })),
    auditScores: run ? JSON.parse(run.scores) : null,
    findings: findings.map((f) => ({ id: f.id, pillar: f.pillar, text: f.text, label: f.label, evidence: f.evidence.slice(0, 200) })),
    approvedLearnings: learnings.map((l) => ({ id: l.id, hypothesis: l.hypothesis, result: l.result, uncertainty: l.uncertainty })),
  });
  return { text, evidenceIds, grounding: [...claims.map((c) => c.text), ...sources.map((s) => s.excerpt ?? "")].join("\n") };
}

const RULES = `Rules: never promise or guarantee outcomes, rankings, revenue or AI citations. Cite evidence ONLY by the exact "id" values given in the context; if nothing supports a recommendation, leave evidenceIds empty and add the assumption to "assumptions". Findings labelled "assumed" or "unavailable" are hypotheses, not facts. Respond with JSON only.`;

export const generatePlan = (orgId: string, constraints: string) => metered(orgId, "plan", () => generatePlanRaw(orgId, constraints));
async function generatePlanRaw(orgId: string, constraints: string) {
  const ctx = await tenantContext(orgId);
  const raw = await callClaudeJSON<PlanPayload>(
    `You are an AI CMO drafting a growth plan for a strategist to review. ${RULES}
JSON shape: {"summary":string,"allocation":[{"channel":string,"pct":number,"rationale":string,"evidenceIds":string[]}],"focus":[{"title":string,"why":string,"effort":"low|medium|high","risk":string,"successMetric":string,"evidenceIds":string[]}],"assumptions":string[],"risks":string[],"alternatives":[{"name":string,"tradeoff":string}]}
Allocation percentages are suggested budget/effort ranges that must sum to 100. You cannot move money; you only propose.`,
    `Context:\n${ctx.text}\n\nClient constraints / notes:\n${constraints.slice(0, 2000) || "none given"}`,
  );
  return validatePlan(raw, ctx.evidenceIds);
}

export const generateCalendar = (orgId: string, channels: string[], days = 14, perWeek = 4) => metered(orgId, "calendar", () => generateCalendarRaw(orgId, channels, days, perWeek));
async function generateCalendarRaw(orgId: string, channels: string[], days = 14, perWeek = 4) {
  const ctx = await tenantContext(orgId);
  const raw = await callClaudeJSON<unknown>(
    `You plan a ${days}-day content calendar. ${RULES}
JSON shape: {"items":[{"dayOffset":number (0-${days - 1}),"channel":string,"persona":string,"topic":string,"hook":string,"format":string,"cta":string}]}
Use ONLY these channels: ${channels.join(", ")}. About ${perWeek} items per week per channel at most. "format" must be one of: ${CALENDAR_FORMATS.join(", ")}.`,
    `Context:\n${ctx.text}`,
  );
  return validateCalendar(raw, channels, days);
}

export const draftContent = (orgId: string, brief: { channel: string; topic: string; hook?: string; persona?: string; format?: string; cta?: string; notes?: string }) => metered(orgId, "content_draft", () => draftContentRaw(orgId, brief));
async function draftContentRaw(orgId: string, brief: { channel: string; topic: string; hook?: string; persona?: string; format?: string; cta?: string; notes?: string }) {
  const ctx = await tenantContext(orgId);
  const out = await callClaudeJSON<{ body: string; meta?: { title?: string; description?: string }; expertiseFlags?: string[] }>(
    `You draft channel-native marketing content for an editor to review. ${RULES}
JSON shape: {"body":string,"meta":{"title":string,"description":string},"expertiseFlags":string[]}
"expertiseFlags" lists every statement that needs a human expert, a source, or a real client proof point — never invent statistics, testimonials, client names or case studies.`,
    `Context:\n${ctx.text}\n\nBrief:\n${JSON.stringify(brief)}`,
  );
  return { ...out, body: out.body ?? "", expertiseFlags: out.expertiseFlags ?? [], problems: copyProblems(out.body ?? "") };
}

export const seoBrief = (orgId: string, keyword: string) => metered(orgId, "seo_brief", () => seoBriefRaw(orgId, keyword));
async function seoBriefRaw(orgId: string, keyword: string) {
  const ctx = await tenantContext(orgId);
  return callClaudeJSON<{ intent: string; outline: string[]; questions: string[]; internalLinks: string[]; expertiseFlags: string[] }>(
    `You write an SEO content brief for a specialist to validate. ${RULES}
JSON shape: {"intent":string,"outline":string[],"questions":string[],"internalLinks":string[],"expertiseFlags":string[]}`,
    `Context:\n${ctx.text}\n\nTarget keyword: ${keyword.slice(0, 120)}`,
  );
}

// ── metering ─────────────────────────────────────────────────────────────────

const price = (name: string): number | null => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : null; };

/**
 * Provider money cost in micro-USD, or null when prices / token counts are missing — unknown is never zero.
 * WP-04: the (provider, model) price table is consulted first; the LLM_PRICE_* env pair is the fallback for the default model.
 */
export function costMicros(u: { inputTokens: number | null; outputTokens: number | null; model?: string | null }): number | null {
  if (u.inputTokens === null || u.outputTokens === null) return null;
  const table = u.model ? priceForModel(u.model) : null;
  const inP = table?.inputMicrosPerMTok ?? price("LLM_PRICE_INPUT_MICROS_PER_MTOK"), outP = table?.outputMicrosPerMTok ?? price("LLM_PRICE_OUTPUT_MICROS_PER_MTOK");
  return inP !== null && outP !== null ? Math.round((u.inputTokens * inP + u.outputTokens * outP) / 1_000_000) : null;
}

/**
 * WHO PAYS is explicit and defaults to Catalyst: every staff drafting path (plan, calendar, variants, SEO brief,
 * report narrative, image) records `catalyst_internal`. Only lib/os/studio.ts ever records `client_wallet`, and only
 * alongside a settled reservation — `orgId` alone never means the client was charged.
 */
export type UsagePayer = { payer?: "catalyst_internal" | "client_wallet"; billingPurpose?: "internal_delivery" | "client_self_service" | "staff_assisted_client_billed" | "system"; operationId?: string | null };

/** Run an AI feature and record what it used. Cost is NULL unless prices are configured — unknown is not zero. */
export async function metered<T>(orgId: string, feature: string, fn: () => Promise<T>, opts: { modality?: string; workItemId?: string | null; userId?: string | null } & UsagePayer = {}): Promise<T> {
  let ok = true;
  const started = await withLlmUsage(async () => { try { return await fn(); } catch (e) { ok = false; throw e; } }).catch((e) => ({ error: e as unknown, usage: [] as { model: string; inputTokens: number | null; outputTokens: number | null }[], result: undefined as T | undefined }));
  const usage = started.usage;
  const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { demo: true } });
  for (const u of usage.length ? usage : [{ model: aiModel(), inputTokens: null, outputTokens: null }]) {
    await db.cosAiUsage.create({ data: { orgId, feature, modality: opts.modality ?? "text", model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costMicros: costMicros({ inputTokens: u.inputTokens, outputTokens: u.outputTokens, model: u.model }), ok: "error" in started ? false : ok, workItemId: opts.workItemId ?? null, userId: opts.userId ?? null, demo: ws?.demo ?? false, payer: opts.payer ?? "catalyst_internal", billingPurpose: opts.billingPurpose ?? "internal_delivery", operationId: opts.operationId ?? null } });
  }
  if ("error" in started) throw started.error;
  return started.result as T;
}

// ── grounded channel variants ────────────────────────────────────────────────

/** Sentences that state a number, a percentage or a superlative and are NOT backed by an approved claim or a source. */
export function unsupportedClaims(text: string, grounding: string): string[] {
  const g = grounding.toLowerCase().replace(/(\d),(?=\d)/g, "$1");
  const gNums = new Set(g.match(/\d+(?:\.\d+)?/g) ?? []);
  const SUPERLATIVE = /\b(best|leading|fastest|number one|award[- ]winning|trusted by)\b|#1\b/i;
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /\d+\s?%|\b\d{2,}\b/.test(s) || SUPERLATIVE.test(s)).filter((s) => {
    // a superlative must appear (in substance) in an approved claim or source; a number must match a number there
    if (SUPERLATIVE.test(s) && !g.includes(s.toLowerCase().replace(/[.!?]+$/, "").slice(0, 60))) return true;
    const nums = s.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
    return nums.some((n) => !gNums.has(n));
  });
}

export type VariantDraft = { channel: string; format: string; title?: string; body: string; parts: string[]; cta?: string; flags: string[]; problems: string[] };

/**
 * Master → channel adaptations. Output is a DRAFT: claim checks are deterministic, anything unsupported
 * is returned as a flag the editor must resolve, and banned-claim copy is rejected outright.
 */
export const draftVariants = (orgId: string, master: { title: string; brief: string; body: string }, targets: { channel: string; format: string; maxChars?: number }[], instruction = "") =>
  metered(orgId, "variant_draft", async () => {
    const ctx = await tenantContext(orgId);
    const raw = await callClaudeJSON<{ variants?: { channel?: string; format?: string; title?: string; body?: string; parts?: string[]; cta?: string }[] }>(
      `You adapt ONE approved master message into channel-native variants for an editor to review. ${RULES}
State facts ONLY from "approvedClaims" and "sources" in the context. Never invent statistics, testimonials, client names, prices or results; when a point needs proof you do not have, write it without the claim.
A "long_video", "short" or "reel" variant is a SCRIPT/description for a human production team — it is not a video.
JSON shape: {"variants":[{"channel":string,"format":string,"title":string,"body":string,"parts":string[] (threads only, one post each),"cta":string}]}`,
      `Context:\n${ctx.text}\n\nMaster title: ${master.title}\nBrief: ${master.brief.slice(0, 2000)}\nMaster copy:\n${master.body.slice(0, 8000)}\n\nProduce exactly these variants: ${JSON.stringify(targets)}\n${instruction ? `Editor instruction: ${instruction.slice(0, 500)}` : ""}`,
    );
    const wanted = new Set(targets.map((x) => `${x.channel}:${x.format}`));
    const out: VariantDraft[] = [];
    for (const v of raw.variants ?? []) {
      if (!v.channel || !v.format || !wanted.has(`${v.channel}:${v.format}`)) continue; // never accept a channel we did not ask for
      const parts = Array.isArray(v.parts) ? v.parts.filter((p) => typeof p === "string" && p.trim()) : [];
      const all = [v.title ?? "", v.body ?? "", ...parts].join("\n");
      out.push({ channel: v.channel, format: v.format, title: v.title?.slice(0, 200), body: String(v.body ?? ""), parts, cta: v.cta?.slice(0, 200), flags: unsupportedClaims(all, ctx.grounding).map((s) => `Needs a source or an approved claim: "${s.slice(0, 140)}"`), problems: copyProblems(all) });
    }
    return out;
  });

// ── grounded report narrative ────────────────────────────────────────────────

/** Every number in the narrative must be one of the supplied facts. Returns the offending numbers. */
export function inventedNumbers(narrative: string, facts: Record<string, string | number | null>): string[] {
  const nums = (s: string) => (s.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
  const allowed = new Set(Object.values(facts).filter((v) => v !== null).flatMap((v) => nums(String(v))));
  return [...new Set(nums(narrative))].filter((n) => !allowed.has(n) && Number(n) > 1);
}

/** Plain, deterministic narrative — always available, used whenever the AI version fails its check. */
export function factualNarrative(period: string, facts: Record<string, string | number | null>, limitations: string): string {
  const lines = Object.entries(facts).map(([k, v]) => `${k}: ${v === null ? "not available for this period" : v}`);
  return `Results for ${period}\n${lines.join("\n")}\n\nLimitations: ${limitations}`;
}

export const groundedNarrative = (orgId: string, period: string, facts: Record<string, string | number | null>, limitations: string) =>
  metered(orgId, "report_narrative", () => groundedNarrativeRaw(period, facts, limitations));

/** The unmetered core — callers that account for usage themselves (AI Studio) use this. */
export async function groundedNarrativeRaw(period: string, facts: Record<string, string | number | null>, limitations: string, maxTokens = 4096) {
  {
    const out = await callClaudeJSON<{ narrative?: string; suggestions?: { text: string; evidence: string }[] }>(
      `You write a short results summary for a client. Use ONLY the facts given; a fact that is null is "not available" — never call it zero. Do not infer causes, do not predict, do not promise. ${RULES}
JSON shape: {"narrative":string,"suggestions":[{"text":string,"evidence":string (quote the fact keys and the period it rests on)}]}`,
      `Period: ${period}\nFacts: ${JSON.stringify(facts)}\nLimitations to restate: ${limitations}`,
    );
    const narrative = String(out.narrative ?? "");
    const bad = [...inventedNumbers(narrative, { ...facts, period }), ...copyProblems(narrative)];
    if (!narrative || bad.length) return { narrative: factualNarrative(period, facts, limitations), suggestions: [], ai: false, rejected: bad };
    // a suggestion without evidence is dropped, not shown
    return { narrative: `${narrative}\n\nLimitations: ${limitations}`, suggestions: (out.suggestions ?? []).filter((s) => s.text && s.evidence && Object.keys(facts).some((k) => s.evidence.includes(k))).map((s) => ({ text: s.text.slice(0, 300), evidence: `${s.evidence.slice(0, 200)} (${period})` })), ai: true, rejected: [] };
  }
}
