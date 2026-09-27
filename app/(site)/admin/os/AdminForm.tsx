"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/app/(auth)/actions";

// Dark-theme admin form wrapper (marketing-site admin styling).
export default function AdminForm({ action, submit, title, hidden = {}, children, confirm }: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submit: string; title?: string; hidden?: Record<string, string>; children?: React.ReactNode; confirm?: string;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={run} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className={title ? "card space-y-3 !p-4 text-[13.5px]" : "space-y-2 text-[13px]"}>
      {title && <div className="text-[15px] font-bold text-white">{title}</div>}
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button disabled={pending} className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{pending ? "…" : submit}</button>
      {state.error && <p className="text-red-400">{state.error}</p>}
      {state.ok && <p className="text-green-400">{state.ok}</p>}
      {state.devLink && <p className="break-all text-[12px] text-[var(--color-faint)]">Dev link (email not configured): <a className="underline" href={state.devLink}>{state.devLink}</a></p>}
    </form>
  );
}
