// Individual doctor presence scan — the evidence core of the Doctor Digital Audit.
// Runs the searches a patient would run (name + specialty + city) through Gemini's
// Google-Search grounding and records what actually appears: directory profiles,
// hospital staff pages, social profiles, review platforms, a personal site — or nothing.
// Honesty rule: results describe what appeared in OUR searches on a given date,
// never absolute claims that something "does not exist".

export type PresenceFinding = {
  where: string; // e.g. "Practo profile", "Hospital staff page", "Justdial listing"
  url: string;
  what: string; // one sentence: what a patient sees there
  type: "directory" | "hospital_page" | "social" | "own_website" | "review_platform" | "other";
};

export type PresenceScan = {
  searchedAt: string; // ISO date
  queries: string[];
  found: PresenceFinding[];
  notFound: string[]; // asset types that did NOT appear in these searches
};

function parseLenientJSON<T>(text: string): T | null {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const m = cleaned.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as T) : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Set when the last scan attempt hit a daily-quota 429 — retrying won't help, so callers stop early.
let quotaExhausted = false;

/** Retry wrapper: retries transient failures; a daily-quota 429 aborts immediately (it won't clear in seconds, and each retry burns more quota). */
export async function scanDoctorPresenceWithRetry(opts: Parameters<typeof scanDoctorPresence>[0], attempts = 3): Promise<PresenceScan | null> {
  for (let i = 0; i < attempts; i++) {
    quotaExhausted = false;
    const scan = await scanDoctorPresence(opts);
    if (scan) return scan;
    if (quotaExhausted) return null; // daily quota — stop burning calls
    if (i < attempts - 1) await sleep(15_000 * (i + 1)); // 15s, 30s
  }
  return null;
}

export async function scanDoctorPresence(opts: {
  name: string;
  specialty: string;
  city: string;
  clinic: string;
}): Promise<PresenceScan | null> {
  const queries = [
    `${opts.name} ${opts.city}`,
    `${opts.name} ${opts.specialty} ${opts.city}`,
    `${opts.name} ${opts.clinic}`,
  ];
  // grounded-search quota is separate and small on the free tier — try flash, then flash-lite
  for (const model of ["gemini-flash-latest", "gemini-flash-lite-latest"]) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.LLM_API_KEY ?? "" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `You are auditing the individual online presence of a doctor, exactly as a prospective patient would experience it.

Search the web for this doctor using queries like: ${queries.map((q) => `"${q}"`).join(", ")}.

Doctor: ${opts.name}, ${opts.specialty}, practising at ${opts.clinic}, ${opts.city}.

Report ONLY what you actually find in the search results for this specific person (be careful about namesakes — if a result is clearly a different person with the same name, exclude it). For each genuine result record where it is, its URL, and what a patient would learn there.

Then list which of these asset types did NOT appear in your searches: personal/practice website, Google Business Profile or Maps listing, healthcare directory profile (Practo, Lybrate, Justdial or similar), hospital staff profile page, professional social profile (LinkedIn/Instagram/YouTube), patient reviews.

Return ONLY JSON: {"found":[{"where","url","what","type":"directory|hospital_page|social|own_website|review_platform|other"}],"not_found":[strings]}`,
            }],
          }],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(90_000),
      }
    );
    if (res.status === 429) { quotaExhausted = true; return null; } // daily grounding quota — abort, don't burn more
    if (!res.ok) continue; // other availability issues — try the next model
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const parsed = parseLenientJSON<{ found?: PresenceFinding[]; not_found?: string[] }>(text);
    if (!parsed) continue;
    return {
      searchedAt: new Date().toISOString().slice(0, 10),
      queries,
      found: (parsed.found ?? []).slice(0, 10),
      notFound: parsed.not_found ?? [],
    };
  } catch {
    continue;
  }
  }
  return null;
}
