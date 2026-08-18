"use client";

// AI qualification demo: pick enquiry attributes, watch the scoring steps run,
// get a score and the routing decision. Deterministic rules from lib/demos.ts.

import { useState } from "react";
import Icon from "@/components/Icon";
import type { ScoreConfig } from "@/lib/demos";

const STEPS = ["Parsing enquiry details…", "Checking fit and coverage…", "Scoring intent and urgency…", "Selecting routing rule…"];

export default function LeadScoreDemo({ config }: { config: ScoreConfig }) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [step, setStep] = useState(0);

  const ready = config.fields.every((f) => picks[f.key] !== undefined);
  const score = config.fields.reduce((sum, f) => sum + (picks[f.key] !== undefined ? f.options[picks[f.key]].pts : 0), 0);
  const dq = config.disqualify && picks[config.disqualify.key] === config.disqualify.optionIndex;

  const run = () => {
    setPhase("running");
    setStep(0);
    STEPS.forEach((_, i) => setTimeout(() => setStep(i + 1), 650 * (i + 1)));
    setTimeout(() => setPhase("done"), 650 * (STEPS.length + 1));
  };

  const verdict = dq
    ? { grade: config.disqualify!.verdict.grade, color: "#8b8b9a", icon: "block", action: config.disqualify!.verdict.action }
    : config.verdicts.find((v) => score >= v.min) ?? config.verdicts[config.verdicts.length - 1];

  return (
    <div className="flex min-h-[480px] flex-col rounded-2xl border border-[var(--color-line)] bg-[#0c0b16] p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="icon-chip h-10 w-10 text-[20px]"><Icon name="fact_check" /></span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-white">{config.title}</div>
          <div className="truncate text-[11.5px] text-[var(--color-faint)]">{config.subtitle}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.12)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-soft)]">
          Demo
        </span>
      </div>

      {phase === "form" && (
        <>
          <div className="flex flex-col gap-4">
            {config.fields.map((f) => (
              <div key={f.key}>
                <div className="mb-2 text-[12.5px] font-semibold text-[var(--color-fg)]">{f.label}</div>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o, i) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setPicks((p) => ({ ...p, [f.key]: i }))}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        picks[f.key] === i
                          ? "border-[var(--color-brand)] bg-[rgba(124,58,237,0.25)] text-white"
                          : "border-[var(--color-line)] bg-white/[0.03] text-[var(--color-muted)] hover:border-[rgba(168,85,247,0.4)]"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button type="button" disabled={!ready} onClick={run} className="btn-primary mt-auto w-full justify-center py-3 text-[14px] disabled:opacity-40 disabled:shadow-none">
            Run qualification <Icon name="play_arrow" className="text-[18px]" />
          </button>
        </>
      )}

      {phase === "running" && (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 px-2">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2.5 text-[13.5px] transition-opacity ${i < step ? "text-[#6EE7B7]" : i === step ? "text-white" : "text-[var(--color-faint)] opacity-40"}`}>
              <Icon name={i < step ? "check_circle" : "progress_activity"} className={`text-[18px] ${i === step ? "animate-spin" : ""}`} />
              {s}
            </div>
          ))}
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-[var(--color-line)] bg-white/[0.03] p-5">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[26px]" style={{ background: `${verdict.color}22`, color: verdict.color }}>
              <Icon name={verdict.icon} />
            </span>
            <div>
              <div className="text-[20px] font-extrabold text-white">
                {verdict.grade}
                {!dq && <span className="ml-2 text-[14px] font-semibold" style={{ color: verdict.color }}>{score}/100</span>}
              </div>
              <div className="text-[12px] text-[var(--color-faint)]">Scored in 0.4s — before a human ever saw it</div>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-line)] bg-white/[0.03] p-5">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Automatic action taken</div>
            <p className="text-[13.5px] leading-[1.6] text-[var(--color-muted)]">{verdict.action}</p>
          </div>
          <button type="button" onClick={() => { setPicks({}); setPhase("form"); }} className="btn-ghost w-full justify-center py-3 text-[13.5px]">
            <Icon name="replay" className="text-[17px]" /> Try a different enquiry
          </button>
        </div>
      )}
    </div>
  );
}
