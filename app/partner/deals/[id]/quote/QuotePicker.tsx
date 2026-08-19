"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { commissionAmount, formatMoney, formatRate, type Currency } from "@/lib/partner/money";
import { selectPackage } from "./actions";

export type Package = {
  id: string;
  family: string;
  familyLabel: string;
  program: string;
  tier: string;
  packageName: string;
  onboardingFee: string; // minor units as a string — BigInt does not cross the wire
  growthPlanMonthly: string | null;
  guardrails: string[];
  billingSchedule: string;
};

// Fixed copy. The Growth Plan is shown so the partner knows it exists, and is
// labelled the same way every time so it can never read as quotable.
const GROWTH_PLAN_CAPTION = "Catalyst discusses this directly — not part of your quote";
const GROWTH_PLAN_LABEL = "recurring — not commissionable";

const SCHEDULE_LABEL: Record<string, string> = {
  "50_50": "50% on kickoff, 50% on delivery",
  "40_40_20": "40% on kickoff, 40% at midpoint, 20% on delivery",
};

export default function QuotePicker({
  dealId, packages, currency, rateBp, selectedId,
}: {
  dealId: string;
  packages: Package[];
  currency: Currency;
  rateBp: number | null;
  selectedId: string | null;
}) {
  const router = useRouter();
  const families = [...new Map(packages.map((p) => [p.family, p.familyLabel])).entries()];

  const preselected = packages.find((p) => p.id === selectedId) ?? null;
  const [family, setFamily] = useState<string>(preselected?.family ?? families[0]?.[0] ?? "");
  const [chosen, setChosen] = useState<Package | null>(preselected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFamily = packages.filter((p) => p.family === family);

  // The commissionable base is the onboarding fee and nothing else. The Growth
  // Plan monthly figure is never an input to this calculation.
  const base = chosen ? BigInt(chosen.onboardingFee) : null;
  const commission = base !== null && rateBp !== null ? commissionAmount(base, rateBp) : null;

  async function save() {
    if (!chosen) return;
    setBusy(true); setError(null);
    try {
      await selectPackage(dealId, chosen.id);
      router.push(`/partner/deals/${dealId}`);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4">
        <div className="card">
          <label className="label mb-2 block">Family</label>
          <select className="field" value={family}
                  onChange={(e) => { setFamily(e.target.value); setChosen(null); }}>
            {families.map(([value, label]) => (
              <option key={value} value={value} className="bg-[#13101f]">{label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3">
          {inFamily.map((p) => {
            const on = chosen?.id === p.id;
            return (
              <button key={p.id} type="button" onClick={() => setChosen(p)} aria-pressed={on}
                className={`card text-left transition ${on ? "border-[#7C3AED] ring-1 ring-[#7C3AED]/50" : "hover:border-[var(--color-brand-soft)]"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">{p.tier}</span>
                    <h3 className="text-[17px] font-bold text-white">{p.packageName}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-extrabold leading-none text-white">
                      {formatMoney(BigInt(p.onboardingFee), currency)}
                    </p>
                    <p className="text-[11.5px] text-[var(--color-faint)]">onboarding — quotable</p>
                  </div>
                </div>

                {/* Growth Plan: greyed, captioned, never selectable as a price. */}
                {p.growthPlanMonthly && (
                  <div className="mt-3 rounded-lg border border-[var(--color-line)] bg-white/[0.02] px-3 py-2.5 opacity-60">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[12.5px] text-[var(--color-faint)]">Growth Plan (monthly)</span>
                      <span className="text-[13.5px] font-semibold text-[var(--color-faint)] line-through decoration-1">
                        {formatMoney(BigInt(p.growthPlanMonthly), currency)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--color-faint)]">{GROWTH_PLAN_CAPTION}</p>
                  </div>
                )}

                {p.guardrails.length > 0 && (
                  <ul className="mt-3 grid gap-1">
                    {p.guardrails.map((g) => (
                      <li key={g} className="flex gap-2 text-[12.5px] leading-[1.5] text-[var(--color-muted)]">
                        <Icon name="check" className="mt-0.5 shrink-0 text-[15px] text-[var(--color-brand-soft)]" />
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-[12px] text-[var(--color-faint)]">
                  {SCHEDULE_LABEL[p.billingSchedule] ?? p.billingSchedule}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="card lg:sticky lg:top-6">
          <h2 className="mb-3.5 text-[15px] font-bold text-white">Your commission on this deal</h2>

          {!chosen ? (
            <p className="text-[13.5px] text-[var(--color-muted)]">Pick a package to see what it earns you.</p>
          ) : (
            <>
              <dl className="grid gap-2.5 text-[13.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-muted)]">Base (onboarding fee)</dt>
                  <dd className="font-semibold text-white">{formatMoney(BigInt(chosen.onboardingFee), currency)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-muted)]">Your rate</dt>
                  <dd className="font-semibold text-white">{rateBp === null ? "—" : formatRate(rateBp)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2.5">
                  <dt className="text-white">You earn</dt>
                  <dd className="text-[22px] font-extrabold leading-none text-white">
                    {commission === null ? "—" : formatMoney(commission, currency)}
                  </dd>
                </div>
              </dl>

              {chosen.growthPlanMonthly && (
                <div className="mt-3 flex justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-white/[0.02] px-3 py-2.5 text-[12.5px] opacity-60">
                  <span className="text-[var(--color-faint)]">Growth Plan {formatMoney(BigInt(chosen.growthPlanMonthly), currency)}/mo</span>
                  <span className="shrink-0 text-[var(--color-faint)]">{GROWTH_PLAN_LABEL}</span>
                </div>
              )}

              <p className="mt-4 text-[12px] leading-[1.55] text-[var(--color-faint)]">
                Commission is calculated on the onboarding fee only. It is confirmed when the deal is won and becomes
                payable as the client pays.
              </p>

              {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

              <button onClick={save} disabled={busy} className="btn-primary mt-4 w-full justify-center text-[13.5px] disabled:opacity-50">
                {busy ? "Saving…" : selectedId === chosen.id ? "Keep this package" : "Attach this package"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
