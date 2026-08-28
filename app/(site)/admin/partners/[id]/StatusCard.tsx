"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PARTNER_STATUSES, PARTNER_STATUS_EFFECTS, PARTNER_STATUS_LABELS, type PartnerStatus,
} from "@/lib/partner/partner-status";
import { changePartnerStatus } from "./status-actions";

const TONE: Record<PartnerStatus, string> = {
  pending_agreement: "bg-amber-500/15 text-amber-300",
  active: "bg-emerald-500/15 text-emerald-300",
  suspended: "bg-red-500/15 text-red-300",
  terminated: "bg-white/5 text-[var(--color-faint)]",
};

export default function StatusCard({ partnerId, status }: { partnerId: string; status: string }) {
  const router = useRouter();
  const current = status as PartnerStatus;
  const [next, setNext] = useState<PartnerStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!next) return;
    setBusy(true); setError(null);
    try {
      await changePartnerStatus(partnerId, next, reason);
      setNext(null); setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-white">Status</h2>
        <span className={`rounded px-2 py-1 text-[12px] font-semibold ${TONE[current] ?? ""}`}>
          {PARTNER_STATUS_LABELS[current] ?? status}
        </span>
      </div>
      <p className="mb-4 text-[12.5px] leading-[1.55] text-[var(--color-muted)]">
        {PARTNER_STATUS_EFFECTS[current] ?? ""}
      </p>

      {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      {next === null ? (
        <div className="flex flex-wrap gap-2">
          {PARTNER_STATUSES.filter((s) => s !== current).map((s) => (
            <button key={s} onClick={() => setNext(s)}
              className={s === "terminated"
                ? "rounded-xl border border-red-500/30 px-3 py-1.5 text-[12.5px] text-red-300 hover:bg-red-500/10"
                : "btn-ghost px-3 py-1.5 text-[12.5px]"}>
              {s === "active" ? "Mark active" : PARTNER_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-2.5 rounded-xl border border-[var(--color-line)] bg-black/20 p-3.5">
          <p className="text-[13px] text-[var(--color-muted)]">
            <strong className="text-white">{PARTNER_STATUS_LABELS[current]} → {PARTNER_STATUS_LABELS[next]}.</strong>{" "}
            {PARTNER_STATUS_EFFECTS[next]}
          </p>
          <div className="flex flex-col gap-[7px]">
            <label className="label">Reason (required, recorded in the audit log)</label>
            <textarea className="field resize-y" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy || reason.trim().length < 10}
                    className="btn-primary flex-1 justify-center text-[13px] disabled:opacity-50">
              {busy ? "Saving…" : `Confirm — ${PARTNER_STATUS_LABELS[next].toLowerCase()}`}
            </button>
            <button onClick={() => { setNext(null); setError(null); }} disabled={busy}
                    className="text-[13px] text-[var(--color-muted)] hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
