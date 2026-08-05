// Dev utility: re-scrape a lead's site and recompute the deterministic scorecard
// into its existing report (no LLM calls). Usage: npx tsx scripts/refresh-scorecard.ts <leadId>
import { db } from "../lib/audit/db";
import { scrapeSite } from "../lib/audit/scrape";
import { fetchPageSpeed } from "../lib/audit/pagespeed";
import { buildScorecard } from "../lib/audit/scorecard";

const leadId = process.argv[2];
if (!leadId) { console.error("usage: npx tsx scripts/refresh-scorecard.ts <leadId>"); process.exit(1); }

(async () => {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { evidencePack: true, report: true } });
  if (!lead.url || !lead.evidencePack || !lead.report) throw new Error("lead needs url + pack + report");
  const old = JSON.parse(lead.evidencePack.scraped);
  const fresh = await scrapeSite(lead.url);
  const pagespeed = await fetchPageSpeed(lead.url);
  const scorecard = buildScorecard(fresh, pagespeed);
  await db.evidencePack.update({ where: { leadId }, data: { scraped: JSON.stringify({ ...fresh, inferred: old.inferred ?? null }) } });
  const report = JSON.parse(lead.report.json);
  report.scorecard = scorecard;
  await db.report.update({ where: { leadId }, data: { json: JSON.stringify(report) } });
  console.log("scorecard refreshed:", scorecard?.overall, scorecard?.subscores.map((s) => `${s.label}:${s.score}`).join(", "));
  process.exit(0);
})();
