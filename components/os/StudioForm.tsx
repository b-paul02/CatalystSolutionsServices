"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { studioQuote, studioRun, type StudioState } from "@/app/app/(shell)/_os/studio";
import { field as fieldClass } from "@/components/os/bits";

type F = { name: string; label: string; help?: string; type: "text" | "textarea" | "select" | "number"; required?: boolean; max: number; options?: string[] };

// Two steps, one form: "Get quote" asks the SERVER for a price; "Run" accepts that quote. Inputs are controlled so
// they survive React's post-action form reset, and editing anything after a quote withdraws it — the server would
// refuse the changed inputs anyway (the quote is bound to their hash).
export default function StudioForm({ toolKey, fields, campaigns, sources, research, staffBilling }: { toolKey: string; fields: F[]; campaigns: { id: string; name: string }[]; sources: { id: string; title: string }[]; research: null | { credits: number }; staffBilling: null | { clientAuthorised: boolean } }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([...fields.map((f) => [f.name, f.type === "select" ? f.options![0] : ""]), ["length", "standard"], ["campaignId", ""], ["sourceIds", ""], ["research", ""], ["purpose", "internal_delivery"]]));
  const [quoted, setQuoted] = useState<string>(""); // snapshot of the values the current quote was issued for
  const [q, quoteAction, quoting] = useActionState<StudioState, FormData>(studioQuote, {});
  const [r, runAction, running] = useActionState<StudioState, FormData>(studioRun, {});
  const snapshot = JSON.stringify(values);
  useEffect(() => { if (q.quote) setQuoted(snapshot); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q.quote?.id]);
  const live = q.quote && quoted === snapshot ? q.quote : null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const refusal = r.error ? r : q.error ? q : null;

  return (
    <form className="space-y-4" aria-busy={quoting || running}>
      <input type="hidden" name="toolKey" value={toolKey} />
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={`f-${f.name}`} className="mb-1 block text-[13px] font-semibold">{f.label}{f.required && <span aria-hidden className="text-[var(--los-danger)]"> *</span>}</label>
          {f.type === "textarea" ? <textarea id={`f-${f.name}`} name={f.name} rows={f.max > 4000 ? 10 : 4} maxLength={f.max} required={f.required} value={values[f.name]} onChange={set(f.name)} aria-describedby={f.help ? `h-${f.name}` : undefined} className={fieldClass} />
            : f.type === "select" ? <select id={`f-${f.name}`} name={f.name} value={values[f.name]} onChange={set(f.name)} className={fieldClass}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
            : <input id={`f-${f.name}`} name={f.name} maxLength={f.max} required={f.required} value={values[f.name]} onChange={set(f.name)} aria-describedby={f.help ? `h-${f.name}` : undefined} className={fieldClass} />}
          {f.help && <p id={`h-${f.name}`} className="mt-1 text-[12px] text-[var(--los-faint)]">{f.help}</p>}
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-length" className="mb-1 block text-[13px] font-semibold">Output limit</label>
          <select id="f-length" name="length" value={values.length} onChange={set("length")} className={fieldClass}><option value="short">Short</option><option value="standard">Standard</option><option value="long">Long</option></select>
          <p className="mt-1 text-[12px] text-[var(--los-faint)]">A higher limit raises the maximum you can be charged. You pay for what is produced, never more than the quote.</p>
        </div>
        {campaigns.length > 0 && <div>
          <label htmlFor="f-campaign" className="mb-1 block text-[13px] font-semibold">Campaign context (optional)</label>
          <select id="f-campaign" name="campaignId" value={values.campaignId} onChange={set("campaignId")} className={fieldClass}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>}
      </div>
      {sources.length > 0 && <fieldset className="rounded-lg border border-[var(--los-line)] p-3">
        <legend className="px-1 text-[13px] font-semibold">Sources to draw on</legend>
        <input type="hidden" name="sourceIds" value={values.sourceIds} />
        <p className="mb-2 text-[12px] text-[var(--los-faint)]">Tick the ones that matter for this draft. None ticked = all saved sources. Approved claims are always included.</p>
        <div className="grid gap-1 sm:grid-cols-2">{sources.map((s) => { const on = values.sourceIds.split(",").includes(s.id); return (
          <label key={s.id} className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={on} onChange={() => setValues((v) => ({ ...v, sourceIds: (on ? v.sourceIds.split(",").filter((x) => x !== s.id) : [...v.sourceIds.split(",").filter(Boolean), s.id]).join(",") }))} /> <span className="min-w-0 truncate">{s.title}</span></label>); })}</div>
      </fieldset>}
      {research && <div className="rounded-lg border border-[var(--los-line)] p-3">
        <input type="hidden" name="research" value={values.research} />
        <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={values.research === "on"} onChange={() => setValues((v) => ({ ...v, research: v.research === "on" ? "" : "on" }))} /> <span><b>Search the web and cite sources</b>{research.credits > 0 && ` (+${research.credits} credits)`}. A real search on your topic. The draft is written from the search-result snippets (the pages themselves are not read); statements taken from them are marked [1], [2]… with links. A marker shows where a statement came from — it is not a fact-check, so open each source before publishing. If the search fails, nothing is drafted and nothing is charged.</span></label>
      </div>}
      {staffBilling && <fieldset className="rounded-lg border border-[var(--los-line)] p-3">
        <legend className="px-1 text-[13px] font-semibold">Who pays for this run</legend>
        <label className="flex items-start gap-2 text-[13px]"><input type="radio" name="purpose" value="internal_delivery" checked={values.purpose === "internal_delivery"} onChange={set("purpose")} /> <span><b>Catalyst</b> — internal delivery work. Never touches the client&apos;s credits.</span></label>
        <label className={`mt-1 flex items-start gap-2 text-[13px] ${staffBilling.clientAuthorised ? "" : "opacity-60"}`}><input type="radio" name="purpose" value="staff_assisted_client_billed" disabled={!staffBilling.clientAuthorised} checked={values.purpose === "staff_assisted_client_billed"} onChange={set("purpose")} /> <span><b>Client&apos;s credits</b> — only with the client&apos;s written authorisation{staffBilling.clientAuthorised ? " (on file)" : " (none on file)"}.</span></label>
      </fieldset>}

      <div className="flex flex-wrap items-center gap-3">
        <button formAction={quoteAction} disabled={quoting || running} className="rounded-lg border border-[var(--los-line)] px-3 py-2 text-[13px] font-semibold disabled:opacity-50">{quoting ? "Pricing…" : live ? "Re-quote" : "Get quote"}</button>
        {live && <>
          <input type="hidden" name="quoteId" value={live.id} /><input type="hidden" name="requestId" value={live.requestId} />
          <button formAction={runAction} disabled={running} className="rounded-lg bg-[var(--los-brand)] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{running ? "Starting…" : live.payer === "catalyst_internal" ? "Run (Catalyst pays)" : `Run — up to ${live.maxCredits} credits`}</button>
        </>}
      </div>
      <div aria-live="polite" className="text-[13px]">
        {live && live.payer === "client_wallet" && <p className="rounded-lg bg-[var(--los-surface-2)] px-3 py-2">Quote: <b>at most {live.maxCredits} credits</b> ({live.available} available). Held while it runs, charged on what is produced, the rest returned. Valid until {new Date(live.expiresAt).toLocaleTimeString()}.{live.synthetic && " TEST PRICES — synthetic rate card."}</p>}
        {q.quote && !live && <p className="text-[var(--los-muted)]">You changed the inputs — get a new quote.</p>}
        {refusal?.error && <div role="alert" className="rounded-lg bg-[var(--los-danger-soft)] px-3 py-2 text-[var(--los-danger)]">
          {refusal.error}
          {refusal.needCredits && <span> {refusal.needCredits.canBuy ? <Link className="font-semibold underline" href="/app/settings/ai-credits">Add credits</Link> : "Ask a workspace billing admin to add credits."} You can keep writing and editing content by hand — only AI runs need credits.</span>}
        </div>}
      </div>
    </form>
  );
}

/** Re-fetches the server component while an operation is queued or running. */
export function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), everyMs); return () => clearInterval(t); }, [router, everyMs]);
  return null;
}
