import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import SuppressionForm from "./SuppressionForm";

export const metadata = { title: "Suppression list" };

export default async function SuppressionsPage() {
  await requirePlatform("super_admin", "compliance_admin", "auditor");
  const entries = await db.losSuppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="shell py-8">
      <h1 className="mb-2 text-2xl font-extrabold text-white">Suppression list</h1>
      <p className="mb-6 max-w-[640px] text-[13.5px] text-[var(--color-muted)]">
        Suppressed contacts can never be allocated, contacted, or re-imported as B2C leads.
        Entries are stored as hashes — the raw contact is not kept here.
      </p>
      <SuppressionForm />
      <div className="mt-6 card !p-0">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]">
              <th className="px-4 py-2.5">Contact hash</th>
              <th className="px-4 py-2.5">Scope</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">Note</th>
              <th className="px-4 py-2.5">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-muted)]">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 font-mono text-[12px]">{e.contactHash.slice(0, 16)}…</td>
                <td className="px-4 py-2">{e.scope}</td>
                <td className="px-4 py-2">{e.reason}</td>
                <td className="px-4 py-2">{e.note ?? "—"}</td>
                <td className="px-4 py-2">{e.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center">Empty.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
