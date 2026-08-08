// Dev utility: standalone competitor discovery test.
// Usage: npx tsx scripts/test-competitors.ts "<profile text>" <clientUrl>
import { discoverAndMeasureCompetitors } from "../lib/audit/competitors";

(async () => {
  const [profileText, clientUrl] = process.argv.slice(2);
  const out = await discoverAndMeasureCompetitors({ profileText, clientUrl });
  console.log("source:", out.source, "| candidates considered:", out.candidatesConsidered);
  for (const c of out.competitors) {
    console.log(`\n${c.name} (${c.type}) — ${c.url}`);
    console.log("  why:", c.why);
    console.log("  overall:", c.scorecard?.overall, "|", c.scorecard?.subscores.map((s) => `${s.label}:${s.score}`).join(", "));
  }
  process.exit(0);
})();
