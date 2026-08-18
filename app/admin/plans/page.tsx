import Link from "next/link";
import { db } from "@/lib/audit/db";
import { parsePlanProgram } from "@/lib/customPresets";
import { setPlanStatus, deletePlan } from "./actions";
import CopyLink from "./CopyLink";

export const metadata = { title: "Custom Plans", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUSES = ["draft", "sent", "accepted", "expired"];
const statusColor: Record<string, string> = {
  draft: "text-[#93C5FD]",
  sent: "text-[#FCD34D]",
  accepted: "text-[#6EE7B7]",
  expired: "text-[var(--color-faint)]",
};

export default async function PlansPage() {
  const plans = await db.customPlan.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <section className="shell py-14">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-2 text-[28px] font-extrabold text-white">Custom Plans</h1>
          <p className="text-[13.5px] text-[var(--color-muted)]">Customer-specific pricing pages — share the link, the customer books from it.</p>
        </div>
        <Link href="/admin/plans/new" className="btn-primary px-5">New plan</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Market</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {plans.map((p) => {
              const program = parsePlanProgram(p.json);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-white">
                    {p.customerName}
                    {p.email && <span className="block text-[11.5px] font-normal text-[var(--color-faint)]">{p.email}</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {program?.name ?? "—"}
                    <span className="block text-[11.5px] text-[var(--color-faint)]">{program?.tiers.length ?? 0} tier{program?.tiers.length === 1 ? "" : "s"}</span>
                  </td>
                  <td className="px-4 py-3 uppercase text-[var(--color-muted)]">{p.market}</td>
                  <td className="px-4 py-3 text-[var(--color-faint)]">{p.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <form action={setPlanStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="status" defaultValue={p.status} className={`field w-[110px] px-2.5 py-1.5 text-[12.5px] font-semibold ${statusColor[p.status] ?? ""}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="btn-ghost px-3 py-1.5 text-[12px]">Save</button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CopyLink token={p.token} />
                      <a href={`/plans/${p.token}`} target="_blank" className="btn-ghost px-3 py-1.5 text-[12px]">View ↗</a>
                      <Link href={`/admin/plans/${p.id}`} className="btn-ghost px-3 py-1.5 text-[12px]">Edit</Link>
                      <form action={deletePlan}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-ghost px-3 py-1.5 text-[12px] text-[#FCA5A5]">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {plans.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-faint)]">No custom plans yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
