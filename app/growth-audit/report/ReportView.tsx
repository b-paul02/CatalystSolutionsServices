import Icon from "@/components/Icon";
import type { ReportJSON, Route } from "@/lib/audit/report-types";
import type { Scorecard } from "@/lib/audit/scorecard";

const effortColor: Record<string, string> = {
  Low: "text-[#6EE7B7] border-[rgba(110,231,183,0.3)] bg-[rgba(110,231,183,0.08)]",
  Medium: "text-[#FCD34D] border-[rgba(252,211,77,0.3)] bg-[rgba(252,211,77,0.08)]",
  High: "text-[#FCA5A5] border-[rgba(252,165,165,0.3)] bg-[rgba(252,165,165,0.08)]",
};

const scoreColor = (n: number) => (n >= 75 ? "#6EE7B7" : n >= 45 ? "#FCD34D" : "#FCA5A5");

// Renders **bold** and *italic* from ICP bodies without a markdown dep.
function Rich({ text }: { text: string }) {
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong class='text-white'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Gauge({ score }: { score: number }) {
  const r = 54, c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36" role="img" aria-label={`Growth readiness score ${score} out of 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="60" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="800">{score}</text>
      <text x="64" y="82" textAnchor="middle" fill="#8b8b9a" fontSize="11">/ 100</text>
    </svg>
  );
}

function ScorecardHero({ sc }: { sc: Scorecard }) {
  return (
    <section className="card mb-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        <div className="shrink-0 text-center">
          <Gauge score={sc.overall} />
          <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Growth readiness</div>
        </div>
        <div className="w-full">
          <p className="mb-4 text-[15.5px] font-semibold leading-[1.5] text-white">{sc.verdict}</p>
          <div className="grid gap-2.5">
            {sc.subscores.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-[150px] shrink-0 text-[12.5px] text-[var(--color-muted)]">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, s.score)}%`, background: scoreColor(s.score) }} />
                </div>
                <span className="w-8 text-right text-[12.5px] font-bold" style={{ color: scoreColor(s.score) }}>{s.score}</span>
              </div>
            ))}
          </div>
          {sc.pagespeed && (
            <p className="mt-3 text-[11.5px] text-[var(--color-faint)]">
              Mobile speed measured by Google PageSpeed: {sc.pagespeed.performanceScore}/100
              {sc.pagespeed.lcpSeconds ? ` · largest content loads in ${sc.pagespeed.lcpSeconds}s` : ""}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ChecksTable({ sc }: { sc: Scorecard }) {
  return (
    <section className="card mb-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white">
        <Icon name="checklist" className="text-[22px] text-[var(--color-brand-soft)]" />What we checked
      </h2>
      <div className="grid gap-0 divide-y divide-white/5">
        {sc.checks.map((c) => (
          <div key={c.label} className="flex items-start gap-3 py-2.5">
            <Icon name={c.pass ? "check_circle" : "cancel"} className={`mt-0.5 text-[19px] ${c.pass ? "text-[#6EE7B7]" : "text-[#FCA5A5]"}`} />
            <div>
              <span className="text-[14px] font-medium text-[var(--color-fg)]">{c.label}</span>
              {c.detail && <span className="ml-2 text-[12.5px] text-[var(--color-faint)]">{c.detail}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RouteComparison({ routes }: { routes: Route[] }) {
  const hasWeeks = routes.every((r) => r.timeline_weeks?.max);
  const maxWeek = hasWeeks ? Math.max(12, ...routes.map((r) => r.timeline_weeks.max)) : 0;
  return (
    <div className="card mb-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead>
          <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
            <th className="pb-3 pr-4 font-semibold">Route</th>
            <th className="pb-3 pr-4 font-semibold">Effort</th>
            <th className="pb-3 pr-4 font-semibold">DIY-able</th>
            {hasWeeks && <th className="pb-3 font-semibold">Timeline (weeks, padded)</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {routes.map((r) => (
            <tr key={r.name}>
              <td className="py-3 pr-4 font-semibold text-white">{r.name}</td>
              <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${effortColor[r.effort] ?? effortColor.Medium}`}>{r.effort}</span></td>
              <td className="py-3 pr-4">{r.diyable ? <Icon name="check_circle" className="text-[17px] text-[#6EE7B7]" /> : <span className="text-[var(--color-faint)]">—</span>}</td>
              {hasWeeks && (
                <td className="py-3">
                  <div className="relative h-3 w-full max-w-[220px] rounded-full bg-white/5">
                    <div className="absolute h-3 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7]"
                      style={{ left: `${(r.timeline_weeks.min / maxWeek) * 100}%`, width: `${Math.max(6, ((r.timeline_weeks.max - r.timeline_weeks.min) / maxWeek) * 100)}%` }} />
                  </div>
                  <span className="mt-1 block text-[11px] text-[var(--color-faint)]">{r.timeline_weeks.min}–{r.timeline_weeks.max} wks</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportView({ report, bookingHref = "/contact" }: { report: ReportJSON; bookingHref?: string }) {
  const h2 = "mb-5 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white";
  const sc = report.scorecard ?? null;
  return (
    <div className="mx-auto max-w-[780px]">
      {sc && <ScorecardHero sc={sc} />}

      {report.key_points?.length > 0 && (
        <section className="mb-6 rounded-2xl border border-[rgba(168,85,247,0.35)] bg-[rgba(124,58,237,0.1)] p-6">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">If you only read one thing</h2>
          <ul className="grid gap-2">
            {report.key_points.map((k, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14.5px] font-medium leading-[1.55] text-white">
                <Icon name="arrow_forward" className="mt-0.5 text-[16px] text-[var(--color-brand-soft)]" />{k}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-6">
        <h2 className={h2}><Icon name="visibility" className="text-[22px] text-[var(--color-brand-soft)]" />What we understood</h2>
        <p className="text-[15px] leading-[1.7] text-[var(--color-fg)]">{report.snapshot}</p>
      </section>

      {sc && <ChecksTable sc={sc} />}

      <section className="card mb-6">
        <h2 className={h2}><Icon name="search_insights" className="text-[22px] text-[var(--color-brand-soft)]" />What we found</h2>
        <div className="grid gap-5">
          {report.findings.map((f, i) => (
            <div key={i} className={`border-l-2 pl-4 ${f.severity === "high" ? "border-[rgba(252,165,165,0.5)]" : "border-[rgba(252,211,77,0.45)]"}`}>
              <span className={`mb-1.5 inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] ${
                f.severity === "high" ? effortColor.High : effortColor.Medium}`}>
                {f.severity === "high" ? "High impact" : "Medium impact"}
              </span>
              <p className="text-[14.5px] leading-[1.65] text-[var(--color-fg)]">{f.text}</p>
              {f.stat && (
                <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] leading-[1.5] text-[var(--color-brand-soft)]">
                  <Icon name="query_stats" className="mr-1.5 align-[-3px] text-[15px]" />{f.stat.text}
                  <span className="ml-1.5 text-[11px] text-[var(--color-faint)]">({f.stat.source})</span>
                </p>
              )}
              <p className="mt-1.5 text-[12px] italic text-[var(--color-faint)]">Source: {f.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-6">
        <h2 className={h2}><Icon name="groups" className="text-[22px] text-[var(--color-brand-soft)]" />Who you should be targeting</h2>
        <div className="grid gap-3">
          {report.icps.map((s, i) => (
            <details key={s.name} open={i === 0} className="group rounded-xl border border-[var(--color-line)] bg-white/[0.02] p-4">
              <summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-white">
                {s.name}
                <Icon name="expand_more" className="text-[20px] text-[var(--color-faint)] transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-[14px] leading-[1.7] text-[var(--color-muted)]"><Rich text={s.body} /></p>
            </details>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className={`${h2} px-1`}><Icon name="alt_route" className="text-[22px] text-[var(--color-brand-soft)]" />Possible routes</h2>
        <RouteComparison routes={report.routes} />
        <div className="grid gap-4">
          {report.routes.map((r) => (
            <div key={r.name} className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16.5px] font-semibold text-white">{r.name}</h3>
                <div className="flex gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${effortColor[r.effort] ?? effortColor.Medium}`}>{r.effort} effort</span>
                  {r.diyable && <span className="rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.1)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--color-brand-soft)]">Partly DIY-able</span>}
                </div>
              </div>
              <p className="mb-3 text-[14px] leading-[1.65] text-[var(--color-fg)]">{r.involves}</p>
              <div className="grid gap-2.5 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
                {r.best_if && <p><span className="font-semibold text-[var(--color-brand-soft)]">Best if: </span>{r.best_if}</p>}
                <p><span className="font-semibold text-[var(--color-brand-soft)]">Realistic milestones: </span>{r.milestones}</p>
                <p><span className="font-semibold text-[var(--color-brand-soft)]">If you do nothing: </span>{r.if_nothing}</p>
                <p><span className="font-semibold text-[var(--color-brand-soft)]">Trade-offs: </span>{r.tradeoffs}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-6">
        <h2 className={h2}><Icon name="bolt" className="text-[22px] text-[var(--color-brand-soft)]" />Quick wins — inside 30 days, any route</h2>
        <ol className="grid gap-2.5">
          {report.quick_wins.map((w, i) => (
            <li key={i} className="flex items-start gap-3 text-[14.5px] leading-[1.6] text-[var(--color-fg)]">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(124,58,237,0.2)] text-[12px] font-bold text-[var(--color-brand-soft)]">{i + 1}</span>{w}
            </li>
          ))}
        </ol>
      </section>

      {report.assumptions?.length > 0 && (
        <section className="card mb-10">
          <h2 className={h2}><Icon name="fact_check" className="text-[22px] text-[var(--color-brand-soft)]" />Assumptions we made</h2>
          <ul className="grid gap-2 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
            {report.assumptions.map((a, i) => <li key={i} className="flex gap-2"><span className="text-[var(--color-brand-soft)]">·</span>{a}</li>)}
          </ul>
        </section>
      )}

      <section className="mb-4 text-center print:hidden">
        <p className="mb-5 text-[15.5px] leading-[1.6] text-[var(--color-fg)]">{report.cta}</p>
        <a href={bookingHref} className="btn-primary">Book a free 30-minute session <Icon name="arrow_forward" className="text-[19px]" /></a>
      </section>
    </div>
  );
}
