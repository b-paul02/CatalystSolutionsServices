"use client";

import { useActionState } from "react";
import { decideReplacement } from "./actions";
import type { FormState } from "@/app/app/(auth)/actions";

type Item = { id: string; reason: string; createdAt: string; planName: string; orgName: string; tokens: number };

export default function ReplacementQueue({ items }: { items: Item[] }) {
  const [state, action] = useActionState<FormState, FormData>(decideReplacement, {});
  return (
    <div className="card !p-4">
      <div className="mb-2 text-[15px] font-bold text-white">Replacement requests</div>
      {state.error && <p className="text-[13px] text-red-400">{state.error}</p>}
      {state.ok && <p className="text-[13px] text-[var(--color-success)]">{state.ok}</p>}
      <div className="space-y-2">
        {items.map((i) => (
          <form key={i.id} action={action} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/30 p-2.5 text-[13px] text-[var(--color-muted)]">
            <input type="hidden" name="id" value={i.id} />
            <span className="text-white">{i.orgName}</span>
            <span>{i.planName}</span>
            <span>“{i.reason}”</span>
            <span>{i.tokens} tokens</span>
            <span>{i.createdAt}</span>
            <select name="decision" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1">
              <option value="approve">Approve (credit tokens)</option>
              <option value="reject">Reject</option>
            </select>
            <input name="note" placeholder="Note" className="w-[180px] rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1" />
            <button className="rounded-lg bg-[var(--color-brand-strong)] px-3 py-1 font-semibold text-white">Decide</button>
          </form>
        ))}
      </div>
    </div>
  );
}
