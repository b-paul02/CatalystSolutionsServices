"use client";

import { useActionState } from "react";
import { addSuppression } from "../actions";
import type { FormState } from "@/app/app/(auth)/actions";

export default function SuppressionForm() {
  const [state, action] = useActionState<FormState, FormData>(addSuppression, {});
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 !p-4 text-[13.5px]">
      {state.error && <p className="w-full text-red-400">{state.error}</p>}
      {state.ok && <p className="w-full text-[var(--color-success)]">{state.ok}</p>}
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] text-[var(--color-muted)]">Email</span>
        <input name="email" type="email" className="w-[220px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] text-[var(--color-muted)]">Phone</span>
        <input name="phone" className="w-[180px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] text-[var(--color-muted)]">Note</span>
        <input name="note" className="w-[260px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" />
      </label>
      <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Suppress globally</button>
    </form>
  );
}
