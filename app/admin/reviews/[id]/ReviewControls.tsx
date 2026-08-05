"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEdits, approve, reject } from "../actions";

export default function ReviewControls({ reportId, reportJson, status, token, defaultReviewer = "" }: { reportId: string; reportJson: string; status: string; token: string; defaultReviewer?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [json, setJson] = useState(() => JSON.stringify(JSON.parse(reportJson), null, 2));
  const [reviewer, setReviewer] = useState(defaultReviewer);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      setMsg(null);
      try { await fn(); setMsg(ok); router.refresh(); }
      catch (e) { setMsg((e as Error).message); }
    });

  return (
    <div className="card mb-4">
      <h2 className="mb-4 text-[15px] font-bold text-white">Review</h2>

      <label className="label mb-1.5 block">Edit report (JSON — any section, saved before approval)</label>
      <textarea className="field mb-2 min-h-[220px] font-mono text-[11.5px]" value={json} onChange={(e) => setJson(e.target.value)} />
      <button className="btn-ghost mb-5 px-4 py-2 text-[13px]" disabled={pending} onClick={() => run(() => saveEdits(reportId, json), "Edits saved.")}>
        Save edits
      </button>

      <label className="label mb-1.5 block">Your name (shown on the approval — required)</label>
      <input className="field mb-4" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer name" />

      {status !== "approved" && (
        <button className="btn-primary mb-5 w-full" disabled={pending || !reviewer.trim()} onClick={() => run(() => approve(reportId, reviewer), "Approved and emailed.")}>
          {pending ? "Working…" : "Approve & deliver"}
        </button>
      )}
      {status === "approved" && (
        <p className="mb-5 text-[13px] text-[#6EE7B7]">Approved. Shareable link: <a className="underline" href={`/growth-audit/report/${token}`} target="_blank">/growth-audit/report/{token}</a></p>
      )}

      <label className="label mb-1.5 block">Reject with reason (regenerates with the reason injected)</label>
      <textarea className="field mb-2 min-h-[64px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What must change?" />
      <button className="btn-ghost w-full border-[rgba(252,165,165,0.3)] text-[#FCA5A5]" disabled={pending || !reason.trim()}
        onClick={() => run(() => reject(reportId, reviewer, reason), "Rejected — regeneration queued (takes a few minutes; refresh later).")}>
        Reject & regenerate
      </button>

      {msg && <p className="mt-3 text-[13px] text-[var(--color-brand-soft)]">{msg}</p>}
    </div>
  );
}
