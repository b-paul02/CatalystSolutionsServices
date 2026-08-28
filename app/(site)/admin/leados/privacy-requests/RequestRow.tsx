"use client";

import { useActionState, useState, useTransition } from "react";
import { completeAccessRequest, completeDeletionRequest, markIdentityVerified, resolvePrivacyRequest } from "../actions";
import type { FormState } from "@/app/app/(auth)/actions";

type Req = {
  id: string; kind: string; email: string | null; phone: string | null;
  status: string; details: string | null; identityVerified: boolean;
  dueAt: string; completedAt: string | null; resolutionNote: string | null; resultPackage: string | null;
};

export default function RequestRow({ request: r }: { request: Req }) {
  const [pending, start] = useTransition();
  const [state, resolveAction] = useActionState<FormState, FormData>(resolvePrivacyRequest, {});
  const [showPackage, setShowPackage] = useState(false);
  const overdue = !r.completedAt && r.dueAt < new Date().toISOString().slice(0, 10);

  return (
    <div className="card !p-4">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <span className="rounded-full bg-[rgba(124,58,237,0.2)] px-2.5 py-0.5 font-semibold uppercase text-[var(--color-brand-soft)]">{r.kind}</span>
        <span className="text-white">{r.email ?? r.phone}</span>
        <span className={overdue ? "font-bold text-red-400" : "text-[var(--color-muted)]"}>due {r.dueAt}</span>
        <span className="text-[var(--color-muted)]">status: {r.status}</span>
        {!r.identityVerified && !r.completedAt && <span className="text-amber-400">identity unverified</span>}
      </div>
      {r.details && <p className="mt-1 text-[13px] text-[var(--color-muted)]">{r.details}</p>}
      {r.resolutionNote && <p className="mt-1 text-[13px] text-[var(--color-success)]">{r.resolutionNote}</p>}
      {state.error && <p className="mt-1 text-[13px] text-red-400">{state.error}</p>}

      {!r.completedAt && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          {!r.identityVerified && (
            <button disabled={pending} onClick={() => start(() => markIdentityVerified(r.id))} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-brand)]">
              Mark identity verified
            </button>
          )}
          {r.identityVerified && r.kind === "access" && (
            <button disabled={pending} onClick={() => start(() => completeAccessRequest(r.id))} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-brand)]">
              Generate access package & complete
            </button>
          )}
          {r.identityVerified && r.kind === "deletion" && (
            <button
              disabled={pending}
              onClick={() => {
                if (confirm("Erase every matching B2C record across all tenants and suppress globally? This cannot be undone.")) {
                  start(() => completeDeletionRequest(r.id));
                }
              }}
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-red-400 hover:bg-red-500/10"
            >
              Erase data & complete
            </button>
          )}
          <form action={resolveAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <select name="outcome" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5">
              <option value="completed">Mark completed</option>
              <option value="rejected">Reject</option>
            </select>
            <input name="note" placeholder="Note / documented reason" className="w-[240px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5" />
            <button className="rounded-lg bg-[var(--color-brand-strong)] px-3 py-1.5 font-semibold text-white">Save</button>
          </form>
        </div>
      )}

      {r.resultPackage && (
        <div className="mt-3">
          <button onClick={() => setShowPackage(!showPackage)} className="text-[13px] text-[var(--color-brand-soft)]">
            {showPackage ? "Hide" : "Show"} access package
          </button>
          {showPackage && (
            <pre className="mt-2 max-h-[300px] overflow-auto rounded-lg bg-black/40 p-3 text-[12px] text-[var(--color-muted)]">
              {JSON.stringify(JSON.parse(r.resultPackage), null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
