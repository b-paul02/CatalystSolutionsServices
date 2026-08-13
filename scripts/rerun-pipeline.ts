// Dev utility: manually re-run the pipeline for a lead stuck in needs_attention
// (e.g. after a transient LLM failure). Dispatches by lead type (business vs doctor).
// Usage: npx tsx scripts/rerun-pipeline.ts <leadId>
import { db } from "../lib/audit/db";
import { runPipeline } from "../lib/audit/pipeline";
import { runDoctorPipeline } from "../lib/audit/doctor-pipeline";

const leadId = process.argv[2];
if (!leadId) {
  console.error("usage: npx tsx scripts/rerun-pipeline.ts <leadId>");
  process.exit(1);
}

db.lead.findUniqueOrThrow({ where: { id: leadId } })
  .then((lead) => (lead.type === "doctor" ? runDoctorPipeline(leadId) : runPipeline(leadId)))
  .then(() => {
    console.log("PIPELINE DONE OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error("PIPELINE FAILED:", e.message);
    process.exit(1);
  });
