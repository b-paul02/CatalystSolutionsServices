"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Progress = {
  generating: boolean;
  done: boolean;
  failed: boolean;
  percent: number;
  stage: string;
  elapsedSec: number;
  typical: string;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function GenerationProgress({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [p, setP] = useState<Progress | null>(null);
  const [sawGenerating, setSawGenerating] = useState(false);

  useEffect(() => {
    let alive = true;
    let saw = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/progress?leadId=${leadId}`);
        if (!res.ok) return;
        const data: Progress = await res.json();
        if (!alive) return;
        setP(data);
        if (data.generating) { saw = true; setSawGenerating(true); }
        // refresh only on the transition generating → finished, never in a loop
        else if (saw) { router.refresh(); }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [leadId, router]);

  // mounted on a rejected report: stay invisible until the regeneration actually starts
  if (!p || (!p.generating && !sawGenerating)) return null;

  return (
    <div className="card mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-white">
          {p.failed ? "Generation failed" : p.done ? "Finished — loading report…" : "Generating report"}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--color-faint)]">{fmt(p.elapsedSec)} elapsed</span>
      </div>
      <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${p.failed ? "bg-[#FCA5A5]" : "bg-gradient-to-r from-[#7C3AED] to-[#A855F7]"}`}
          style={{ width: `${Math.max(4, p.percent)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className={p.failed ? "text-[#FCA5A5]" : "text-[var(--color-brand-soft)]"}>
          {!p.failed && !p.done && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-brand)] align-middle" />}
          {p.stage} · {p.percent}%
        </span>
        <span className="text-[var(--color-faint)]">{p.typical}</span>
      </div>
    </div>
  );
}
