"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDealStage } from "./stage-actions";

const STAGES = [
  { value: "registered", label: "Registered" },
  { value: "qualified", label: "Qualified" },
  { value: "demo_given", label: "Demo given" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "negotiation", label: "Negotiation" },
];

export default function StagePanel({
  dealId, stage, hasPackage, closed,
}: {
  dealId: string; stage: string; hasPackage: boolean; closed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");

  async function move(next: string, reason?: string) {
    setBusy(true); setError(null);
    try {
      await setDealStage(dealId, next, reason);
      setLosing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  if (closed) {
    return (
      <div className="card">
        <h2 className="mb-2 text-[15px] font-bold text-white">Stage</h2>
        <p className="text-[14px] text-[var(--color-muted)]">This deal is {stage.replace(/_/g, " ")}.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="mb-3.5 text-[15px] font-bold text-white">Stage</h2>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      <select className="field mb-3" value={stage} disabled={busy} onChange={(e) => move(e.target.value)}>
        {STAGES.map((s) => <option key={s.value} value={s.value} className="bg-[#13101f]">{s.label}</option>)}
      </select>

      <button onClick={() => move("won")} disabled={busy || !hasPackage}
              className="btn-primary w-full justify-center text-[13.5px] disabled:opacity-50">
        {busy ? "Working…" : "Mark as won"}
      </button>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-faint)]">
        {hasPackage
          ? "Winning locks your commission rate onto this deal. A later rate change will not affect it."
          : "Attach a package from the price book before you can win this deal."}
      </p>

      {!losing ? (
        <button onClick={() => setLosing(true)} disabled={busy}
                className="mt-3 w-full text-[13px] text-[var(--color-muted)] hover:text-white">Mark as lost</button>
      ) : (
        <div className="mt-3 grid gap-2">
          <textarea className="field resize-y" rows={2} placeholder="What happened?"
                    value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => move("lost", lostReason)} disabled={busy || !lostReason.trim()}
                    className="flex-1 rounded-xl border border-red-500/30 px-3 py-2 text-[13px] text-red-300 hover:bg-red-500/10 disabled:opacity-50">
              Confirm lost
            </button>
            <button onClick={() => setLosing(false)} disabled={busy}
                    className="text-[13px] text-[var(--color-muted)] hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
