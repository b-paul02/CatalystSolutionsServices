"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeRate, approvePendingRate } from "./rate-actions";

export type RateRow = {
  id: string; rateBp: number; effectiveFrom: string; reason: string;
  setBy: string; approved: boolean; approvedBy: string | null; createdAt: string;
};

const pct = (bp: number) => `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(2)}%`;
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function CommissionCard({
  partnerId, current, history, wonDeals, actorEmail,
}: {
  partnerId: string;
  current: RateRow | null;
  history: RateRow[];
  /** Deals already won, grouped by the rate locked onto them. */
  wonDeals: { rateBp: number; count: number }[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [ratePct, setRatePct] = useState(current ? String(current.rateBp / 100) : "30");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");

  const rateBp = Math.round(Number(ratePct) * 100);
  const rateValid = Number.isFinite(rateBp) && rateBp >= 0 && rateBp <= 5000;
  const needsSecond = rateBp > 3000;

  // Cannot be backdated past the most recent rate row.
  const floor = history.length ? history[0].effectiveFrom.slice(0, 10) : undefined;
  const dateValid = !floor || effectiveFrom >= floor;
  const reasonValid = reason.trim().length >= 10;

  const totalWon = wonDeals.reduce((a, d) => a + d.count, 0);
  const wonSummary = wonDeals.length === 1
    ? `The ${wonDeals[0].count} deal${wonDeals[0].count === 1 ? "" : "s"} already won at ${pct(wonDeals[0].rateBp)} ${wonDeals[0].count === 1 ? "is" : "are"} unaffected.`
    : `The ${totalWon} deals already won at their locked rates are unaffected.`;

  const pending = history.filter((h) => !h.approved);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await changeRate(partnerId, { rateBp, effectiveFrom, reason });
      setOpen(false); setReason("");
      router.refresh();
      if (res.needsSecondAdmin) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  async function approve(rateId: string) {
    setBusy(true); setError(null);
    try {
      await approvePendingRate(partnerId, rateId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-white">Commission</h2>
        {!open && <button onClick={() => setOpen(true)} className="btn-ghost px-3 py-1.5 text-[13px]">Change rate</button>}
      </div>

      {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      {current ? (
        <>
          <p className="text-[44px] font-extrabold leading-none text-white">{pct(current.rateBp)}</p>
          <p className="mt-2 text-[13px] text-[var(--color-muted)]">
            of the onboarding fee · effective from {longDate(current.effectiveFrom)}
          </p>
        </>
      ) : (
        <p className="text-[14px] text-amber-300">
          No rate in force. This partner cannot earn commission — or win a deal — until one is set.
        </p>
      )}

      {pending.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
          <p className="mb-2 text-[13px] font-semibold text-amber-300">Awaiting a second admin</p>
          {pending.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--color-muted)]">
              <span>{pct(p.rateBp)} from {longDate(p.effectiveFrom)} — set by {p.setBy}</span>
              {p.setBy === actorEmail ? (
                <span className="text-[12px] text-[var(--color-faint)]">You set this — another admin must approve it.</span>
              ) : (
                <button onClick={() => approve(p.id)} disabled={busy} className="btn-primary px-3 py-1.5 text-[12.5px]">Approve</button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-5 grid gap-3.5 rounded-xl border border-[var(--color-line)] bg-black/20 p-4">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-[7px]">
              <label className="label">New rate (%)</label>
              <input className="field" type="number" min={0} max={50} step={0.5} value={ratePct}
                     onChange={(e) => setRatePct(e.target.value)} />
              {!rateValid && <p className="text-[12px] text-red-300">The rate must be between 0% and 50%.</p>}
            </div>
            <div className="flex flex-col gap-[7px]">
              <label className="label">Effective from</label>
              <input className="field" type="date" value={effectiveFrom} min={floor}
                     onChange={(e) => setEffectiveFrom(e.target.value)} />
              {!dateValid && <p className="text-[12px] text-red-300">Cannot be backdated past {longDate(floor!)}.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <label className="label">Reason (required, recorded in the history)</label>
            <textarea className="field resize-y" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {!reasonValid && <p className="text-[12px] text-[var(--color-faint)]">At least 10 characters.</p>}
          </div>

          {rateValid && dateValid && (
            <p className="rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-3.5 py-2.5 text-[13px] leading-[1.6] text-[var(--color-muted)]">
              New deals won on or after <strong className="text-white">{longDate(effectiveFrom)}</strong> will pay{" "}
              <strong className="text-white">{pct(rateBp)}</strong>.{" "}
              {totalWon > 0 ? wonSummary : "No deals have been won yet, so nothing existing is affected."}
              {needsSecond && (
                <span className="mt-1.5 block text-amber-300">
                  Above 30% — this is recorded but does not take effect until a second admin approves it.
                </span>
              )}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={busy || !rateValid || !dateValid || !reasonValid}
                    className="btn-primary flex-1 justify-center text-[13.5px] disabled:opacity-50">
              {busy ? "Saving…" : "Save rate change"}
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} disabled={busy}
                    className="text-[13px] text-[var(--color-muted)] hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      <h3 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)]">History</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-[12.5px]">
          <thead className="text-[var(--color-faint)]">
            <tr>{["Rate", "Effective from", "Reason", "Set by", "When"].map((h) => (
              <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>))}</tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t border-[var(--color-line)] align-top">
                <td className="py-2 pr-3 font-semibold text-white">
                  {pct(h.rateBp)}
                  {!h.approved && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">pending</span>}
                </td>
                <td className="py-2 pr-3 text-[var(--color-muted)]">{longDate(h.effectiveFrom)}</td>
                <td className="py-2 pr-3 text-[var(--color-muted)]">{h.reason}</td>
                <td className="py-2 pr-3 text-[var(--color-muted)]">{h.setBy}</td>
                <td className="py-2 pr-3 text-[var(--color-faint)]">{new Date(h.createdAt).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-[var(--color-muted)]">No rate has been set yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] leading-[1.55] text-[var(--color-faint)]">
        Rate history is append-only — rows are never edited or deleted. Changing a rate never recalculates a commission
        that already exists: a deal locks its rate at the moment it is won.
      </p>
    </div>
  );
}
