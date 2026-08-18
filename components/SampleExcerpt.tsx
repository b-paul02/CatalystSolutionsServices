import Link from "next/link";
import Icon from "@/components/Icon";
import type { SampleDoc } from "@/lib/proof";

// Shows the opening of a sample deliverable inline — enough to prove the quality,
// not so much that it buries the pricing above it. Full doc lives on its own page.
export default function SampleExcerpt({ doc }: { doc: SampleDoc }) {
  const kpis = doc.blocks.find((b) => b.kind === "kpis");
  const table = doc.blocks.find((b) => b.kind === "table");

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.75),rgba(12,11,22,0.75))]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-6 py-4">
        <span className="icon-chip h-[42px] w-[42px] text-[22px]"><Icon name={doc.icon} /></span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white">{doc.title}</div>
          <div className="text-[12px] text-[var(--color-faint)]">{doc.brand} · {doc.type}</div>
        </div>
        <Link href={`/proof/samples/${doc.slug}`} className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)] hover:text-white">
          Read the full sample <Icon name="arrow_forward" className="text-[15px]" />
        </Link>
      </div>

      <div className="px-6 py-5">
        {kpis?.kind === "kpis" && (
          <>
            {kpis.title && <div className="mb-3 text-[13px] font-semibold text-white">{kpis.title}</div>}
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.items.map((k) => (
                <div key={k.label} className="rounded-xl border border-[var(--color-line)] bg-white/[0.03] p-4">
                  <div className="text-[19px] font-extrabold text-white">{k.value}</div>
                  {k.delta && <div className="text-[12px] font-semibold text-[#6EE7B7]">{k.delta}</div>}
                  <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--color-faint)]">{k.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {table?.kind === "table" && (
          <>
            {table.title && <div className="mb-3 text-[13px] font-semibold text-white">{table.title}</div>}
            <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
              <table className="w-full min-w-[460px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-white/[0.03]">
                    {table.head.map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, 4).map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.04] last:border-0">
                      {r.map((c, j) => (
                        <td key={j} className={`px-4 py-2.5 ${j === 0 ? "font-medium text-white" : c.startsWith("▲") ? "font-semibold text-[#6EE7B7]" : "text-[var(--color-muted)]"}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mt-4 text-[12.5px] text-[var(--color-faint)]">
          <Icon name="more_horiz" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
          This is the first page.{" "}
          <Link href={`/proof/samples/${doc.slug}`} className="font-semibold text-[var(--color-brand-soft)] hover:text-white">
            See the whole report
          </Link>{" "}
          — including what we did, and what we're doing next.
        </p>
      </div>
    </div>
  );
}
