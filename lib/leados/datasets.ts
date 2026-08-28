// Dataset → inventory materialization (runs at approval).
import { db } from "@/lib/audit/db";
import { buildRow } from "./leads";
import { contactHashes, isSuppressed } from "./suppression";

export async function materializeDataset(datasetId: string): Promise<{ created: number; skipped: number }> {
  const ds = await db.losDataset.findUnique({ where: { id: datasetId } });
  if (!ds) throw new Error("Dataset not found.");
  const headers = JSON.parse(ds.headers) as string[];
  const rows = JSON.parse(ds.rows) as string[][];
  const mapping = JSON.parse(ds.mapping ?? "{}") as Record<string, string>;
  const expiresAt = ds.expiryDays ? new Date(Date.now() + ds.expiryDays * 86_400_000) : null;

  let created = 0, skipped = 0;
  const seen = new Set<string>();
  const batch: {
    datasetId: string; leadType: string; fields: string;
    normalizedEmail: string | null; normalizedPhone: string | null;
    city: string | null; state: string | null; country: string | null;
    maxAllocations: number; expiresAt: Date | null; demo: boolean;
  }[] = [];
  for (const row of rows) {
    const parsed = buildRow(headers, row, mapping);
    if (!parsed.normalizedEmail && !parsed.normalizedPhone) { skipped++; continue; }
    const key = parsed.normalizedEmail ?? parsed.normalizedPhone!;
    if (seen.has(key)) { skipped++; continue; } // in-file dedupe
    seen.add(key);
    if (ds.leadType === "b2c" && (await isSuppressed(contactHashes(parsed.normalizedEmail, parsed.normalizedPhone)))) {
      skipped++; continue;
    }
    batch.push({
      datasetId: ds.id,
      leadType: ds.leadType,
      fields: JSON.stringify(parsed.fields),
      normalizedEmail: parsed.normalizedEmail,
      normalizedPhone: parsed.normalizedPhone,
      city: parsed.fields.city ?? null,
      state: parsed.fields.state ?? null,
      country: parsed.fields.country ?? null,
      maxAllocations: ds.exclusivity === "shared" ? ds.maxShare : 1,
      expiresAt,
      demo: ds.demo,
    });
  }
  if (batch.length > 0) {
    await db.losInventoryRecord.createMany({ data: batch });
    created = batch.length;
  }
  await db.losDataset.update({
    where: { id: ds.id },
    data: { status: "approved", report: JSON.stringify({ created, skipped }) },
  });
  return { created, skipped };
}
