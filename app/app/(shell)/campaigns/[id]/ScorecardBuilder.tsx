"use client";

// WP-10a · scorecard builder tab: categories (mapped to audit pillars), questions with points per answer, result
// bands, gate — with a live preview of the result page at any score.
import { useState } from "react";
import { GhostButton, Input, Label, Select } from "@/components/leados/ui";
import { PILLARS } from "@/lib/os/audit";
import { scorecardProblems, type ScorecardSpec } from "@/lib/leados/scorecard";
import ScoreDial from "@/components/os/ScoreDial";

const field = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-2 py-1.5 text-[13px]";
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

export default function ScorecardBuilder({ spec: initial, canManage, brandColor, onSave, pending }: { spec: ScorecardSpec; canManage: boolean; brandColor: string; onSave: (spec: ScorecardSpec) => void; pending: boolean }) {
  const [spec, setSpec] = useState<ScorecardSpec>(initial);
  const [previewPct, setPreviewPct] = useState(55);
  const problems = scorecardProblems(spec);
  const band = spec.bands.find((b) => previewPct >= b.min && previewPct <= b.max) ?? spec.bands.at(-1);
  const setQ = (i: number, patch: Partial<ScorecardSpec["questions"][number]>) => setSpec({ ...spec, questions: spec.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const setB = (i: number, patch: Partial<ScorecardSpec["bands"][number]>) => setSpec({ ...spec, bands: spec.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const ro = !canManage;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-[var(--los-line)] p-4">
          <div className="mb-2 text-[13.5px] font-semibold">Categories <span className="font-normal text-[var(--los-faint)]">— each maps to a Growth Audit pillar so results line up with verified checks</span></div>
          <div className="space-y-2">
            {spec.categories.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input value={c.label} disabled={ro} onChange={(e) => setSpec({ ...spec, categories: spec.categories.map((x, j) => (j === i ? { ...x, label: e.target.value, key: x.key || key(e.target.value) } : x)) })} className="min-w-[200px] flex-1" />
                <Select value={c.pillar} disabled={ro} onChange={(e) => setSpec({ ...spec, categories: spec.categories.map((x, j) => (j === i ? { ...x, pillar: e.target.value } : x)) })}>{PILLARS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select>
                {canManage && <button type="button" className="text-[12px] text-[var(--los-danger)]" onClick={() => setSpec({ ...spec, categories: spec.categories.filter((_, j) => j !== i) })}>remove</button>}
              </div>
            ))}
          </div>
          {canManage && <GhostButton className="mt-2" onClick={() => setSpec({ ...spec, categories: [...spec.categories, { key: `cat${spec.categories.length + 1}`, label: "New category", pillar: "conversion" }] })}>Add category</GhostButton>}
        </section>

        <section className="rounded-xl border border-[var(--los-line)] p-4">
          <div className="mb-2 text-[13.5px] font-semibold">Questions <span className="font-normal text-[var(--los-faint)]">— points per answer; the highest answer sets the question&apos;s maximum</span></div>
          <div className="space-y-3">
            {spec.questions.map((q, i) => (
              <div key={i} className="rounded-lg bg-[var(--los-surface-2)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-[var(--los-faint)]">Q{i + 1}</span>
                  <input value={q.text} disabled={ro} onChange={(e) => setQ(i, { text: e.target.value })} className={`${field} min-w-[240px] flex-1`} placeholder="Question" />
                  <select value={q.category} disabled={ro} onChange={(e) => setQ(i, { category: e.target.value })} className={field} style={{ width: "auto" }}>{spec.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                  {canManage && <button type="button" className="text-[12px] text-[var(--los-danger)]" onClick={() => setSpec({ ...spec, questions: spec.questions.filter((_, j) => j !== i) })}>remove</button>}
                </div>
                <div className="mt-2 space-y-1">
                  {q.answers.map((a, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input value={a.label} disabled={ro} onChange={(e) => setQ(i, { answers: q.answers.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} className={`${field} flex-1`} placeholder="Answer" />
                      <input type="number" min={0} max={100} value={a.points} disabled={ro} onChange={(e) => setQ(i, { answers: q.answers.map((x, m) => (m === k ? { ...x, points: Number(e.target.value) } : x)) })} className={`${field} w-[72px]`} aria-label="Points" />
                      {canManage && q.answers.length > 2 && <button type="button" className="text-[12px] text-[var(--los-danger)]" onClick={() => setQ(i, { answers: q.answers.filter((_, m) => m !== k) })}>×</button>}
                    </div>
                  ))}
                  {canManage && <button type="button" className="text-[12.5px] text-[var(--los-brand)]" onClick={() => setQ(i, { answers: [...q.answers, { label: "", points: 0 }] })}>+ answer</button>}
                </div>
              </div>
            ))}
          </div>
          {canManage && <GhostButton className="mt-2" onClick={() => setSpec({ ...spec, questions: [...spec.questions, { key: `q${spec.questions.length + 1}_${Date.now().toString(36)}`, text: "", category: spec.categories[0]?.key ?? "cat", answers: [{ label: "Yes", points: 10 }, { label: "No", points: 0 }] }] })}>Add question</GhostButton>}
        </section>

        <section className="rounded-xl border border-[var(--los-line)] p-4">
          <div className="mb-2 text-[13.5px] font-semibold">Result bands <span className="font-normal text-[var(--los-faint)]">— must cover 0 to 100 with no gaps</span></div>
          <div className="space-y-3">
            {spec.bands.map((b, i) => (
              <div key={i} className="grid gap-2 rounded-lg bg-[var(--los-surface-2)] p-3 md:grid-cols-[70px_70px_1fr]">
                <input type="number" min={0} max={100} value={b.min} disabled={ro} onChange={(e) => setB(i, { min: Number(e.target.value) })} className={field} aria-label="From" />
                <input type="number" min={0} max={100} value={b.max} disabled={ro} onChange={(e) => setB(i, { max: Number(e.target.value) })} className={field} aria-label="To" />
                <input value={b.label} disabled={ro} onChange={(e) => setB(i, { label: e.target.value })} className={field} placeholder="Band label" />
                <input value={b.headline} disabled={ro} onChange={(e) => setB(i, { headline: e.target.value })} className={`${field} md:col-span-3`} placeholder="Headline on the result page" />
                <textarea value={b.body} disabled={ro} onChange={(e) => setB(i, { body: e.target.value })} className={`${field} md:col-span-3`} rows={2} placeholder="What this score means and what to do next (no promises)" />
                <input value={b.ctaLabel ?? ""} disabled={ro} onChange={(e) => setB(i, { ctaLabel: e.target.value })} className={`${field} md:col-span-1`} placeholder="Button label" />
                <input value={b.ctaHref ?? ""} disabled={ro} onChange={(e) => setB(i, { ctaHref: e.target.value })} className={`${field} md:col-span-2`} placeholder="Button link (https://… or /b/…)" />
                {canManage && <button type="button" className="text-left text-[12px] text-[var(--los-danger)]" onClick={() => setSpec({ ...spec, bands: spec.bands.filter((_, j) => j !== i) })}>remove band</button>}
              </div>
            ))}
          </div>
          {canManage && <GhostButton className="mt-2" onClick={() => { const last = spec.bands.at(-1); setSpec({ ...spec, bands: [...spec.bands, { min: last ? Math.min(100, last.max + 1) : 0, max: 100, label: "New band", headline: "", body: "" }] }); }}>Add band</GhostButton>}
        </section>

        <section className="rounded-xl border border-[var(--los-line)] p-4">
          <Label>Before showing the result</Label>
          <Select value={spec.gate} disabled={ro} onChange={(e) => setSpec({ ...spec, gate: e.target.value === "none" ? "none" : "email_before_results" })}>
            <option value="email_before_results">Ask for contact details first (lead magnet)</option>
            <option value="none">Show the score first, then offer the full report by email</option>
          </Select>
        </section>

        {problems.length > 0 && <ul className="space-y-1 text-[13px] text-[var(--los-danger)]">{problems.map((p) => <li key={p}>✕ {p}</li>)}</ul>}
        {canManage && <GhostButton onClick={() => onSave(spec)} disabled={pending}>Save scorecard</GhostButton>}
      </div>

      <aside className="rounded-xl border border-[var(--los-line)] p-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--los-faint)]">Result preview</div>
        <label className="text-[12px] text-[var(--los-muted)]">Score to preview: {previewPct}<input type="range" min={0} max={100} value={previewPct} onChange={(e) => setPreviewPct(Number(e.target.value))} className="w-full" /></label>
        <div className="mt-2 flex flex-col items-center text-center">
          <ScoreDial pct={previewPct} color={brandColor} size={130} />
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: brandColor }}>{band?.label ?? "—"}</div>
          <div className="mt-1 text-[16px] font-extrabold leading-tight">{band?.headline || "Headline"}</div>
          <p className="mt-1 text-[12.5px] text-[var(--los-muted)]">{band?.body || "Body copy for this band."}</p>
          {band?.ctaLabel && <span className="mt-2 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: brandColor }}>{band.ctaLabel}</span>}
        </div>
        <div className="mt-3 space-y-1.5">{spec.categories.map((c) => <div key={c.key}><div className="flex justify-between text-[12px]"><span>{c.label}</span><span>{previewPct}%</span></div><div className="h-1.5 rounded bg-[var(--los-surface-2)]"><div className="h-1.5 rounded" style={{ width: `${previewPct}%`, background: brandColor }} /></div></div>)}</div>
        <p className="mt-3 text-[11.5px] text-[var(--los-faint)]">{spec.questions.length} question{spec.questions.length === 1 ? "" : "s"}, one per screen · max {spec.questions.reduce((a, q) => a + Math.max(0, ...q.answers.map((x) => x.points)), 0)} points</p>
      </aside>
    </div>
  );
}
