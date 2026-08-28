// Import commit runs in the job queue: rows → createLead → report.
// Idempotent: guarded by the import row's status transition.
import { db } from "@/lib/audit/db";
import { buildRow } from "./leads";
import { createLead, type LawfulUse, type LeadInput } from "./leadWrite";
import { registerJobHandler } from "./jobs";
import { logLosAudit } from "./audit";

export const IMPORT_JOB = "leados:import-commit";

export async function runImportCommit(payload: unknown): Promise<void> {
  const { importId } = payload as { importId: string };
  // Claim: only one worker may move previewed → committing.
  const claimed = await db.losImport.updateMany({
    where: { id: importId, status: "previewed" },
    data: { status: "committing" },
  });
  if (claimed.count === 0) return; // already done or being done

  const imp = await db.losImport.findUnique({ where: { id: importId } });
  if (!imp) return;
  const headers = JSON.parse(imp.headers) as string[];
  const rows = JSON.parse(imp.rows) as string[][];
  const mapping = JSON.parse(imp.mapping ?? "{}") as Record<string, string>;
  const lawfulUse = imp.lawfulUse ? (JSON.parse(imp.lawfulUse) as LawfulUse) : undefined;

  let accepted = 0, duplicates = 0, invalid = 0;
  const errors: { row: number; problem: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = buildRow(headers, rows[i], mapping);
    const result = await createLead({
      orgId: imp.orgId,
      leadType: imp.leadType as "b2b" | "b2c",
      input: parsed.fields as LeadInput,
      source: "import",
      sourceRef: imp.id,
      lawfulUse,
      demo: imp.demo,
      rawForProvenance: Object.fromEntries(headers.map((h, j) => [h, rows[i][j] ?? ""])),
    });
    if (result.outcome === "created") accepted++;
    else if (result.outcome === "duplicate") duplicates++;
    else {
      invalid++;
      if (errors.length < 100) errors.push({ row: i + 2, problem: result.problem }); // +2: 1-based + header row
    }
  }

  await db.losImport.update({
    where: { id: importId },
    data: { status: "done", report: JSON.stringify({ accepted, duplicates, invalid, errors }) },
  });
  await logLosAudit({
    orgId: imp.orgId, actorUserId: imp.createdById, actorType: "system",
    action: "leads.import_committed", entity: "LosImport", entityId: imp.id,
    data: { accepted, duplicates, invalid },
  });
}

registerJobHandler(IMPORT_JOB, runImportCommit);
