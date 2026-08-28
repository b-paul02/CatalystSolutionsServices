import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatform("super_admin", "inventory_admin", "auditor");
  const sp = await searchParams;
  const where = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.type ? { leadType: sp.type } : {}),
  };
  const [byStatus, records] = await Promise.all([
    db.losInventoryRecord.groupBy({ by: ["status", "leadType"], _count: true }),
    db.losInventoryRecord.findMany({
      where, orderBy: { createdAt: "desc" }, take: 100,
      include: { dataset: { select: { name: true } } },
    }),
  ]);
  return (
    <div className="shell py-8">
      <h1 className="mb-4 text-2xl font-extrabold text-white">Inventory</h1>
      <div className="mb-5 flex flex-wrap gap-3">
        {byStatus.map((g) => (
          <a key={`${g.status}-${g.leadType}`} href={`?status=${g.status}&type=${g.leadType}`} className="card !p-3 hover:border-[var(--color-brand)]">
            <div className="text-[12px] uppercase text-[var(--color-muted)]">{g.leadType} · {g.status}</div>
            <div className="text-[22px] font-extrabold text-white">{g._count}</div>
          </a>
        ))}
        {byStatus.length === 0 && <p className="text-[var(--color-muted)]">No inventory yet — approve a dataset.</p>}
      </div>
      <div className="card !p-0">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]">
              <th className="px-4 py-2.5">Contact</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Geo</th>
              <th className="px-4 py-2.5">Dataset</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Alloc</th>
              <th className="px-4 py-2.5">Quality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-muted)]">
            {records.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.normalizedEmail ?? r.normalizedPhone}</td>
                <td className="px-4 py-2 uppercase">{r.leadType}</td>
                <td className="px-4 py-2">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-2">{r.dataset.name}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">{r.allocationCount}/{r.maxAllocations}</td>
                <td className="px-4 py-2">{r.qualityScore}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
