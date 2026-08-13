import Icon from "@/components/Icon";
import type { ReportJSON, Route } from "@/lib/audit/report-types";
import type { Scorecard, Check } from "@/lib/audit/scorecard";
import type { CompetitorsResult } from "@/lib/audit/competitors";

export type ReportMeta = {
  url?: string;
  date?: string; // audit/approval date, ISO
  version?: number;
  reviewer?: string | null;
};

const effortColor: Record<string, string> = {
  Low: "text-[#6EE7B7] border-[rgba(110,231,183,0.3)] bg-[rgba(110,231,183,0.08)]",
  Medium: "text-[#FCD34D] border-[rgba(252,211,77,0.3)] bg-[rgba(252,211,77,0.08)]",
  High: "text-[#FCA5A5] border-[rgba(252,165,165,0.3)] bg-[rgba(252,165,165,0.08)]",
};

const scoreColor = (n: number) => (n >= 75 ? "#6EE7B7" : n >= 45 ? "#FCD34D" : "#FCA5A5");

const verificationBadge: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "text-[#6EE7B7] bg-[rgba(110,231,183,0.1)]" },
  detected: { label: "Detected", cls: "text-[#FCD34D] bg-[rgba(252,211,77,0.1)]" },
  assumed: { label: "Assumed", cls: "text-[var(--color-faint)] bg-white/5" },
};

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

function CoverBlock({ report, meta }: { report: ReportJSON; meta: ReportMeta }) {
  return (
    <section className="card mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-soft)]">Digital Growth Snapshot</div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-white">{report.business_name}</h2>
          {meta.url && <div className="mt-0.5 text-[13px] text-[var(--color-muted)]">{meta.url.replace(/^https?:\/\//, "")}</div>}
        </div>
        <div className="text-right text-[12.5px] leading-[1.7] text-[var(--color-faint)]">
          {meta.date && <div>Audit date: <span className="text-[var(--color-fg)]">{meta.date.slice(0, 10)}</span></div>}
          {meta.version !== undefined && <div>Report version: <span className="text-[var(--color-fg)]">v{meta.version}</span></div>}
          <div>Prepared by <span className="text-[var(--color-fg)]">Catalyst Solutions Services</span></div>
          {meta.reviewer && <div>Reviewed by <span className="text-[var(--color-fg)]">{meta.reviewer}</span></div>}
        </div>
      </div>
      <p className="border-t border-white/5 pt-3 text-[11.5px] leading-[1.5] text-[var(--color-faint)]">
        Prepared for the business named above. Findings reflect what was publicly observable and what you told us on the audit date — see the methodology section at the end for scope and limitations.
      </p>
    </section>
  );
}

export function ScorecardHero({ sc }: { sc: Scorecard }) {
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
                <span className="w-[160px] shrink-0 text-[12.5px] text-[var(--color-muted)]">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, s.score)}%`, background: scoreColor(s.score) }} />
                </div>
                <span className="w-8 text-right text-[12.5px] font-bold" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                <span className="w-[86px] text-right text-[10.5px] uppercase tracking-[0.04em] text-[var(--color-faint)]">{s.confidence} confidence</span>
              </div>
            ))}
          </div>
          {sc.pagespeed && (
            <p className="mt-3 text-[11.5px] text-[var(--color-faint)]">
              Mobile speed measured by Google PageSpeed on {sc.checkedAt}: {sc.pagespeed.performanceScore}/100
              {sc.pagespeed.lcpSeconds ? ` · largest content loads in ${sc.pagespeed.lcpSeconds}s` : ""}
              {sc.pagespeed.inpMs ? ` · real-user responsiveness ${sc.pagespeed.inpMs}ms` : ""}
            </p>
          )}
          <p className="mt-2 text-[11px] text-[var(--color-faint)]">
            Scores are computed from {sc.checks.length} automated checks. A pillar only reaches 100 when every check is independently verified — &quot;detected&quot; signals earn partial credit.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ChecksTable({ sc }: { sc: Scorecard }) {
  const pillars = sc.subscores.map((s) => ({ key: s.key, label: s.label, checks: sc.checks.filter((c) => c.pillar === s.key) }));
  return (
    <section className="card mb-6">
      <h2 className="mb-1 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white">
        <Icon name="checklist" className="text-[22px] text-[var(--color-brand-soft)]" />What we checked
      </h2>
      <p className="mb-4 text-[12.5px] text-[var(--color-faint)]">{sc.checks.length} automated checks, run {sc.checkedAt}. &quot;Detected&quot; means a signal was found but not proven to be working; &quot;Assumed&quot; means we could not verify it without account access.</p>
      <div className="grid gap-5">
        {pillars.map((p) => (
          <div key={p.key}>
            <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-soft)]">{p.label}</h3>
            <div className="grid divide-y divide-white/5">
              {p.checks.map((c: Check) => (
                <div key={c.label} className="flex items-start gap-3 py-2">
                  <Icon name={c.pass ? "check_circle" : "cancel"} className={`mt-0.5 text-[18px] ${c.pass ? "text-[#6EE7B7]" : "text-[#FCA5A5]"}`} />
                  <div className="flex-1">
                    <span className="text-[13.5px] font-medium text-[var(--color-fg)]">{c.label}</span>
                    {c.detail && <span className="ml-2 text-[12px] text-[var(--color-faint)]">{c.detail}</span>}
                  </div>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${verificationBadge[c.verification].cls}`}>
                    {verificationBadge[c.verification].label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Methodology({ sc, meta, report }: { sc: Scorecard | null; meta: ReportMeta; report: ReportJSON }) {
  return (
    <section className="card mb-10 print:break-before-page">
      <h2 className="mb-4 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white">
        <Icon name="science" className="text-[22px] text-[var(--color-brand-soft)]" />Methodology &amp; limitations
      </h2>
      <div className="grid gap-3 text-[13px] leading-[1.65] text-[var(--color-muted)]">
        {sc ? (
          <>
            <p><span className="font-semibold text-[var(--color-fg)]">What we reviewed.</span> {sc.pagesReviewed.length} publicly accessible page{sc.pagesReviewed.length === 1 ? "" : "s"} ({sc.pagesReviewed.join(", ")}) on {sc.checkedAt}, plus your intake answers{sc.pagespeed ? ", plus Google PageSpeed field and lab data" : ""}.</p>
            <p><span className="font-semibold text-[var(--color-fg)]">How scores work.</span> {sc.checks.length} automated checks grouped into {sc.subscores.length} pillars. Independently verified checks earn full credit; signals we detected but could not prove working earn 70%; assumptions earn half. No pillar reaches 100 unless everything in it is verified. Each pillar shows a confidence level based on how much of it we could verify.</p>
            <p><span className="font-semibold text-[var(--color-fg)]">What we could not verify.</span> Anything requiring account access: analytics configuration and conversion events, Search Console data, ad account performance, actual enquiry volumes. Where these matter, the report says so rather than guessing. Statistics cited come from named published studies; none are generated.</p>
          </>
        ) : (
          <p><span className="font-semibold text-[var(--color-fg)]">What we reviewed.</span> This business has no website yet, so the analysis is built from the intake answers{meta.date ? ` provided on ${meta.date.slice(0, 10)}` : ""} and any online presence links shared. No automated site checks were possible; recommendations therefore focus on foundations.</p>
        )}
        {report.competitor_data && report.competitor_data.competitors.length >= 2 && (
          <p><span className="font-semibold text-[var(--color-fg)]">Competitor comparison.</span> Competitors were {report.competitor_data.source === "client" ? "named by you and supplemented by web research" : report.competitor_data.source === "grounded" ? "identified through live web search for your category" : "identified from industry knowledge"}, then each candidate&apos;s website was visited, its relevance confirmed from its actual content, and the same automated check battery run on it. Of {report.competitor_data.candidatesConsidered} candidates considered, {report.competitor_data.competitors.length} passed verification. Competitor traffic, search rankings, and revenue were not measured — comparisons are limited to what is publicly checkable.</p>
        )}
      </div>
    </section>
  );
}

const HEADLINE_CHECKS = [
  "Blog or content section",
  "Structured data (JSON-LD) present",
  "Analytics script installed",
  "Online booking / scheduling link",
  "Meta description on homepage",
  "Exactly one H1 on homepage",
  "Images have alt text",
  "XML sitemap found",
];

function CompetitorComparison({ report, clientName }: { report: ReportJSON; clientName: string }) {
  const data = report.competitor_data as CompetitorsResult | null | undefined;
  if (!data || data.competitors.length < 2) return null;
  const cols = [{ name: clientName, sc: report.scorecard ?? null, isClient: true }, ...data.competitors.map((c) => ({ name: c.name, sc: c.scorecard, isClient: false }))];
  const has = (sc: Scorecard | null, label: string) => sc?.checks.find((c) => c.label === label);
  return (
    <section className="mb-6">
      <h2 className="mb-5 flex items-center gap-2.5 px-1 text-[21px] font-bold tracking-[-0.01em] text-white">
        <Icon name="compare_arrows" className="text-[22px] text-[var(--color-brand-soft)]" />How you compare
      </h2>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {data.competitors.map((c) => (
          <div key={c.url} className="card p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-white">{c.name}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] ${
                c.type === "direct" ? "border-[rgba(252,165,165,0.3)] bg-[rgba(252,165,165,0.08)] text-[#FCA5A5]" : "border-[rgba(252,211,77,0.3)] bg-[rgba(252,211,77,0.08)] text-[#FCD34D]"}`}>
                {c.type}
              </span>
            </div>
            <p className="text-[12px] leading-[1.5] text-[var(--color-faint)]">{c.why}</p>
          </div>
        ))}
      </div>

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <th className="pb-3 pr-3 font-semibold">Check</th>
              {cols.map((c) => (
                <th key={c.name} className={`pb-3 pr-3 font-semibold ${c.isClient ? "text-[var(--color-brand-soft)]" : ""}`}>{c.isClient ? `${c.name} (you)` : c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr>
              <td className="py-2.5 pr-3 font-semibold text-white">Growth readiness score</td>
              {cols.map((c) => (
                <td key={c.name} className="py-2.5 pr-3 text-[13px] font-bold" style={{ color: c.sc ? scoreColor(c.sc.overall) : undefined }}>
                  {c.sc ? `${c.sc.overall}/100` : "—"}
                </td>
              ))}
            </tr>
            {HEADLINE_CHECKS.map((label) => {
              const row = cols.map((c) => has(c.sc, label));
              if (row.every((r) => !r)) return null;
              return (
                <tr key={label}>
                  <td className="py-2.5 pr-3 text-[var(--color-fg)]">{label}</td>
                  {row.map((r, i) => (
                    <td key={i} className="py-2.5 pr-3">
                      {r ? <Icon name={r.pass ? "check_circle" : "cancel"} className={`text-[17px] ${r.pass ? "text-[#6EE7B7]" : "text-[#FCA5A5]"}`} /> : <span className="text-[var(--color-faint)]">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-[var(--color-faint)]">Same automated check battery run on every site. Traffic, rankings, and revenue were not measured — see methodology.</p>
      </div>

      {report.comparison && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="mb-3 text-[14px] font-bold text-[#FCA5A5]">Where you lag</h3>
            <ul className="grid gap-2 text-[13.5px] leading-[1.6] text-[var(--color-fg)]">
              {report.comparison.where_you_lag.map((x, i) => <li key={i} className="flex gap-2"><Icon name="trending_down" className="mt-0.5 shrink-0 text-[16px] text-[#FCA5A5]" />{x}</li>)}
            </ul>
          </div>
          <div className="card">
            <h3 className="mb-3 text-[14px] font-bold text-[#6EE7B7]">Where you lead</h3>
            <ul className="grid gap-2 text-[13.5px] leading-[1.6] text-[var(--color-fg)]">
              {report.comparison.where_you_lead.map((x, i) => <li key={i} className="flex gap-2"><Icon name="trending_up" className="mt-0.5 shrink-0 text-[16px] text-[#6EE7B7]" />{x}</li>)}
            </ul>
          </div>
        </div>
      )}
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

export default function ReportView({ report, bookingHref = "/contact", meta = {} }: { report: ReportJSON; bookingHref?: string; meta?: ReportMeta }) {
  const h2 = "mb-5 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white";
  const sc = report.scorecard ?? null;
  return (
    <div className="mx-auto max-w-[780px]">
      <CoverBlock report={report} meta={meta} />
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

      <CompetitorComparison report={report} clientName={report.business_name} />

      <section className="card mb-6">
        <h2 className={h2}><Icon name="groups" className="text-[22px] text-[var(--color-brand-soft)]" />Who you should be targeting</h2>
        <div className="grid gap-3">
          {report.icps.map((s, i) => (
            <details key={s.name} open={i === 0} className="group rounded-xl border border-[var(--color-line)] bg-white/[0.02] p-4">
              <summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-white">
                {s.name}
                <Icon name="expand_more" className="text-[20px] text-[var(--color-faint)] transition-transform group-open:rotate-180 print:hidden" />
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
        <section className="card mb-6">
          <h2 className={h2}><Icon name="fact_check" className="text-[22px] text-[var(--color-brand-soft)]" />Assumptions we made</h2>
          <ul className="grid gap-2 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
            {report.assumptions.map((a, i) => <li key={i} className="flex gap-2"><span className="text-[var(--color-brand-soft)]">·</span>{a}</li>)}
          </ul>
        </section>
      )}

      <Methodology sc={sc} meta={meta} report={report} />

      <section className="mb-4 text-center print:hidden">
        <p className="mb-5 text-[15.5px] leading-[1.6] text-[var(--color-fg)]">{report.cta}</p>
        <a href={bookingHref} className="btn-primary">Book a free 30-minute session <Icon name="arrow_forward" className="text-[19px]" /></a>
      </section>

      {/* print-only running footer (repeats on every printed page) */}
      <div className="hidden print:fixed print:bottom-2 print:left-0 print:right-0 print:block print:text-center print:text-[10px] print:text-[#8b8b9a]">
        {report.business_name} · Growth Snapshot · Catalyst Solutions Services{meta.date ? ` · ${meta.date.slice(0, 10)}` : ""}
      </div>
    </div>
  );
}
