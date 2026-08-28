"use client";

import { useActionState } from "react";
import { decideReview } from "../actions";
import type { FormState } from "@/app/app/(auth)/actions";

type Review = {
  id: string; subjectKind: string; subjectId: string; orgName: string;
  status: string; note: string | null; evidence: string | null; createdAt: string;
};

export default function ReviewRow({ review: r }: { review: Review }) {
  const [state, action] = useActionState<FormState, FormData>(decideReview, {});
  const evidence = r.evidence ? (JSON.parse(r.evidence) as Record<string, unknown>) : null;
  return (
    <div className="card !p-4 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[rgba(124,58,237,0.2)] px-2.5 py-0.5 font-semibold uppercase text-[var(--color-brand-soft)]">{r.subjectKind}</span>
        <span className="text-white">{r.orgName}</span>
        <span className="font-mono text-[12px] text-[var(--color-muted)]">{r.subjectId.slice(0, 14)}…</span>
        <span className={r.status === "pending" ? "text-amber-400" : r.status === "approved" ? "text-[var(--color-success)]" : "text-red-400"}>{r.status}</span>
        <span className="text-[var(--color-muted)]">{r.createdAt}</span>
      </div>
      {evidence && (
        <div className="mt-2 rounded-lg bg-black/30 p-2.5 text-[12.5px] text-[var(--color-muted)]">
          {Object.entries(evidence).map(([k, v]) => (
            <div key={k}><span className="text-[var(--color-faint)]">{k}:</span> {Array.isArray(v) ? v.join(", ") : String(v)}</div>
          ))}
        </div>
      )}
      {r.note && <p className="mt-1 text-[13px] text-[var(--color-muted)]">Note: {r.note}</p>}
      {state.error && <p className="mt-1 text-red-400">{state.error}</p>}
      {r.status === "pending" && (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={r.id} />
          <select name="status" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5">
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
            <option value="quarantined">Quarantine</option>
          </select>
          <input name="note" placeholder="Reason (required unless approving)" className="w-[280px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5" />
          <button className="rounded-lg bg-[var(--color-brand-strong)] px-3 py-1.5 font-semibold text-white">Decide</button>
        </form>
      )}
    </div>
  );
}
