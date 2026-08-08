// Dev utility: verbose walk through the competitor funnel (knowledge path).
import { callClaudeJSON } from "../lib/audit/anthropic";
import { scrapeSite } from "../lib/audit/scrape";

const PROFILE = "The Medicity — Advanced medical training programs, fellowships, diplomas, and specialized courses in laparoscopic surgery, gynecology, IVF, ultrasound for practising doctors. Serves: Doctors, surgeons, and medical professionals seeking specialized clinical training and certifications in India.";

(async () => {
  const out = await callClaudeJSON<{ candidates: { name: string; url: string }[] }>(
    `You propose likely competitors of a business from your knowledge. A competitor is a business whose OFFERING competes for the same purchase decision by the same buyer — not merely a big name in the same industry. (Example: for a medical-training institute selling courses to doctors, competitors are other course/fellowship providers, not hospitals.) Only name real businesses you are confident exist, with their real website URLs.`,
    `BUSINESS:\n${PROFILE}\nWebsite: https://themedicity.com/\n\nReturn JSON: {"candidates":[{"name","url"}]} — up to 8: businesses a buyer would genuinely shortlist INSTEAD of this one. No directories, marketplaces, or social profiles.`
  );
  console.log("CANDIDATES:", out.candidates.map((c) => `${c.name} ${c.url}`).join(" | "));

  const live: { name: string; url: string; text: string }[] = [];
  for (const c of out.candidates.slice(0, 6)) {
    const s = await scrapeSite(c.url).catch(() => null);
    const textlen = s?.pages[0]?.text.length ?? 0;
    console.log("SCRAPE:", c.url, "->", s ? (s.ok ? `OK textlen=${textlen}` : `FAIL: ${s.error}`) : "threw");
    if (s?.ok && textlen > 200) live.push({ name: c.name, url: c.url, text: s.pages[0].text.slice(0, 1500) });
  }
  console.log("LIVE:", live.length);
  if (live.length < 2) { console.log("=> gate: fewer than 2 live"); process.exit(0); }

  const classified = await callClaudeJSON<{ verdicts: { url: string; relevant: boolean; type: string; why: string }[] }>(
    `You classify whether candidate businesses genuinely compete with a client, using ONLY the scraped text of their real websites. "direct" = same offering to the same buyers; "indirect" = a different route to the same underlying need. Be strict: if the site content doesn't show competition, mark relevant=false.`,
    `CLIENT:\n${PROFILE}\n\nCANDIDATES:\n${JSON.stringify(live.map((x) => ({ name: x.name, url: x.url, site_text: x.text })), null, 1)}\n\nReturn JSON: {"verdicts":[{"url","relevant":bool,"type":"direct|indirect","why"}]}`
  );
  console.log("VERDICTS:", JSON.stringify(classified.verdicts, null, 1));
  process.exit(0);
})();
