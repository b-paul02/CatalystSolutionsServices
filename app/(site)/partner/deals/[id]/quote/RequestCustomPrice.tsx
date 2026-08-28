"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@/lib/partner/money";
import { requestCustomPriceAction } from "./actions";

/**
 * The partner proposes a price for Catalyst to review. Nothing about the deal's
 * pricing changes until staff approve — this is an ask, on the record.
 */
export default function RequestCustomPrice({ dealId, currency, pending }: {
  dealId: string;
  currency: Currency;
  /** A pending proposal, already formatted for display. */
  pending: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending) {
    return (
      <div className="card border-amber-500/30">
        <p className="text-[13.5px] font-semibold text-amber-300">Custom price requested: {pending}</p>
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--color-muted)]">
          Catalyst is reviewing your proposal. You will see the outcome in this deal's activity — until then the
          price-book packages above still apply.
        </p>
      </div>
    );
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await requestCustomPriceAction(dealId, amount, note);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      {!open ? (
        <>
          <p className="text-[13.5px] font-semibold text-white">Deal needs different pricing?</p>
          <p className="mt-1 mb-3 text-[12.5px] leading-[1.55] text-[var(--color-muted)]">
            Propose a price and Catalyst will review it. Your commission stays on whatever price is finally approved.
          </p>
          <button onClick={() => setOpen(true)} className="btn-ghost px-3 py-1.5 text-[13px]">Request a custom price</button>
        </>
      ) : (
        <div className="grid gap-2.5">
          {error && <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[12.5px] text-red-300">{error}</p>}
          <label className="label">Proposed onboarding fee ({currency})</label>
          <input className="field h-[36px] py-1" inputMode="numeric" value={amount}
                 onChange={(e) => setAmount(e.target.value)} placeholder={currency === "INR" ? "250000" : "12000"} />
          <label className="label">Why this price? (Catalyst reads this)</label>
          <textarea className="field resize-y" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={busy || !amount.trim() || note.trim().length < 10}
                    className="btn-primary flex-1 justify-center text-[13px] disabled:opacity-50">
              {busy ? "Sending…" : "Send for review"}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="text-[12.5px] text-[var(--color-muted)] hover:text-white">Cancel</button>
          </div>
          <p className="text-[11.5px] leading-[1.5] text-[var(--color-faint)]">
            This is a proposal, not a quote — nothing changes until Catalyst approves it.
          </p>
        </div>
      )}
    </div>
  );
}
