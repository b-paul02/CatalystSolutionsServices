import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { fieldsForType } from "@/lib/leados/leads";
import DatasetDetail from "./DatasetDetail";

export const metadata = { title: "Dataset" };

export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform("super_admin", "inventory_admin", "compliance_admin", "auditor");
  const { id } = await params;
  const ds = await db.losDataset.findUnique({
    where: { id },
    include: { source: true, _count: { select: { records: true } } },
  });
  if (!ds) notFound();
  const headers = JSON.parse(ds.headers) as string[];
  const rows = JSON.parse(ds.rows) as string[][];
  return (
    <div className="shell py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/leados/datasets" className="text-[13px] text-[var(--color-muted)] hover:text-white">← Datasets</Link>
        <h1 className="text-2xl font-extrabold text-white">{ds.name}</h1>
        <span className="text-[13px] text-[var(--color-muted)]">
          {ds.source.name} · {ds.leadType.toUpperCase()} · {rows.length} rows · {ds.status} · {ds._count.records} inventory records
        </span>
      </div>
      <DatasetDetail
        dataset={{
          id: ds.id, status: ds.status, leadType: ds.leadType as "b2b" | "b2c",
          headers, sampleRow: rows[0] ?? [],
          mapping: JSON.parse(ds.mapping ?? "{}"),
          lawfulUse: ds.lawfulUse, report: ds.report,
        }}
        fields={fieldsForType(ds.leadType as "b2b" | "b2c").map((f) => ({ key: f.key, label: f.label }))}
      />
    </div>
  );
}
