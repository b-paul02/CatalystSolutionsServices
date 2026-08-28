"use client";

// Apollo-style B2B discovery: filter rail, masked results, reveal with token
// cost preview, saved searches, exclusion list.
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  addExclusion, deleteSavedSearch, doReveal, previewReveal, removeExclusion, runSearch, saveSearch,
} from "./actions";
import type { FormState } from "../../(auth)/actions";
import type { B2bSearchFilters, B2bSearchHit } from "@/lib/leados/b2bDiscovery";
import { Badge, Card, FormNotice, GhostButton, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function DiscoverClient(props: {
  canReveal: boolean;
  inventoryCount: number;
  savedSearches: { id: string; name: string; filters: string; alert: boolean }[];
  exclusions: { id: string; domain: string }[];
}) {
  const [filters, setFilters] = useState<B2bSearchFilters>({});
  const [hits, setHits] = useState<B2bSearchHit[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ perRecord: number; total: number; balance: number; alreadyRevealed: number } | null>(null);
  const [pending, start] = useTransition();
  const [saveState, saveAction] = useActionState<FormState, FormData>(saveSearch, {});
  const [exclState, exclAction] = useActionState<FormState, FormData>(addExclusion, {});

  const search = (f: B2bSearchFilters) =>
    start(async () => {
      setHits(await runSearch(f));
      setSelected(new Set());
      setPreview(null);
    });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setPreview(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight">B2B Discovery</h1>
        <span className="text-[13px] text-[var(--los-muted)]">{props.inventoryCount.toLocaleString()} verified contacts in inventory</span>
      </div>
      <p className="mb-4 text-[13px] text-[var(--los-faint)]">
        Search the verified B2B inventory. Contacts are masked until revealed — one token charge per contact, forever yours.
      </p>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* filter rail */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div><Label>Keyword</Label><Input value={filters.q ?? ""} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="name, title, company" /></div>
            <div><Label>Job title</Label><Input value={filters.title ?? ""} onChange={(e) => setFilters({ ...filters, title: e.target.value })} placeholder="founder, marketing head" /></div>
            <div><Label>Country</Label><Input value={filters.country ?? ""} onChange={(e) => setFilters({ ...filters, country: e.target.value })} /></div>
            <div><Label>City</Label><Input value={filters.city ?? ""} onChange={(e) => setFilters({ ...filters, city: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={filters.hasEmail ?? false} onChange={(e) => setFilters({ ...filters, hasEmail: e.target.checked || undefined })} /> Has email</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={filters.hasPhone ?? false} onChange={(e) => setFilters({ ...filters, hasPhone: e.target.checked || undefined })} /> Has phone</label>
            <button onClick={() => search(filters)} disabled={pending} className="w-full rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">
              {pending ? "Searching…" : "Search"}
            </button>
            <form action={saveAction} className="space-y-2 border-t border-[var(--los-line)] pt-3">
              <FormNotice state={saveState} />
              <input type="hidden" name="filters" value={JSON.stringify(filters)} />
              <Input name="name" placeholder="Save this search as…" />
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--los-muted)]"><input type="checkbox" name="alert" /> Alert me on new results</label>
              <SubmitButton className="w-full !py-1.5 text-[13px]">Save search</SubmitButton>
            </form>
          </Card>

          {props.savedSearches.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-[13.5px] font-bold">Saved searches</div>
              <ul className="space-y-1.5 text-[13px]">
                {props.savedSearches.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button className="text-[var(--los-brand)] hover:underline" onClick={() => { const f = JSON.parse(s.filters); setFilters(f); search(f); }}>
                      {s.name}
                    </button>
                    {s.alert && <Badge tone="warn">alert</Badge>}
                    <button className="ml-auto text-[11.5px] text-[var(--los-danger)]" onClick={() => start(() => deleteSavedSearch(s.id))}>✕</button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-2 text-[13.5px] font-bold">Excluded domains</div>
            <form action={exclAction} className="mb-2 flex gap-2">
              <FormNotice state={exclState} />
              <Input name="domain" placeholder="competitor.com" className="!py-1.5 text-[13px]" />
              <SubmitButton className="!px-3 !py-1.5 text-[13px]">Add</SubmitButton>
            </form>
            <ul className="space-y-1 text-[12.5px] text-[var(--los-muted)]">
              {props.exclusions.map((e) => (
                <li key={e.id} className="flex items-center justify-between">
                  {e.domain}
                  <button className="text-[var(--los-danger)]" onClick={() => start(() => removeExclusion(e.id))}>✕</button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* results */}
        <div className="space-y-3">
          {props.canReveal && selected.size > 0 && (
            <Card className="flex flex-wrap items-center gap-3 p-3 text-[13.5px]">
              <span className="font-semibold">{selected.size} selected</span>
              {preview ? (
                <>
                  <span>
                    Cost: <strong>{preview.total} tokens</strong> ({preview.perRecord}/contact
                    {preview.alreadyRevealed > 0 ? `, ${preview.alreadyRevealed} already revealed — free` : ""}) · balance {preview.balance.toLocaleString()}
                  </span>
                  <button
                    disabled={pending || preview.total > preview.balance}
                    onClick={() =>
                      start(async () => {
                        await doReveal([...selected]);
                        await search(filters);
                      })
                    }
                    className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                  >
                    {preview.total > preview.balance ? "Not enough tokens" : "Confirm reveal"}
                  </button>
                </>
              ) : (
                <GhostButton disabled={pending} onClick={() => start(async () => setPreview(await previewReveal([...selected])))} className="!px-3 !py-1.5">
                  Preview cost
                </GhostButton>
              )}
            </Card>
          )}

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--los-line)] bg-[var(--los-surface-2)] text-[12px] uppercase tracking-wide text-[var(--los-muted)]">
                  {props.canReveal && <th className="px-3 py-2.5" />}
                  <th className="px-3 py-2.5 font-semibold">Person</th>
                  <th className="px-3 py-2.5 font-semibold">Title</th>
                  <th className="px-3 py-2.5 font-semibold">Company</th>
                  <th className="px-3 py-2.5 font-semibold">Location</th>
                  <th className="px-3 py-2.5 font-semibold">Contact</th>
                  <th className="px-3 py-2.5 font-semibold">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--los-line)]">
                {(hits ?? []).map((h) => (
                  <tr key={h.recordId} className="hover:bg-[var(--los-surface-2)]">
                    {props.canReveal && (
                      <td className="px-3 py-2.5">
                        {!h.revealed && <input type="checkbox" checked={selected.has(h.recordId)} onChange={() => toggle(h.recordId)} />}
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-medium">
                      {h.revealed?.leadId ? (
                        <Link href={`/app/leads/${h.revealed.leadId}`} className="text-[var(--los-brand)] hover:underline">
                          {h.firstName} {h.lastNameInitial}
                        </Link>
                      ) : (
                        <>{h.firstName} {h.lastNameInitial}</>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--los-muted)]">{h.jobTitle ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--los-muted)]">
                      {h.companyName ?? "—"}
                      {h.companyDomain && <span className="ml-1 text-[11.5px] text-[var(--los-faint)]">{h.companyDomain}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--los-muted)]">{[h.city, h.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5">
                      {h.revealed ? (
                        <span className="text-[12.5px]">
                          {h.revealed.email ?? ""} {h.revealed.phone ?? ""}
                        </span>
                      ) : (
                        <span className="space-x-1">
                          {h.hasEmail && <Badge>email ✓</Badge>}
                          {h.hasPhone && <Badge>phone ✓</Badge>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={h.qualityScore >= 70 ? "success" : "neutral"}>{h.qualityScore}</Badge>
                      <span className="ml-1 text-[11.5px] text-[var(--los-faint)]">{h.freshnessDays}d old</span>
                    </td>
                  </tr>
                ))}
                {hits !== null && hits.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--los-faint)]">No matches — loosen the filters.</td></tr>
                )}
                {hits === null && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--los-faint)]">Run a search to see contacts.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
