// LLM calls for the pipeline — any OpenAI-compatible chat-completions API via fetch.
// ponytail: no SDK — one endpoint, one shape. Provider is pure env config:
//   LLM_BASE_URL  e.g. https://api.tokenrouter.com/v1  (or Gemini's /v1beta/openai)
//   LLM_API_KEY
//   LLM_MODEL     e.g. moonshotai/kimi-k3-free
// Function names kept as callClaude/callClaudeJSON so the rest of the pipeline is untouched.
const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.tokenrouter.com/v1";
const MODEL = process.env.LLM_MODEL ?? "moonshotai/kimi-k3-free";

import { AsyncLocalStorage } from "node:async_hooks";

// Usage metering: callers that must account for AI spend run inside withLlmUsage(); every completed
// call reports the provider's own token counts (null when the provider does not return them).
export type LlmUsage = { model: string; inputTokens: number | null; outputTokens: number | null; requestId?: string | null };
/** Our side gave up waiting. The provider may still have done (and billed) the work: outcome and cost are UNKNOWN. */
export class LlmTimeoutError extends Error { constructor() { super("The AI provider did not answer in time."); this.name = "LlmTimeoutError"; } }
const usageSink = new AsyncLocalStorage<LlmUsage[]>();
export async function withLlmUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: LlmUsage[] }> {
  const usage: LlmUsage[] = [];
  const result = await usageSink.run(usage, fn);
  return { result, usage };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Free-tier providers return 429/503 under load — retry with backoff rather than
// fail the whole (multi-minute) pipeline over one transient blip.
async function fetchWithRetry(system: string, user: string, maxTokens: number, attempts = 4, jsonMode = false): Promise<string> {
  for (let i = 0; ; i++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.LLM_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          // enforced JSON output — supported by Gemini's OpenAI-compat layer and most routers
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        // reasoning models on free routers can take minutes; also catches hung connections
        signal: AbortSignal.timeout(240_000),
      });
    } catch (e) {
      // A METERED call (AI Studio) that timed out is not sent again: the provider may still be working on it, and a blind
      // re-send would buy the same work twice. The caller releases the client's hold and records the cost as unknown.
      if (usageSink.getStore() && (e as Error).name === "TimeoutError") throw new LlmTimeoutError();
      // network-level failure (reset, DNS, timeout) — retryable
      if (i >= attempts - 1) throw new Error(`LLM network error after ${attempts} attempts: ${(e as Error).message}`);
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      usageSink.getStore()?.push({ model: MODEL, inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null, requestId: typeof data.id === "string" ? data.id.slice(0, 120) : res.headers.get("x-request-id")?.slice(0, 120) ?? null });
      const text = data.choices?.[0]?.message?.content ?? "";
      if (text) return text;
      throw new Error(`LLM returned no text: ${JSON.stringify(data).slice(0, 500)}`);
    }
    const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
    const body = await res.text();
    if (!retryable || i >= attempts - 1) throw new Error(`LLM ${res.status}: ${body.slice(0, 800)}`);
    await sleep(1000 * 2 ** i); // 1s, 2s, 4s, 8s
  }
}

export async function callClaude(system: string, user: string, maxTokens = 4096): Promise<string> {
  return fetchWithRetry(system, user, maxTokens);
}

/** Call expecting strict JSON. Retries once with the parse error injected. */
export async function callClaudeJSON<T>(system: string, user: string, maxTokens = 4096): Promise<T> {
  const sys = system + "\n\nReturn ONLY valid JSON. No markdown fences, no prose before or after.";
  let text = await fetchWithRetry(sys, user, maxTokens, 4, true);
  for (let attempt = 0; ; attempt++) {
    try {
      // tolerate accidental ```json fences
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      return JSON.parse(cleaned) as T;
    } catch (e) {
      if (attempt >= 1) throw new Error(`Malformed JSON from model: ${(e as Error).message}\n${text.slice(0, 500)}`);
      text = await callClaude(sys, `${user}\n\nYour previous output was not valid JSON (${(e as Error).message}). Output the corrected JSON only.`, maxTokens);
    }
  }
}
