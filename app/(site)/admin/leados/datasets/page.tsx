import Link from "next/link";
import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import UploadDatasetForm from "./UploadDatasetForm";

export const metadata = { title: "Datasets" };

export default async function DatasetsPage() {
  await requirePlatform("super_admin", "inventory_admin", "compliance_admin", "auditor");
  const datasets = await db.losDataset.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { source: true, _count: { select: { records: true } } },
  });
  return (
    <div className="shell py-8">
      <h1 className="mb-6 text-2xl font-extrabold text-white">Lead datasets</h1>
      <UploadDatasetForm />
      <div className="mt-6 card !p-0">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]">
              <th className="px-4 py-2.5">Dataset</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Records</th>
              <th className="px-4 py-2.5">Exclusivity</th>
              <th className="px-4 py-2.5">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-muted)]">
            {datasets.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2">
                  <Link href={`/admin/leados/datasets/${d.id}`} className="text-[var(--color-brand-soft)] hover:text-white">{d.name}</Link>
                </td>
                <td className="px-4 py-2">{d.source.name}</td>
                <td className="px-4 py-2 uppercase">{d.leadType}</td>
                <td className="px-4 py-2">{d.status}</td>
                <td className="px-4 py-2">{d._count.records}</td>
                <td className="px-4 py-2">{d.exclusivity}{d.exclusivity === "shared" ? ` ×${d.maxShare}` : ""}</td>
                <td className="px-4 py-2">{d.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {datasets.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center">No datasets yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
