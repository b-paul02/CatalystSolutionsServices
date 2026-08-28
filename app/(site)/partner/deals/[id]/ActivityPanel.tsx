"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logActivityAction } from "../actions";

const TYPES = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "demo_given", label: "Demo given" },
  { value: "proposal_discussed", label: "Proposal discussed" },
  { value: "custom_pricing_requested", label: "Requested custom pricing" },
  { value: "note", label: "Note" },
];

export default function ActivityPanel({ dealId, disabled }: { dealId: string; disabled: boolean }) {
  const router = useRouter();
  const [type, setType] = useState(TYPES[0].value);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await logActivityAction(dealId, type, notes);
      setNotes("");
      setDone(`Protection now runs to ${new Date(res.protectedUntil).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      })}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2 className="mb-3.5 text-[15px] font-bold text-white">Log an activity</h2>
      {disabled ? (
        <p className="text-[13.5px] text-[var(--color-muted)]">This deal is closed.</p>
      ) : (
        <>
          {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
          {done && <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">{done}</p>}

          <div className="grid gap-3">
            <div className="flex flex-col gap-[7px]">
              <label className="label">What happened</label>
              <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t.value} value={t.value} className="bg-[#13101f]">{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <label className="label">Notes</label>
              <textarea className="field resize-y" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button onClick={submit} disabled={busy} className="btn-primary w-full justify-center text-[13.5px] disabled:opacity-50">
              {busy ? "Saving…" : "Log activity"}
            </button>
            <p className="text-[12px] leading-[1.5] text-[var(--color-faint)]">
              Logging activity extends your protection on this account by 30 days.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
