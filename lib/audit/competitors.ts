// Phase 2 — automated, evidence-backed competitor analysis.
// Discovery chain: client-provided names > Gemini Google-Search grounding > LLM knowledge.
// EVERY candidate passes the same verification gate: its real site is scraped, relevance is
// classified from actual content, and survivors are measured with the identical 27-check
// scorecard the client gets. Nothing unverified is ever reported.
import { callClaudeJSON } from "./anthropic";
import { scrapeSite, type ScrapeResult } from "./scrape";
import { fetchPageSpeed } from "./pagespeed";
import { buildScorecard, type Scorecard } from "./scorecard";

export type Competitor = {
  name: string;
  url: string;
  type: "direct" | "indirect";
  why: string; // one line: why they compete with the client
  scorecard: Scorecard | null;
};

export type CompetitorsResult = {
  source: "client" | "grounded" | "knowledge" | "none";
  candidatesConsidered: number;
  competitors: Competitor[];
};

type Candidate = { name: string; url: string };

// directories, aggregators, socials, news — never competitors themselves
const EXCLUDE = /facebook|instagram|linkedin|youtube|twitter|x\.com|pinterest|wikipedia|quora|reddit|glassdoor|justdial|sulekha|indiamart|yelp|tripadvisor|crunchbase|medium\.com|blogspot|wordpress\.com|news|times|google\.|bing\.|amazon\.|flipkart/i;

function parseLenientJSON<T>(text: string): T | null {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    // tolerate prose around the JSON — grab the outermost array or object
    const m = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as T) : null;
  } catch {
    return null;
  }
}

/** Native Gemini call with the google_search grounding tool (not available via the OpenAI-compat layer). */
async function groundedDiscovery(profileText: string, clientUrl: string): Promise<Candidate[] | null> {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.LLM_API_KEY ?? "" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `Search the web to identify up to 6 real competitors (both direct and indirect) of this business:\n${profileText}\nTheir website: ${clientUrl}\n\nOnly include actual operating businesses with their own websites — no directories, marketplaces, social profiles, or news articles. Return ONLY a JSON array: [{"name": "...", "url": "https://..."}]`,
            }],
          }],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    return parseLenientJSON<Candidate[]>(text);
  } catch {
    return null;
  }
}

async function knowledgeDiscovery(profileText: string, clientUrl: string): Promise<Candidate[] | null> {
  try {
    const out = await callClaudeJSON<{ candidates: Candidate[] }>(
      `You propose likely competitors of a business from your knowledge. A competitor is a business whose OFFERING competes for the same purchase decision by the same buyer — not merely a big name in the same industry. (Example: for a medical-training institute selling courses to doctors, competitors are other course/fellowship providers, not hospitals.) Only name real businesses you are confident exist, with their real website URLs. Every suggestion will be independently verified by visiting the site — wrong URLs are simply discarded, so do not guess domains.`,
      `BUSINESS:\n${profileText}\nWebsite: ${clientUrl}\n\nReturn JSON: {"candidates":[{"name","url"}]} — up to 8: businesses a buyer would genuinely shortlist INSTEAD of this one (direct = same offering to the same buyer; indirect = a different way to satisfy the same need). No directories, marketplaces, or social profiles.`
    );
    return out.candidates ?? null;
  } catch {
    return null;
  }
}

export async function discoverAndMeasureCompetitors(opts: {
  profileText: string; // confirmed business profile as prose
  clientUrl: string;
  clientProvided?: string; // free-text competitor names from intake, optional
}): Promise<CompetitorsResult> {
  const clientHost = (() => { try { return new URL(opts.clientUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  // ---- discovery chain ----
  let source: CompetitorsResult["source"] = "none";
  let candidates: Candidate[] = [];

  const grounded = await groundedDiscovery(
    opts.profileText + (opts.clientProvided?.trim() ? `\nThe owner mentioned these competitors (include them): ${opts.clientProvided}` : ""),
    opts.clientUrl
  );
  if (grounded?.length) {
    source = opts.clientProvided?.trim() ? "client" : "grounded";
    candidates = grounded;
  } else {
    const known = await knowledgeDiscovery(opts.profileText, opts.clientUrl);
    if (known?.length) { source = "knowledge"; candidates = known; }
  }

  // ---- code-side filter ----
  const seen = new Set<string>();
  candidates = candidates.filter((c) => {
    try {
      const host = new URL(c.url.match(/^https?:\/\//) ? c.url : `https://${c.url}`).hostname.replace(/^www\./, "");
      if (!host || host === clientHost || EXCLUDE.test(c.url) || seen.has(host)) return false;
      seen.add(host);
      return true;
    } catch { return false; }
  }).slice(0, 6);

  if (!candidates.length) return { source, candidatesConsidered: 0, competitors: [] };

  // ---- verification gate: scrape every candidate's real site ----
  const scrapes = await Promise.all(candidates.map(async (c) => ({ c, scrape: await scrapeSite(c.url).catch(() => null) })));
  const live = scrapes.filter((x): x is { c: Candidate; scrape: ScrapeResult } => !!x.scrape?.ok && x.scrape.pages[0]?.text.length > 200);

  if (live.length < 2) return { source, candidatesConsidered: candidates.length, competitors: [] };

  // ---- relevance classification from ACTUAL site content (one batched call) ----
  type Verdict = { url: string; relevant: boolean; type: "direct" | "indirect"; why: string };
  const rawClassified = await callClaudeJSON<{ verdicts?: Verdict[] } | Verdict[]>(
    `You classify whether candidate businesses genuinely compete with a client, using ONLY the scraped text of their real websites. "direct" = same offering to the same buyers; "indirect" = a different route to the same underlying need. Be strict: if the site content doesn't show competition, mark relevant=false. "why" is one plain sentence a business owner would understand, grounded in what the site actually offers.`,
    `CLIENT:\n${opts.profileText}\n\nCANDIDATES:\n${JSON.stringify(live.map((x) => ({ name: x.c.name, url: x.c.url, site_text: x.scrape.pages[0].text.slice(0, 1500) })), null, 1)}\n\nReturn JSON: {"verdicts":[{"url","relevant":bool,"type":"direct|indirect","why"}]}`
  ).catch(() => null);
  const verdicts: Verdict[] = Array.isArray(rawClassified) ? rawClassified : rawClassified?.verdicts ?? [];
  const host = (u: string) => { try { return new URL(u.match(/^https?:\/\//) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return u; } };

  const relevant = live
    .map((x) => ({ ...x, verdict: verdicts.find((v) => host(v.url) === host(x.c.url)) }))
    .filter((x) => x.verdict?.relevant)
    .slice(0, 3);

  if (relevant.length < 2) return { source, candidatesConsidered: candidates.length, competitors: [] };

  // ---- measurement: identical scorecard battery (+ PageSpeed) as the client ----
  const competitors: Competitor[] = await Promise.all(relevant.map(async (x) => ({
    name: x.c.name,
    url: x.scrape.url,
    type: x.verdict!.type,
    why: x.verdict!.why,
    scorecard: buildScorecard(x.scrape, await fetchPageSpeed(x.scrape.url)),
  })));

  return { source, candidatesConsidered: candidates.length, competitors };
}
