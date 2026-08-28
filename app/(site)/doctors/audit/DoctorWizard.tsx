"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { DOCTOR_SECTIONS, type DoctorQuestion } from "@/lib/audit/doctor-questionnaire";

type Answers = Record<string, string | string[]>;

function visible(q: DoctorQuestion, a: Answers): boolean {
  if (!q.showIf) return true;
  const v = String(a[q.showIf.id] ?? "");
  if (q.showIf.in) return q.showIf.in.includes(v);
  if (q.showIf.notIn) return !q.showIf.notIn.includes(v);
  return true;
}

export default function DoctorWizard() {
  const [step, setStep] = useState(0); // section index; sections.length = done
  const [answers, setAnswers] = useState<Answers>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const sections = DOCTOR_SECTIONS;
  const section = sections[step];
  const set = (id: string, v: string | string[]) => setAnswers((p) => ({ ...p, [id]: v }));

  const sectionValid = section?.questions.every((q) => {
    if (!q.required || !visible(q, answers)) return true;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim();
  });

  async function submit() {
    setBusy(true); setError(null);
    // fold "Other: ..." free text into the answers
    const merged: Answers = { ...answers };
    for (const [id, text] of Object.entries(other)) {
      if (!text.trim()) continue;
      const cur = merged[id];
      if (Array.isArray(cur)) merged[id] = [...cur.filter((x) => x !== "Other"), `Other: ${text.trim()}`];
      else if (cur === "Other") merged[id] = `Other: ${text.trim()}`;
    }
    try {
      const res = await fetch("/api/doctors/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: merged }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setToken(data.token);
      setStep(sections.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const card = "card mx-auto w-full max-w-[680px]";

  if (step >= sections.length) {
    return (
      <div className={`${card} text-center`}>
        <span className="icon-grad mx-auto mb-5 flex h-14 w-14 text-[28px]"><Icon name="clinical_notes" /></span>
        <h2 className="mb-2 text-[22px] font-bold text-white">Thank you, {String(answers.name ?? "Doctor")}.</h2>
        <p className="mb-6 text-[14px] leading-[1.65] text-[var(--color-muted)]">
          We&apos;re now reviewing your responses{answers.websiteUrl ? " alongside a technical scan of your website" : ""}.
          A Catalyst consultant checks every audit before release. Yours will be ready within 1 business day at this link:
        </p>
        {token && (
          <>
            <a href={`/growth-audit/report/${token}`} className="btn-primary mb-4 w-full">
              View my audit page <Icon name="arrow_forward" className="text-[18px]" />
            </a>
            <p className="text-[12.5px] text-[var(--color-faint)]">Bookmark it — the audit appears there the moment it&apos;s approved, and you can save it as a PDF.</p>
          </>
        )}
      </div>
    );
  }

  const progress = Math.round((step / sections.length) * 100);

  return (
    <div className={card}>
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-[12px] text-[var(--color-faint)]">
          <span>Section {step + 1} of {sections.length} — {section.title}</span><span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
        </div>
      </div>

      <h2 className="mb-5 text-[20px] font-bold tracking-[-0.01em] text-white">{section.title}</h2>

      {section.questions.filter((q) => visible(q, answers)).map((q) => {
        const val = answers[q.id];
        const opts = [...(q.options ?? []), ...(q.allowOther ? ["Other"] : [])];
        return (
          <div key={q.id} className="mb-5">
            <label className="label mb-2 block text-[13px]">{q.label}{q.required && " *"}</label>

            {(q.type === "text") && (
              <input className="field" value={String(val ?? "")} onChange={(e) => set(q.id, e.target.value)} />
            )}
            {q.type === "textarea" && (
              <textarea className="field min-h-[72px]" value={String(val ?? "")} onChange={(e) => set(q.id, e.target.value)} />
            )}
            {(q.type === "single" || q.type === "scale") && (
              <div className={q.type === "scale" ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-2"}>
                {opts.map((o) => (
                  <button key={o} type="button" onClick={() => set(q.id, o)}
                    className={`rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors ${
                      val === o ? "border-[rgba(168,85,247,0.6)] bg-[rgba(124,58,237,0.18)] text-white" : "border-[var(--color-line)] bg-[rgba(255,255,255,0.03)] text-[var(--color-fg)] hover:border-[rgba(168,85,247,0.35)]"}`}>
                    {o}
                  </button>
                ))}
              </div>
            )}
            {q.type === "multi" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {opts.map((o) => {
                  const arr = Array.isArray(val) ? val : [];
                  const on = arr.includes(o);
                  const atCap = !!q.maxSelect && arr.length >= q.maxSelect && !on;
                  return (
                    <button key={o} type="button" disabled={atCap}
                      onClick={() => set(q.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                      className={`rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors disabled:opacity-40 ${
                        on ? "border-[rgba(168,85,247,0.6)] bg-[rgba(124,58,237,0.18)] text-white" : "border-[var(--color-line)] bg-[rgba(255,255,255,0.03)] text-[var(--color-fg)] hover:border-[rgba(168,85,247,0.35)]"}`}>
                      {o}
                    </button>
                  );
                })}
              </div>
            )}
            {q.allowOther && (Array.isArray(val) ? val.includes("Other") : val === "Other") && (
              <input className="field mt-2" placeholder="Please specify…" value={other[q.id] ?? ""} onChange={(e) => setOther((p) => ({ ...p, [q.id]: e.target.value }))} />
            )}
          </div>
        );
      })}

      {error && <p className="mb-4 text-[13.5px] text-red-400">{error}</p>}

      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="btn-ghost px-5 py-2.5 text-sm" disabled={step === 0 || busy}>Back</button>
        <button type="button" disabled={busy || !sectionValid}
          onClick={() => (step === sections.length - 1 ? submit() : setStep((s) => s + 1))}
          className="btn-primary px-6 py-3 text-sm">
          {busy ? "Submitting…" : step === sections.length - 1 ? "Finish & request my audit" : "Continue"} {!busy && <Icon name="arrow_forward" className="text-[17px]" />}
        </button>
      </div>
    </div>
  );
}
