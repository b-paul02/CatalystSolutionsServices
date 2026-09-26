// WP-04 · provider price table (own module: lib/os/ai.ts and lib/os/pricing.ts both read it, and pricing imports studio).
// Keyed "<provider>:<model>", micro-USD per million tokens. Env override:
// PROVIDER_PRICES_JSON = {"openai:gpt-4o-mini":{"inputMicrosPerMTok":150000,"outputMicrosPerMTok":600000}}.
// A model absent from the table is UNKNOWN (cost NULL), never guessed. The static rows are published list prices as
// checked on 2026-09-27; the owner corrects them through the env var without a deploy.
export type ModelPrice = { inputMicrosPerMTok: number; outputMicrosPerMTok: number };
export const PROVIDER_PRICES: Record<string, ModelPrice> = {
  "openai:gpt-4o-mini": { inputMicrosPerMTok: 150_000, outputMicrosPerMTok: 600_000 },
  "openai:gpt-4o": { inputMicrosPerMTok: 2_500_000, outputMicrosPerMTok: 10_000_000 },
  "openai:gpt-4.1-mini": { inputMicrosPerMTok: 400_000, outputMicrosPerMTok: 1_600_000 },
  "google:gemini-2.5-flash-lite": { inputMicrosPerMTok: 100_000, outputMicrosPerMTok: 400_000 },
  "google:gemini-2.5-flash": { inputMicrosPerMTok: 300_000, outputMicrosPerMTok: 2_500_000 },
  "anthropic:claude-haiku-4-5-20251001": { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 5_000_000 },
  "anthropic:claude-sonnet-5": { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 },
};
export function priceForModel(model: string, env: NodeJS.ProcessEnv = process.env): ModelPrice | null {
  let table = PROVIDER_PRICES;
  if (env.PROVIDER_PRICES_JSON) { try { table = { ...PROVIDER_PRICES, ...(JSON.parse(env.PROVIDER_PRICES_JSON) as Record<string, ModelPrice>) }; } catch { /* malformed override ⇒ static table */ } }
  const key = Object.keys(table).find((k) => k === model || k.endsWith(`:${model}`));
  const row = key ? table[key] : null;
  return row && row.inputMicrosPerMTok > 0 && row.outputMicrosPerMTok > 0 ? row : null;
}

