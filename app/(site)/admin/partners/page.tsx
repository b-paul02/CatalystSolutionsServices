import Link from "next/link";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { formatRate } from "@/lib/partner/money";
import { currentRate } from "@/lib/partner/rates";

export const metadata = { title: "Partners", robots: { index: false } };

export default async function PartnersList() {
  await staffPage("admin", "super_admin", "deal_desk", "finance");
  const partners = await db.partner.findMany({ orderBy: { createdAt: "desc" } });
  const rates = await Promise.all(partners.map((p) => currentRate(p.id)));

  return (
    <section className="shell py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white">Partners</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">{partners.length} partner{partners.length === 1 ? "" : "s"}.</p>
        </div>
        <Link href="/admin/partners/applications" className="text-[13.5px] text-[var(--color-muted)] hover:text-white">Applications →</Link>
      </div>

      {partners.length === 0 ? (
        <p className="card text-[14px] text-[var(--color-muted)]">
          No partners yet. Approve an application to create one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>{["Partner", "Status", "Markets", "Commission rate", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>))}</tr>
            </thead>
            <tbody>
              {partners.map((p, i) => (
                <tr key={p.id} className="border-t border-[var(--color-line)] hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{p.legalName}</div>
                    <div className="text-[12.5px] text-[var(--color-faint)]">{p.contactEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{p.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{(JSON.parse(p.markets) as string[]).join(", ")}</td>
                  <td className="px-4 py-3 font-semibold text-white">
                    {rates[i] ? formatRate(rates[i]!.rateBp) : <span className="text-amber-300">none in force</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/partners/${p.id}`} className="text-[var(--color-brand-soft)] hover:underline">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
