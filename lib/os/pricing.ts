// AI-credit pricing model: is a rate card PROFITABLE against what the provider charges us? Pure functions, unit-tested.
// Nothing here sets a live price: PROPOSED_* are a starting point an operator reviews and activates (or not).
// Worst case per run = the most the provider can bill us for it (full input context, output at the chosen ceiling, one
// JSON-repair retry) against the LEAST a credit can earn (cheapest pack per credit, after the payment fee).
import type { Rates } from "./credits";
import { priceMax } from "./credits";
import { TOOLS } from "./studio";

/** What the provider charges, in micro-USD. Null = not configured ⇒ margins are UNKNOWN, never assumed. */
export type ProviderPrices = { inputMicrosPerMTok: number | null; outputMicrosPerMTok: number | null; imageMicros: number | null };
const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
export const providerPrices = (env: NodeJS.ProcessEnv = process.env): ProviderPrices => ({ inputMicrosPerMTok: num(env.LLM_PRICE_INPUT_MICROS_PER_MTOK), outputMicrosPerMTok: num(env.LLM_PRICE_OUTPUT_MICROS_PER_MTOK), imageMicros: num(env.IMAGE_PRICE_MICROS) });

export { PROVIDER_PRICES, priceForModel, type ModelPrice } from "./providerPrices";

export const minMarginPct = (env: NodeJS.ProcessEnv = process.env): number => num(env.AI_MIN_MARGIN_PCT) ?? 70;

// Prompt size we budget for: brand profile + approved claims + sources + findings (tenantContext) plus the inputs.
// Deliberately generous; `repurpose` also carries up to 12,000 pasted characters.
export const ASSUMED_INPUT_TOKENS = 7000, REPURPOSE_EXTRA_TOKENS = 3500, RETRY_FACTOR = 2;
// card fee we budget for on every pack (Stripe-style percentage + fixed part is folded into the percentage for small packs)
export const PAYMENT_FEE_PCT = 6;

export type PackLike = { credits: number; currency: string; amountMinor: number; synthetic?: boolean; active?: boolean };

/** Micro-USD one credit earns after the payment fee, from the CHEAPEST active real pack. Non-USD needs AI_FX_<CUR>_PER_USD. */
export function creditValueMicros(packs: PackLike[], env: NodeJS.ProcessEnv = process.env): { micros: number | null; basis: string } {
  const values: { v: number; label: string }[] = [];
  for (const p of packs.filter((x) => x.active !== false && !x.synthetic)) {
    const fx = p.currency === "USD" ? 1 : num(env[`AI_FX_${p.currency}_PER_USD`]);
    if (!fx) continue;
    values.push({ v: ((p.amountMinor / 100 / fx) * 1_000_000 * (1 - PAYMENT_FEE_PCT / 100)) / p.credits, label: `${p.credits} credits for ${(p.amountMinor / 100).toFixed(2)} ${p.currency}` });
  }
  if (!values.length) return { micros: null, basis: "no real pack with a known exchange rate" };
  const low = values.reduce((a, b) => (b.v < a.v ? b : a));
  return { micros: Math.round(low.v), basis: `cheapest pack: ${low.label}, less ${PAYMENT_FEE_PCT}% payment fee` };
}

export type MarginRow = { tool: string; maxCredits: number; worstCostMicros: number | null; revenueMicros: number | null; marginPct: number | null };

/** Worst-case margin per tool at its LONG output ceiling (the costliest run we would ever accept). */
export function marginReport(rates: Rates, prices: ProviderPrices, creditMicros: number | null, researchMicros: number | null = num(process.env.RESEARCH_PRICE_MICROS)): MarginRow[] {
  const rows = TOOLS.filter((t) => rates[t.key]).map((t) => {
    const maxTokens = t.limits.long, maxCredits = priceMax(rates[t.key], maxTokens);
    let cost: number | null;
    if (t.kind === "image") cost = prices.imageMicros; // one provider call per run: renderImage never retries
    else if (t.kind === "audit") cost = 0; // WP-13: our own crawler + Google PSI (free API): no provider bill
    else cost = prices.inputMicrosPerMTok === null || prices.outputMicrosPerMTok === null ? null
      : Math.ceil((((ASSUMED_INPUT_TOKENS + (t.key === "repurpose" ? REPURPOSE_EXTRA_TOKENS : 0)) * prices.inputMicrosPerMTok + maxTokens * prices.outputMicrosPerMTok) / 1_000_000) * RETRY_FACTOR);
    // the CHARGE for that worst run is at least base + the tokens produced, i.e. the quote itself
    const revenue = creditMicros === null ? null : maxCredits * creditMicros;
    return { tool: t.key, maxCredits, worstCostMicros: cost, revenueMicros: revenue, marginPct: cost === null || revenue === null || revenue === 0 ? null : Math.round(((revenue - cost) / revenue) * 1000) / 10 };
  });
  // web research is priced as its own line: a flat surcharge against the search provider's per-query price
  if (rates.research) {
    const revenue = creditMicros === null ? null : rates.research.base * creditMicros;
    rows.push({ tool: "research", maxCredits: rates.research.base, worstCostMicros: researchMicros, revenueMicros: revenue, marginPct: researchMicros === null || !revenue ? null : Math.round(((revenue - researchMicros) / revenue) * 1000) / 10 });
  }
  return rows;
}

/** Why a card must not go live, or [] when it may. Unknown costs are a reason too: "we could not check" is not "profitable". */
export function profitabilityProblems(rows: MarginRow[], min: number): string[] {
  const unknown = rows.filter((r) => r.marginPct === null).map((r) => r.tool);
  const thin = rows.filter((r) => r.marginPct !== null && r.marginPct < min);
  return [
    ...(unknown.length ? [`Margin cannot be checked for: ${unknown.join(", ")}. Set the provider prices (LLM_PRICE_INPUT_MICROS_PER_MTOK, LLM_PRICE_OUTPUT_MICROS_PER_MTOK, IMAGE_PRICE_MICROS, RESEARCH_PRICE_MICROS if research is priced), publish at least one real pack, and AI_FX_<CUR>_PER_USD for non-USD packs.`] : []),
    ...thin.map((r) => `${r.tool}: worst-case margin ${r.marginPct}% is below the ${min}% floor (quote ${r.maxCredits} credits, provider cost up to $${(r.worstCostMicros! / 1_000_000).toFixed(4)}).`),
  ];
}

// ── PROPOSAL (2026-09-21) — see GROWTHOS_AI_PRICING_PROPOSAL.md for the reasoning and the market comparison ────────────
// Credits per run = base + per 1,000 output tokens. Short social stays cheap; long-form scales with length; an image is flat.
const std = { base: 2, perKOutputTokens: 4 };
export const PROPOSED_RATES: Rates = {
  campaign_brief: { base: 3, perKOutputTokens: 4 }, content_calendar: { base: 3, perKOutputTokens: 4 }, blog_outline: std, blog_article: { base: 3, perKOutputTokens: 4 },
  web_copy: { base: 3, perKOutputTokens: 4 }, linkedin_post: std, linkedin_carousel: std, x_post: { base: 1, perKOutputTokens: 4 }, x_thread: std, social_caption: std,
  youtube_script: { base: 3, perKOutputTokens: 4 }, short_script: std, email_sequence: { base: 3, perKOutputTokens: 4 }, seo_brief: std, repurpose: { base: 3, perKOutputTokens: 4 },
  research: { base: 2, perKOutputTokens: 0 }, // per web search, on top of the tool
  image: { base: 10, perKOutputTokens: 0 }, performance_summary: { base: 3, perKOutputTokens: 4 },
  site_audit: { base: 15, perKOutputTokens: 0 }, // WP-13: flat per crawl (up to 300 pages + PageSpeed)
};
export const PROPOSED_PACKS: (PackLike & { label: string; market: "US" | "IN" })[] = [
  { label: "Starter", market: "US", credits: 250, currency: "USD", amountMinor: 25_00 }, { label: "Growth", market: "US", credits: 600, currency: "USD", amountMinor: 49_00 }, { label: "Scale", market: "US", credits: 1500, currency: "USD", amountMinor: 99_00 },
  { label: "Starter", market: "IN", credits: 250, currency: "INR", amountMinor: 1_999_00 }, { label: "Growth", market: "IN", credits: 600, currency: "INR", amountMinor: 3_999_00 }, { label: "Scale", market: "IN", credits: 1500, currency: "INR", amountMinor: 7_999_00 },
];
