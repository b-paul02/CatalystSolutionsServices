import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { buildRow, fieldsForType } from "@/lib/leados/leads";
import { Badge, Card } from "@/components/leados/ui";
import MappingForm from "./MappingForm";
import CommitPanel from "./CommitPanel";

export const metadata = { title: "Import mapping" };

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOrg("leads.import");
  const { id } = await params;
  const imp = await db.losImport.findFirst({ where: { id, orgId: actor.orgId } });
  if (!imp) notFound();

  const headers = JSON.parse(imp.headers) as string[];
  const rows = JSON.parse(imp.rows) as string[][];
  const mapping = JSON.parse(imp.mapping ?? "{}") as Record<string, string>;
  const report = imp.report ? (JSON.parse(imp.report) as { accepted: number; duplicates: number; invalid: number; errors: { row: number; problem: string }[] }) : null;
  const lawfulUse = imp.lawfulUse ? (JSON.parse(imp.lawfulUse) as { purposes: string[]; channels: string[]; evidenceNote?: string; retentionDays?: number }) : null;

  // Preview stats from the current mapping (first 500 rows for speed).
  const sample = rows.slice(0, 500).map((r) => buildRow(headers, r, mapping));
  const usable = sample.filter((r) => r.normalizedEmail || r.normalizedPhone).length;

  return (
    <div className="max-w-[860px]">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/app/leads/import" className="text-[13px] text-[var(--los-muted)] hover:text-[var(--los-fg)]">← Imports</Link>
        <h1 className="text-[22px] font-extrabold tracking-tight">{imp.fileName}</h1>
        <Badge tone={imp.status === "done" ? "success" : imp.status === "failed" ? "danger" : "warn"}>{imp.status}</Badge>
        <Badge>{imp.leadType.toUpperCase()} · {rows.length} rows</Badge>
      </div>

      {report ? (
        <Card className="p-6">
          <h2 className="mb-3 text-[16px] font-bold">Import report</h2>
          <div className="mb-4 grid grid-cols-3 gap-4 text-center">
            <div><div className="text-[26px] font-extrabold text-[var(--los-success)]">{report.accepted}</div><div className="text-[12.5px] text-[var(--los-muted)]">accepted</div></div>
            <div><div className="text-[26px] font-extrabold text-[var(--los-warn)]">{report.duplicates}</div><div className="text-[12.5px] text-[var(--los-muted)]">duplicates skipped</div></div>
            <div><div className="text-[26px] font-extrabold text-[var(--los-danger)]">{report.invalid}</div><div className="text-[12.5px] text-[var(--los-muted)]">invalid</div></div>
          </div>
          {report.errors.length > 0 && (
            <div className="max-h-[220px] overflow-y-auto rounded-lg bg-[var(--los-surface-2)] p-3 text-[12.5px] text-[var(--los-muted)]">
              {report.errors.map((e, i) => <div key={i}>Row {e.row}: {e.problem}</div>)}
            </div>
          )}
          <Link href="/app/leads" className="mt-4 inline-block font-medium text-[var(--los-brand)]">View leads →</Link>
        </Card>
      ) : imp.status === "committing" ? (
        <CommitPanel importId={imp.id} committing />
      ) : (
        <div className="space-y-5">
          <MappingForm
            importId={imp.id}
            headers={headers}
            mapping={mapping}
            leadType={imp.leadType as "b2b" | "b2c"}
            fields={fieldsForType(imp.leadType as "b2b" | "b2c").map((f) => ({ key: f.key, label: f.label }))}
            sampleRow={rows[0] ?? []}
            lawfulUse={lawfulUse}
          />
          {imp.status === "previewed" && (
            <Card className="p-5">
              <h2 className="mb-2 text-[15px] font-bold">Preview</h2>
              <p className="mb-3 text-[13.5px] text-[var(--los-muted)]">
                Of the first {sample.length} rows, <strong>{usable}</strong> have a usable email or phone.
                Duplicates are detected against your existing leads at commit time.
              </p>
              <CommitPanel importId={imp.id} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
