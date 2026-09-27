// Harness for tests that drive REAL entry points (server actions, route handlers). Only the framework and
// provider boundaries are replaced: the request cookie jar, revalidatePath/redirect/after, and outbound `fetch`.
// Sessions, memberships, permissions, entitlements, accounting and state machines all run for real.
import { createHmac } from "node:crypto";
import { vi } from "vitest";
import { db } from "@/lib/audit/db";
import { randomToken, sha256 } from "@/lib/leados/crypto";

export const jar = new Map<string, string>();
export const nextHeadersMock = {
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => void jar.set(k, v), delete: (k: string) => void jar.delete(k) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
};
export class Redirect extends Error { constructor(public url: string) { super(`NEXT_REDIRECT ${url}`); } }
export const nextNavigationMock = { redirect: (url: string) => { throw new Redirect(url); }, notFound: () => { throw new Error("NEXT_NOT_FOUND"); } };

/** A real LosSession row + the cookies a browser would hold. */
export async function signIn(userId: string, orgId: string) {
  const token = randomToken();
  await db.losSession.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.clear(); jar.set("los_session", token); jar.set("los_org", orgId);
}
export const signOut = () => jar.clear();

/** Run an action that ends in redirect(); returns where it went (or the returned state). */
export async function follow<T>(p: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try { return { state: await p }; } catch (e) { if (e instanceof Redirect) return { redirect: e.url }; throw e; }
}
export const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// ── provider boundary ────────────────────────────────────────────────────────
export const provider = {
  llmCalls: 0, imageCalls: 0, searchCalls: [] as string[], stripeCalls: [] as URLSearchParams[], lastLlmBody: "",
  /** web search results the next research run gets, or an HTTP status to fail with */
  search: { status: 200, results: [] as { title: string; url: string; description: string }[] },
  /** what the next chat completion returns: JSON content, or an HTTP status to fail with */
  llm: { content: {} as unknown, status: 200, outputTokens: 200 as number | null, timeout: false, gate: null as Promise<void> | null },
  image: { fail: false },
};
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

export function installProviderFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/chat/completions")) {
      provider.llmCalls++;
      provider.lastLlmBody = String(init?.body ?? "");
      if (provider.llm.timeout) throw new DOMException("The operation timed out.", "TimeoutError");
      if (provider.llm.gate) await provider.llm.gate; // a slow provider: the answer arrives late
      if (provider.llm.status !== 200) return new Response("provider refused", { status: provider.llm.status });
      return Response.json({ id: `chatcmpl-test-${provider.llmCalls}`, choices: [{ message: { content: JSON.stringify(provider.llm.content) } }], usage: provider.llm.outputTokens === null ? undefined : { prompt_tokens: 500, completion_tokens: provider.llm.outputTokens } });
    }
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      provider.searchCalls.push(new URL(url).searchParams.get("q") ?? "");
      if (provider.search.status !== 200) return new Response("no", { status: provider.search.status });
      return Response.json({ web: { results: provider.search.results } });
    }
    if (url.endsWith("/images/generations")) {
      provider.imageCalls++;
      if (provider.image.fail) throw new DOMException("The operation timed out.", "TimeoutError");
      return Response.json({ data: [{ b64_json: PNG }] });
    }
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions")) {
      const body = init!.body as URLSearchParams;
      provider.stripeCalls.push(body);
      const id = `cs_test_${provider.stripeCalls.length}_${Date.now()}`;
      return Response.json({ id, url: `https://checkout.stripe.test/${id}` });
    }
    throw new Error(`Unexpected outbound request in a test: ${url.split("?")[0]}`);
  });
}

export const WEBHOOK_SECRET = "whsec_test_only";
/** A correctly signed Stripe webhook request, as the route receives it. */
export function signedWebhook(event: Record<string, unknown>) {
  const raw = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex");
  return { raw, header: `t=${t},v1=${sig}` };
}
