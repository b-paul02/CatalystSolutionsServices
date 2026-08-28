"use client";

import { useState, useTransition } from "react";
import { executePlanAllocation, previewPlanAllocation, setPlanStatus } from "./actions";
import type { AllocationResult } from "@/lib/leados/allocation";

type Plan = {
  id: string; name: string; orgName: string; leadType: string; dailyQuota: number;
  status: string; exclusivity: string; purpose: string; rollover: string;
  runs: { runDate: string; due: number; allocated: number; shortage: number }[];
};

export default function PlanRow({ plan }: { plan: Plan }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AllocationResult | null>(null);
  return (
    <div className="card !p-4 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold text-white">{plan.name}</span>
        <span className="text-[var(--color-muted)]">{plan.orgName}</span>
        <span className="rounded-full bg-[rgba(124,58,237,0.2)] px-2 py-0.5 text-[12px] uppercase text-[var(--color-brand-soft)]">{plan.leadType}</span>
        <span className="text-[var(--color-muted)]">{plan.dailyQuota}/day · {plan.exclusivity} · {plan.purpose} · rollover: {plan.rollover}</span>
        <span className={plan.status === "active" ? "text-[var(--color-success)]" : "text-amber-400"}>{plan.status}</span>
      </div>

      {plan.runs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[12.5px] text-[var(--color-muted)]">
          {plan.runs.map((r) => (
            <span key={r.runDate} className="rounded-lg bg-black/30 px-2 py-1">
              {r.runDate}: {r.allocated}/{r.due}{r.shortage > 0 ? ` (−${r.shortage})` : " ✓"}
            </span>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-2 rounded-lg bg-black/30 p-2.5 text-[12.5px] text-[var(--color-muted)]">
          {result.skipped
            ? `Skipped: ${result.skipped}`
            : `${result.executed ? "Executed" : "Preview"} ${result.runDate}: due ${result.due} (rollover ${result.rollover}), eligible ${result.eligible}, ${result.executed ? "allocated" : "would allocate"} ${result.allocated}, shortage ${result.shortage}`}
          {Object.keys(result.reasons).length > 0 && (
            <span> · excluded: {Object.entries(result.reasons).map(([k, v]) => `${k}×${v}`).join(", ")}</span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
        <button disabled={pending} onClick={() => start(async () => setResult(await previewPlanAllocation(plan.id)))} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-white hover:border-[var(--color-brand)]">
          Preview today
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Execute today's allocation now? Tokens will be debited.")) {
              start(async () => setResult(await executePlanAllocation(plan.id)));
            }
          }}
          className="rounded-lg bg-[var(--color-brand-strong)] px-3 py-1.5 font-semibold text-white"
        >
          Run now
        </button>
        {plan.status === "active" ? (
          <button disabled={pending} onClick={() => start(() => setPlanStatus(plan.id, "paused"))} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-amber-400">Pause</button>
        ) : plan.status === "paused" ? (
          <button disabled={pending} onClick={() => start(() => setPlanStatus(plan.id, "active"))} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-success)]">Resume</button>
        ) : null}
        {plan.status !== "ended" && (
          <button disabled={pending} onClick={() => { if (confirm("End this plan permanently?")) start(() => setPlanStatus(plan.id, "ended")); }} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-red-400">End</button>
        )}
      </div>
    </div>
  );
}
