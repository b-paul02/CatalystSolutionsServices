"use client";

// Client reporting dashboard demo — fictional data with a working segment filter.
// ponytail: hardcoded dataset from lib/demos.ts; real dashboards are CRM/Looker-fed.

import { useState } from "react";
import Icon from "@/components/Icon";
import type { DashConfig } from "@/lib/demos";

export default function DashboardDemo({ config }: { config: DashConfig }) {
  const [seg, setSeg] = useState(config.segments[0]);
  const d = config.data[seg] ?? config.data[config.segments[0]];

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[#0c0b16] p-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[20px] text-white" style={{ background: config.accent }}>
          <Icon name={config.icon} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-white">{config.brand} — Growth Dashboard</div>
          <div className="truncate text-[11.5px] text-[var(--color-faint)]">{config.subtitle}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.12)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-soft)]">
          Demo · fictional data
        </span>
      </div>

      {config.segments.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {config.segments.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeg(s)}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                seg === s ? "border-[var(--color-brand)] bg-[rgba(124,58,237,0.25)] text-white" : "border-[var(--color-line)] bg-white/[0.03] text-[var(--color-muted)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {d.kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-[var(--color-line)] bg-white/[0.03] p-4">
            <div className="text-[20px] font-extrabold text-white">{k.value}</div>
            <div className="text-[12px] font-semibold text-[#6EE7B7]">{k.delta}</div>
            <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--color-faint)]">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 text-[13px] font-semibold text-white">{config.trendTitle}</div>
          <div className="flex h-[150px] items-end gap-3">
            {d.months.map((mo) => (
              <div key={mo.m} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">{mo.v}</span>
                <div className="w-full rounded-t-md" style={{ height: `${mo.pct}%`, background: `linear-gradient(180deg, ${config.accent}, ${config.accent}88)` }} />
                <span className="text-[11px] text-[var(--color-faint)]">{mo.m}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3 text-[13px] font-semibold text-white">{config.channelTitle}</div>
          <div className="flex flex-col gap-3">
            {d.channels.map((c) => (
              <div key={c.label}>
                <div className="mb-1 flex justify-between gap-3 text-[12px]">
                  <span className="truncate text-[var(--color-muted)]">{c.label}</span>
                  <span className="shrink-0 font-bold text-white">{c.v}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: config.accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
