import Icon from "@/components/Icon";
import type { DoctorReportJSON } from "@/lib/audit/doctor-report-types";
import { ScorecardHero, ChecksTable, type ReportMeta } from "./ReportView";

const h2 = "mb-5 flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.01em] text-white";

export default function DoctorReportView({ report, bookingHref = "/contact", meta = {} }: { report: DoctorReportJSON; bookingHref?: string; meta?: ReportMeta }) {
  const sc = report.scorecard ?? null;
  return (
    <div className="mx-auto max-w-[780px]">
      {/* cover */}
      <section className="card mb-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-soft)]">Doctor Digital Audit Report</div>
            <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-white">{report.doctor_name}</h2>
            <div className="mt-0.5 text-[13px] text-[var(--color-muted)]">{report.specialty} · {report.institution} · {report.location}</div>
          </div>
          <div className="text-right text-[12.5px] leading-[1.7] text-[var(--color-faint)]">
            {meta.date && <div>Audit date: <span className="text-[var(--color-fg)]">{meta.date.slice(0, 10)}</span></div>}
            {meta.version !== undefined && <div>Report version: <span className="text-[var(--color-fg)]">v{meta.version}</span></div>}
            <div>Assessment: <span className="text-[var(--color-fg)]">Doctor Digital Presence &amp; Growth Questionnaire</span></div>
            <div>Prepared by <span className="text-[var(--color-fg)]">Catalyst Solutions Services</span></div>
          </div>
        </div>
        <p className="border-t border-white/5 pt-3 text-[11.5px] leading-[1.5] text-[var(--color-faint)]">
          This report identifies the most relevant digital opportunities from the information submitted{sc ? " and our own research" : " and our own research"} and recommends a focused solution — not a generic package. Confidential; prepared for the doctor named above.
        </p>
      </section>

      {/* executive summary */}
      <section className="card mb-6">
        <h2 className={h2}><Icon name="summarize" className="text-[22px] text-[var(--color-brand-soft)]" />Executive summary</h2>
        {report.executive_summary.split(/\n\n+/).map((p, i) => (
          <p key={i} className="mb-3 text-[14.5px] leading-[1.7] text-[var(--color-fg)]">{p}</p>
        ))}
        <div className="mt-4 rounded-xl border border-[rgba(168,85,247,0.35)] bg-[rgba(124,58,237,0.12)] p-4 text-[14px] font-medium leading-[1.6] text-white">
          Our initial recommendation is the <span className="text-[var(--color-brand-soft)]">{report.recommended_solution.name}</span> — beginning with a focused review of your individual online presence, then implementing only the areas where a genuine gap is identified.
        </div>
        <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-white/[0.03] p-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--color-faint)]">Important note</div>
          <p className="text-[12.5px] leading-[1.6] text-[var(--color-muted)]">
            This is a preliminary recommendation based on the information provided and the searches we ran. Where an answer or search did not show an asset, we have not assumed it is missing unless stated — those items are verified during the complimentary review before anything is implemented.
          </p>
        </div>
      </section>

      {/* individual presence — what a patient's search actually shows */}
      {report.online_presence && (
        <section className="card mb-6">
          <h2 className={h2}><Icon name="person_search" className="text-[22px] text-[var(--color-brand-soft)]" />How patients currently find you online</h2>
          <p className="mb-4 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">{report.online_presence.intro}</p>
          <div className="grid gap-2.5">
            {report.online_presence.found.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <Icon name={f.status === "strength" ? "check_circle" : f.status === "gap" ? "error" : "radio_button_unchecked"}
                  className={`mt-0.5 text-[18px] ${f.status === "strength" ? "text-[#6EE7B7]" : f.status === "gap" ? "text-[#FCD34D]" : "text-[var(--color-faint)]"}`} />
                <div>
                  <span className="text-[14px] font-semibold text-white">{f.where}</span>
                  <p className="text-[13px] leading-[1.55] text-[var(--color-muted)]">{f.what}</p>
                </div>
              </div>
            ))}
          </div>
          {report.online_presence.not_found.length > 0 && (
            <div className="mt-4 rounded-xl border border-[rgba(252,165,165,0.25)] bg-[rgba(252,165,165,0.05)] p-4">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[#FCA5A5]">Not visible in our searches</div>
              <ul className="grid gap-1.5 text-[13px] leading-[1.5] text-[var(--color-muted)]">
                {report.online_presence.not_found.map((n, i) => <li key={i} className="flex gap-2"><span className="text-[#FCA5A5]">·</span>{n}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* what to check first */}
      <section className="mb-6 rounded-2xl border border-[rgba(168,85,247,0.35)] bg-[rgba(124,58,237,0.1)] p-6">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">What we recommend checking first</h2>
        <ul className="grid gap-2">
          {report.check_first.map((k, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[14px] font-medium leading-[1.55] text-white">
              <Icon name="arrow_forward" className="mt-0.5 text-[16px] text-[var(--color-brand-soft)]" />{k}
            </li>
          ))}
        </ul>
      </section>

      {/* scan of the site the doctor shared, when one ran */}
      {sc && (
        <>
          <p className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Automated scan of the website you shared</p>
          <ScorecardHero sc={sc} />
          <ChecksTable sc={sc} />
        </>
      )}

      {/* key findings */}
      <section className="card mb-6 overflow-x-auto">
        <h2 className={h2}><Icon name="search_insights" className="text-[22px] text-[var(--color-brand-soft)]" />Key findings from your assessment</h2>
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <th className="pb-3 pr-4 font-semibold">Area</th>
              <th className="pb-3 pr-4 font-semibold">What we know</th>
              <th className="pb-3 font-semibold">Catalyst interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 align-top">
            {report.key_findings.map((f) => (
              <tr key={f.area}>
                <td className="py-3 pr-4 font-semibold text-white">{f.area}</td>
                <td className="py-3 pr-4 leading-[1.55] text-[var(--color-muted)]">{f.what_we_know}</td>
                <td className="py-3 leading-[1.55] text-[var(--color-fg)]">{f.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* recommended solution */}
      <section className="card mb-6">
        <h2 className={h2}><Icon name="medical_services" className="text-[22px] text-[var(--color-brand-soft)]" />Recommended solution</h2>
        <p className="mb-4 text-[14.5px] font-semibold text-[var(--color-brand-soft)]">{report.recommended_solution.name}</p>
        <div className="grid gap-3">
          {report.recommended_solution.components.map((c) => (
            <div key={c.component} className="rounded-xl border border-[var(--color-line)] bg-white/[0.02] p-4">
              <div className="mb-1 text-[14px] font-semibold text-white">{c.component}</div>
              <p className="text-[13px] leading-[1.6] text-[var(--color-muted)]">{c.delivery}</p>
            </div>
          ))}
        </div>
      </section>

      {/* why relevant */}
      <section className="card mb-6">
        <h2 className={h2}><Icon name="lightbulb" className="text-[22px] text-[var(--color-brand-soft)]" />Why this is relevant</h2>
        <p className="text-[14.5px] leading-[1.7] text-[var(--color-fg)]">{report.why_relevant}</p>
      </section>

      {/* roadmap */}
      <section className="card mb-10 overflow-x-auto">
        <h2 className={h2}><Icon name="route" className="text-[22px] text-[var(--color-brand-soft)]" />Proposed implementation roadmap</h2>
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <th className="pb-3 pr-4 font-semibold">Stage</th>
              <th className="pb-3 pr-4 font-semibold">Action</th>
              <th className="pb-3 font-semibold">Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 align-top">
            {report.roadmap.map((r, i) => (
              <tr key={r.stage}>
                <td className="py-3 pr-4 font-semibold text-white">{i + 1}. {r.stage}</td>
                <td className="py-3 pr-4 leading-[1.55] text-[var(--color-muted)]">{r.action}</td>
                <td className="py-3 leading-[1.55] text-[var(--color-fg)]">{r.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* single CTA — the next step must survive into the PDF (button hidden, contact shown) */}
      <section className="card mb-4 text-center">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Recommended next step</h2>
        <p className="mb-5 text-[15px] leading-[1.6] text-[var(--color-fg)]">{report.next_step}</p>
        <a href={bookingHref} className="btn-primary print:hidden">Book a Digital Presence Consultation <Icon name="arrow_forward" className="text-[19px]" /></a>
        <p className="mt-4 text-[13px] text-[var(--color-muted)]">Email: <span className="text-[var(--color-brand-soft)]">info@catalystsolutionservices.com</span></p>
      </section>

      <div className="hidden print:fixed print:bottom-2 print:left-0 print:right-0 print:block print:text-center print:text-[10px] print:text-[#8b8b9a]">
        {report.doctor_name} · Doctor Digital Audit · Catalyst Solutions Services{meta.date ? ` · ${meta.date.slice(0, 10)}` : ""}
      </div>
    </div>
  );
}
