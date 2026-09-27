// Research mode = REAL retrieval with citations, or nothing. One provider is implemented: the Brave Web Search API
// (GET https://api.search.brave.com/res/v1/web/search, header X-Subscription-Token, results at web.results[]; docs
// checked 2026-09-21). It is OFF until BRAVE_SEARCH_API_KEY is set — every tool then says "source-based drafting".
// Not live-verified in this build. Check the plan's terms for use with an AI model before enabling it for clients.
// Only the topic the person typed is sent to the search provider — never lead or client personal data.
import { WorkError } from "./work";

// WHAT THE MODEL SEES: the search provider's SNIPPETS (title + description + extra snippets, ≤700 characters per result).
// Pages are NOT fetched or read. So a citation means "this statement was drawn from that snippet", nothing more.
export type WebSource = { n: number; title: string; url: string; snippet: string; age: string | null; provider: "brave"; query: string; retrievedAt: string };
export const RESEARCH_NOTICE = "Web research used search-result snippets only — the pages themselves were not read. Citations show where a statement came from; they are NOT a fact-check. Open each source before publishing.";

// Retrieved text is UNTRUSTED third-party data. A result that tries to address the model is dropped before the prompt is built.
const INJECTION = [/\b(ignore|disregard|forget)\b.{0,40}\b(previous|above|prior|earlier|all)\b.{0,30}\b(instruction|prompt|rule|context)/i, /\b(system|developer)\s+(prompt|message|instruction)/i, /\byou (are|must|should) (now )?(an? |the )?(ai|assistant|model|chatbot)\b/i, /\b(as an ai|new instructions?:|begin (system|instructions)|<\/?(system|instructions?)>)/i, /\b(reveal|print|output|repeat)\b.{0,30}\b(prompt|instructions|api key|secret)/i];
export const looksLikeInjection = (text: string): boolean => INJECTION.some((re) => re.test(text));

export const researchReady = (): boolean => Boolean(process.env.BRAVE_SEARCH_API_KEY);
/** What one search costs Catalyst, micro-USD; null = unknown (never 0). */
export const researchCostMicros = (): number | null => { const n = Number(process.env.RESEARCH_PRICE_MICROS); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

export async function searchWeb(query: string, count = 6, now = new Date()): Promise<{ sources: WebSource[]; dropped: number }> {
  if (!researchReady()) throw new WorkError("Web research is not set up on this platform.");
  const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (q.length < 3) throw new WorkError("Give the research a topic to search for.");
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${Math.min(10, Math.max(1, count))}&safesearch=strict`;
  let res: Response;
  try { res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! }, redirect: "error", signal: AbortSignal.timeout(20_000) }); }
  catch { throw new WorkError("The web search did not answer, so nothing was drafted."); }
  if (!res.ok) throw new WorkError(`The web search refused the request (${res.status}), so nothing was drafted.`);
  const rows = (((await res.json()) as { web?: { results?: Record<string, unknown>[] } }).web?.results ?? [])
    .filter((r) => /^https:\/\//i.test(String(r.url ?? "")))
    .map((r) => ({ title: strip(r.title).slice(0, 160), url: String(r.url).slice(0, 500), snippet: [strip(r.description), ...(Array.isArray(r.extra_snippets) ? r.extra_snippets.map(strip) : [])].join(" ").slice(0, 700), age: r.age ? strip(r.age).slice(0, 40) : null }))
    .filter((r) => r.title && r.snippet);
  const clean = rows.filter((r) => !looksLikeInjection(`${r.title} ${r.snippet}`)).slice(0, count);
  const dropped = rows.length - rows.filter((r) => !looksLikeInjection(`${r.title} ${r.snippet}`)).length;
  // no results is a FAILED research run — we never quietly fall back to un-researched drafting under a "researched" label
  if (clean.length === 0) throw new WorkError("The web search found nothing usable for that topic, so nothing was drafted.");
  // identity + retrieval time stay with every source: which provider, which query, when
  return { sources: clean.map((r, i) => ({ n: i + 1, ...r, provider: "brave" as const, query: q, retrievedAt: now.toISOString() })), dropped };
}

/** Citation markers like [3] found in a text. */
export const citedNumbers = (text: string): number[] => [...new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

const STOP = new Set("about after again also because before being between both could does each from have into more most much must only other over same should some such than that their them then there these they this those through under very what when where which while will with would your".split(" "));
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
// figures worth checking: percentages, decimals and anything with two or more digits. Bare single digits are list / slide / step numbering.
const numbers = (s: string) => (s.replace(/\[\d{1,2}\]/g, "").replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?%?/g) ?? []).filter((x) => x.endsWith("%") || x.includes(".") || x.length >= 2).map((x) => x.replace("%", ""));

/**
 * What a marker is checked against — deterministically, and ONLY against the snippet the model was given:
 *   problems (draft discarded): a NUMBER in a cited sentence that does not appear in the cited snippet = fabricated attribution.
 *   flags (draft delivered, editor warned): a cited sentence sharing no meaningful word with its snippet.
 * This is NOT fact verification: a sentence can reuse a snippet's words and still misstate it, and the snippet itself may be wrong.
 */
export function citationSupport(text: string, sources: WebSource[]): { problems: string[]; flags: string[] } {
  const problems: string[] = [], flags: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/).filter((s) => /\[\d{1,2}\]/.test(s))) {
    for (const n of citedNumbers(sentence)) {
      const src = sources.find((x) => x.n === n);
      if (!src) continue; // reported by citationProblems
      const hay = `${src.title} ${src.snippet}`.replace(/(\d),(?=\d)/g, "$1");
      const missing = numbers(sentence).filter((x) => !new RegExp(`(^|[^\\d.])${x.replace(".", "\\.")}([^\\d]|$)`).test(hay));
      if (missing.length) problems.push(`It attributed ${missing.join(", ")} to source [${n}], which does not contain it`);
      else if (![...words(sentence)].some((w) => words(hay).has(w))) flags.push(`Source [${n}] may not support: "${sentence.replace(/\s+/g, " ").slice(0, 120)}"`);
    }
  }
  return { problems, flags };
}

/** Deterministic check: every marker must point at a real source, and a researched draft must cite at least one. */
export function citationProblems(text: string, sources: WebSource[]): string[] {
  const cited = citedNumbers(text), max = sources.length;
  const bad = cited.filter((n) => n < 1 || n > max);
  return [...(bad.length ? [`It cited source ${bad.map((n) => `[${n}]`).join(", ")}, which does not exist`] : []), ...(cited.length === 0 ? ["It was asked to research but cited no source"] : [])];
}
