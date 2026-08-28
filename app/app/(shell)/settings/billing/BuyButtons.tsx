"use client";

import { useState, useTransition } from "react";
import { buyTokens, subscribe } from "./actions";
import { Card } from "@/components/leados/ui";

export function TokenPackGrid({ packs, currency }: { packs: { id: string; tokens: number; label: string; amountMinor: number }[]; currency: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      {error && <p className="mb-2 text-[13px] text-[var(--los-danger)]">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {packs.map((p) => (
          <Card key={p.id} className="p-4 text-center">
            <div className="text-[13px] font-semibold text-[var(--los-muted)]">{p.label}</div>
            <div className="my-1 text-[22px] font-extrabold">{p.tokens.toLocaleString()} <span className="text-[13px] font-normal">tokens</span></div>
            <div className="mb-3 text-[14px] text-[var(--los-muted)]">{currency}{(p.amountMinor / 100).toLocaleString()}</div>
            <button
              disabled={pending}
              onClick={() => start(async () => { const r = await buyTokens(p.id); if (r?.error) setError(r.error); })}
              className="w-full rounded-lg bg-[var(--los-brand)] px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
            >
              Buy
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PackageGrid({ packages, currency, current }: {
  packages: { id: string; label: string; monthly: number | null; blurb: string; selfServe: boolean }[];
  currency: string;
  current: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      {error && <p className="mb-2 text-[13px] text-[var(--los-danger)]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <Card key={p.id} className={`p-4 ${current === p.id ? "border-[var(--los-brand)]" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-[14.5px] font-bold">{p.label}</span>
              {current === p.id && <span className="rounded-full bg-[var(--los-brand-soft)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--los-brand)]">current</span>}
            </div>
            <div className="my-1 text-[14px] text-[var(--los-muted)]">
              {p.monthly !== null ? `${currency}${(p.monthly / 100).toLocaleString()}/mo` : "Custom"}
            </div>
            <p className="mb-3 text-[12.5px] text-[var(--los-faint)]">{p.blurb}</p>
            {p.selfServe && current !== p.id ? (
              <button
                disabled={pending}
                onClick={() => start(async () => { const r = await subscribe(p.id); if (r?.error) setError(r.error); })}
                className="w-full rounded-lg border border-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-[var(--los-brand)] hover:bg-[var(--los-brand-soft)] disabled:opacity-50"
              >
                Upgrade
              </button>
            ) : !p.selfServe && current !== p.id ? (
              <a href="mailto:info@catalystsolutionservices.com?subject=LeadOS%20plan" className="block w-full rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-center text-[13px] font-medium text-[var(--los-muted)]">
                Contact us
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
