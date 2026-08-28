"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@/lib/partner/money";
import { approveCustomPriceRequestAction, declineCustomPriceRequestAction, setCustomPriceAction } from "./actions";

export default function CustomPriceControl({ dealId, currency, isCustom, requested, requestNote }: {
  dealId: string;
  currency: Currency;
  isCustom: boolean;
  /** The partner's pending proposal, formatted — null when there is none. */
  requested: string | null;
  requestNote: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try {
      await fn();
      setOpen(false); setDeclining(false);
      setAmount(""); setReason(""); setDeclineReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="grid max-w-[260px] gap-2">
      {error && <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-300">{error}</p>}

      {/* A pending partner proposal takes visual priority over everything else. */}
      {requested && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12.5px]">
          <p className="font-semibold text-amber-300">Partner requests {requested}</p>
          {requestNote && <p className="mt-1 leading-[1.5] text-[var(--color-muted)]">“{requestNote}”</p>}
          {!declining ? (
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={() => run(() => approveCustomPriceRequestAction(dealId))} disabled={busy}
                      className="btn-primary flex-1 justify-center px-2 py-1.5 text-[12px] disabled:opacity-50">
                {busy ? "Working…" : "Approve"}
              </button>
              <button onClick={() => setDeclining(true)} disabled={busy}
                      className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10">
                Decline
              </button>
            </div>
          ) : (
            <div className="mt-2.5 grid gap-2">
              <textarea className="field resize-y py-1 text-[12px]" rows={2} placeholder="Why? The partner reads this."
                        value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
              <div className="flex items-center gap-2">
                <button onClick={() => run(() => declineCustomPriceRequestAction(dealId, declineReason))}
                        disabled={busy || declineReason.trim().length < 10}
                        className="flex-1 rounded-lg border border-red-500/30 px-2 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                  {busy ? "Working…" : "Confirm decline"}
                </button>
                <button onClick={() => setDeclining(false)} disabled={busy}
                        className="text-[12px] text-[var(--color-muted)] hover:text-white">Back</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} className="text-left text-[12.5px] text-[var(--color-brand-soft)] hover:underline">
          {isCustom ? "Change custom price" : "Set custom price"}
        </button>
      ) : (
        <div className="grid gap-2 rounded-xl border border-[var(--color-line)] bg-black/30 p-3 text-[12.5px]">
          <label className="label text-[11px]">Onboarding fee ({currency})</label>
          <input className="field h-[34px] py-1" inputMode="numeric" value={amount}
                 onChange={(e) => setAmount(e.target.value)} placeholder={currency === "INR" ? "250000" : "12000"} />
          <label className="label text-[11px]">Reason (required, audited)</label>
          <textarea className="field resize-y py-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-[11px] leading-[1.45] text-[var(--color-faint)]">
            Replaces the price-book fee for this deal only. The partner sees it read-only; their commission is calculated on it.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => run(() => setCustomPriceAction(dealId, amount, reason))}
                    disabled={busy || !amount.trim() || reason.trim().length < 10}
                    className="btn-primary flex-1 justify-center px-2 py-1.5 text-[12px] disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="text-[12px] text-[var(--color-muted)] hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
