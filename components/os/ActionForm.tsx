"use client";

import { useActionState } from "react";
import { FormNotice } from "@/components/leados/ui";

type State = { error?: string; ok?: string; href?: string };

// One wrapper for every OS server-action form: pending state + inline result.
export default function ActionForm({
  action, children, submit, tone = "brand", hidden = {}, className = "", confirm,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  children?: React.ReactNode;
  submit: string;
  tone?: "brand" | "ghost" | "danger";
  hidden?: Record<string, string>;
  className?: string;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, {});
  const btn =
    tone === "brand" ? "bg-[var(--los-brand)] text-white"
    : tone === "danger" ? "border border-[var(--los-danger)] text-[var(--los-danger)]"
    : "border border-[var(--los-line)] text-[var(--los-fg)] hover:bg-[var(--los-surface-2)]";
  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button disabled={pending} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50 ${btn}`}>
        {pending ? "…" : submit}
      </button>
      {(state.error || state.ok) && <div className="mt-2" role="status"><FormNotice state={state} />{state.ok && state.href && <a href={state.href} className="mt-1 inline-block text-[13px] font-semibold text-[var(--los-brand)] underline">Open it</a>}</div>}
    </form>
  );
}
