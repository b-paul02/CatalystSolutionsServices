import Link from "next/link";
import { db } from "@/lib/audit/db";
import { setSalesStatus } from "./actions";

export const metadata = { title: "Leads", robots: { index: false } };
export const dynamic = "force-dynamic";

const SALES_STATUSES = [
  { value: "cold", label: "Cold" },
  { value: "hot", label: "Hot" },
  { value: "in_pipeline", label: "In pipeline" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
];

const salesColor: Record<string, string> = {
  cold: "text-[#93C5FD]",
  hot: "text-[#FCA5A5]",
  in_pipeline: "text-[#FCD34D]",
  converted: "text-[#6EE7B7]",
  rejected: "text-[var(--color-faint)]",
};

export default async function LeadsPage() {
  const leads = await db.lead.findMany({
    include: { report: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <section className="shell py-14">
      <h1 className="mb-2 text-[28px] font-extrabold text-white">Leads</h1>
      <p className="mb-8 text-[13.5px] text-[var(--color-muted)]">{leads.length} lead{leads.length === 1 ? "" : "s"} · every intake is captured here with its audit report</p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Website</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">G1</th>
              <th className="px-4 py-3 font-semibold">Audit report</th>
              <th className="px-4 py-3 font-semibold">Sales status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium text-white">{l.email}</td>
                <td className="px-4 py-3 text-[var(--color-muted)]">{l.url ? l.url.replace(/^https?:\/\//, "") : <span className="italic text-[var(--color-faint)]">no website</span>}</td>
                <td className="px-4 py-3 text-[var(--color-faint)]">{l.createdAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3">{l.g1Score ?? "—"} <span className="text-[11px] text-[var(--color-faint)]">{l.tag ?? ""}</span></td>
                <td className="px-4 py-3">
                  {l.report ? (
                    <span className="flex flex-col gap-0.5">
                      <Link href={`/admin/reviews/${l.id}`} className="font-medium text-[var(--color-brand-soft)] hover:text-white">
                        {l.report.status === "approved" ? "Approved" : l.report.status === "pending" ? "Awaiting review" : l.report.status}
                      </Link>
                      {l.report.status === "approved" && (
                        <a href={`/growth-audit/report/${l.report.token}`} target="_blank" className="text-[11.5px] text-[var(--color-faint)] hover:text-white">public link ↗</a>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--color-faint)]">{l.status}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <form action={setSalesStatus} className="flex items-center gap-2">
                    <input type="hidden" name="leadId" value={l.id} />
                    <select name="salesStatus" defaultValue={l.salesStatus} className={`field w-[130px] px-2.5 py-1.5 text-[12.5px] font-semibold ${salesColor[l.salesStatus] ?? ""}`}>
                      {SALES_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <button className="btn-ghost px-3 py-1.5 text-[12px]">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
