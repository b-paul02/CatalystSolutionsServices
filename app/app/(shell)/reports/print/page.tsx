import { requireModule } from "@/lib/os/guard";
import { db } from "@/lib/audit/db";
import { monthlyReport } from "@/lib/os/reports";

export const metadata = { title: "Monthly report" };

// WP-28 · print-styled monthly report grouped by growth pillar. CSS @page; the browser prints it (no PDF generation).
export default async function PrintReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { actor, ent } = await requireModule("results", "reports.view", "work.view");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const [org, r] = await Promise.all([db.losOrg.findUnique({ where: { id: actor.orgId }, select: { name: true } }), monthlyReport(actor.orgId, month, ent.timezone, ent.demo)]);
  return (
    <div className="mx-auto max-w-[800px] bg-white p-6 text-[13px] text-black print:p-0">
      <style>{`@page { size: A4; margin: 18mm; } @media print { aside, nav, header, .no-print { display: none !important; } main { padding: 0 !important; } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between rounded-lg border border-[var(--los-line)] px-3 py-2 text-[12.5px]"><span>Monthly report · print-ready. Use your browser&apos;s Print for a paper copy.</span><a className="underline" href="/app/results">Back to Results</a></div>
      <h1 className="text-[24px] font-extrabold">{org?.name} — {month}</h1>
      <p className="mb-5 text-[12px] text-gray-600">Prepared by CatalystGrowthOS{ent.demo ? " · DEMO workspace: figures are synthetic" : ""}. Grouped by growth pillar.</p>
      {r.sections.map((s) => (
        <section key={s.pillar} className="mb-5 break-inside-avoid">
          <h2 className="mb-1 border-b border-gray-300 pb-1 text-[16px] font-bold">{s.label}</h2>
          {s.goals.length > 0 && <ul className="mb-2 text-[12.5px]">{s.goals.map((g) => <li key={g.metric}><b>Goal:</b> {g.metric} → {g.target} {g.unit} · now {g.current === null ? "not available" : `${g.current} (${g.label})`}</li>)}</ul>}
          <table className="w-full text-left"><tbody>{s.facts.map((f, i) => <tr key={i} className="border-t border-gray-200"><td className="py-1 pr-2">{f.label}</td><td className="py-1 text-right font-semibold">{f.value === null || f.value === undefined ? <span className="font-normal text-gray-500">not available</span> : f.value}</td><td className="py-1 pl-3 text-[11.5px] text-gray-500">{f.note ?? ""}</td></tr>)}</tbody></table>
          {s.facts.length === 0 && s.goals.length === 0 && <p className="text-[12px] text-gray-500">Nothing measured in this pillar this month.</p>}
        </section>
      ))}
      <p className="mt-6 text-[11.5px] text-gray-600">{r.limitations.join(" ")}</p>
    </div>
  );
}
