// Dev utility: manually re-run the pipeline for a lead stuck in needs_attention
// (e.g. after a transient Gemini 503). Usage: npx tsx scripts/rerun-pipeline.ts <leadId>
import { runPipeline } from "../lib/audit/pipeline";

const leadId = process.argv[2];
if (!leadId) {
  console.error("usage: npx tsx scripts/rerun-pipeline.ts <leadId>");
  process.exit(1);
}

runPipeline(leadId)
  .then(() => {
    console.log("PIPELINE DONE OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error("PIPELINE FAILED:", e.message);
    process.exit(1);
  });
