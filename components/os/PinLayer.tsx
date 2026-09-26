"use client";

import { useActionState, useState } from "react";

type Pin = { id: string; n: number; x: number; y: number; text: string };
type State = { error?: string; ok?: string };

// WP-42 · click on the preview → numbered pin + comment. Positions are percentages so any screen size lines up.
export default function PinLayer({ src, subject, subjectId, pins, canPin, addAction, resolveAction }: {
  src: string; subject: "work_item" | "variant"; subjectId: string; pins: Pin[]; canPin: boolean;
  addAction: (p: State, f: FormData) => Promise<State>; resolveAction: (p: State, f: FormData) => Promise<State>;
}) {
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [state, add, pending] = useActionState(async (p: State, f: FormData) => { const r = await addAction(p, f); if (!r.error) setDraft(null); return r; }, {});
  const [, resolve] = useActionState(resolveAction, {});
  return (
    <div className="text-[13px]">
      <div className="relative w-full overflow-hidden rounded-lg border border-[var(--los-line)]" onClick={(e) => { if (!canPin) return; const r = e.currentTarget.getBoundingClientRect(); setDraft({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }} role={canPin ? "button" : undefined} aria-label={canPin ? "Click to add a pin" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Preview" className="block w-full" />
        {pins.map((p) => <span key={p.id} title={p.text} className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--los-brand)] text-[11px] font-bold text-white shadow" style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.n}</span>)}
        {draft && <span className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--los-brand)] bg-white/80" style={{ left: `${draft.x}%`, top: `${draft.y}%` }} />}
      </div>
      {draft && (
        <form action={add} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--los-line)] p-2" onClick={(e) => e.stopPropagation()}>
          <input type="hidden" name="subject" value={subject} /><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="x" value={draft.x.toFixed(1)} /><input type="hidden" name="y" value={draft.y.toFixed(1)} />
          <input name="text" required maxLength={2000} placeholder="What should change here?" className="min-w-[200px] flex-1 rounded-lg border border-[var(--los-line)] px-3 py-2" autoFocus />
          <button disabled={pending} className="rounded-lg bg-[var(--los-brand)] px-3 py-2 font-semibold text-white">Add pin</button>
          <button type="button" onClick={() => setDraft(null)} className="px-2 py-2 text-[var(--los-muted)]">Cancel</button>
          {state.error && <span className="w-full text-[var(--los-danger)]">{state.error}</span>}
        </form>
      )}
      {pins.length > 0 && <ol className="mt-2 space-y-1">{pins.map((p) => <li key={p.id} className="flex items-start justify-between gap-2"><span><b>#{p.n}</b> {p.text}</span><form action={resolve}><input type="hidden" name="id" value={p.id} /><button className="text-[12px] text-[var(--los-muted)] underline">Resolve</button></form></li>)}</ol>}
      {canPin && !draft && <p className="mt-1 text-[12px] text-[var(--los-faint)]">Click anywhere on the preview to pin a comment. Open pins travel with “Request changes”.</p>}
    </div>
  );
}
