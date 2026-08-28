"use client";

// Frames a rebranded template (served from /demo-sites/<slug>/) with a tier
// switcher. The tier is passed INTO the site via ?tier=n — the injected tier
// layer inside the page turns widgets on/off, so the site itself visibly
// changes and full-screen behaves identically. This wrapper explains the tier;
// the page demonstrates it.

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { widgetCopy, widgetsUpTo, lockedWidgets, type DemoSite } from "@/lib/proof";

type Props = { site: DemoSite; initialTier: number; prices: (string | null)[] };

export default function SiteFrame({ site, initialTier, prices }: Props) {
  const [tier, setTier] = useState(Math.min(Math.max(initialTier, 0), site.tiers.length - 1));

  const active = widgetsUpTo(site, tier);
  const locked = lockedWidgets(site, tier);
  const current = site.tiers[tier];
  const single = site.tiers.length === 1;
  const siteUrl = `/demo-sites/${site.slug}/index.html?tier=${tier + 1}`;

  return (
    <>
      {/* ---------- demo banner + tier switcher ---------- */}
      <div className="sticky top-[73px] z-40 border-b border-[rgba(168,85,247,0.3)] bg-[#16122a]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 sm:px-8">
          <span className="flex items-center gap-2 text-[12.5px] text-[var(--color-brand-soft)]">
            <Icon name="theater_comedy" className="text-[16px]" />
            <span>
              <strong>{site.brand}</strong> is a fictional demo — {site.programName} spec
            </span>
          </span>

          {!single && (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[var(--color-faint)]">Viewing as</span>
              <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                {site.tiers.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setTier(i)}
                    aria-pressed={tier === i}
                    className={`rounded-[6px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      tier === i ? "bg-[var(--color-brand-strong)] text-white" : "text-[var(--color-muted)] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-4 text-[12.5px] font-semibold">
            <Link href={`/bundles/${site.programSlug}`} className="text-[var(--color-brand-soft)] hover:text-white">
              Pricing &amp; tiers →
            </Link>
            <Link href="/proof" className="hidden text-[var(--color-faint)] hover:text-white sm:inline">
              All proof
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- what this tier turns on ---------- */}
      <section className="px-5 pb-6 pt-8 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[19px] font-bold text-white">{single ? current.name : `${current.label} — ${current.name}`}</h2>
            {prices[tier] && <span className="text-[13.5px] font-semibold text-[var(--color-brand-soft)]">{prices[tier]} onboarding</span>}
          </div>
          <p className="mb-5 max-w-[720px] text-[14px] leading-[1.6] text-[var(--color-muted)]">{current.blurb}</p>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            {/* included at this tier */}
            <div className="card p-5">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">
                {tier > 0 ? "Everything below, plus:" : "What this tier includes"}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {current.adds.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--color-muted)]">
                    <span className="mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]">
                      <Icon name="check" className="text-[12px]" />
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            {/* live widgets + locked upgrades — mirrors what's inside the frame */}
            <div className="card p-5">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">Live on the site below — click them in the page</div>
              {active.length === 0 && (
                <p className="mb-3 text-[13px] leading-[1.55] text-[var(--color-faint)]">
                  Nothing automated yet — {current.label} is presence. The site is built, found and contactable, but a human still answers
                  everything. Try submitting its enquiry form and see.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {active.map((w) => (
                  <span
                    key={w}
                    title={widgetCopy[w].desc}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.1)] px-3 py-1.5 text-[12px] font-semibold text-[#6EE7B7]"
                  >
                    <Icon name={widgetCopy[w].icon} className="text-[14px]" />
                    {widgetCopy[w].name}
                  </span>
                ))}
              </div>

              {locked.length > 0 && (
                <>
                  <div className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-faint)]">Locked — unlocks when you upgrade</div>
                  <div className="flex flex-wrap gap-2">
                    {locked.map(({ widget, tier: t }) => (
                      <span
                        key={widget}
                        title={widgetCopy[widget].desc}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-[var(--color-faint)]"
                      >
                        <Icon name="lock" className="text-[13px]" />
                        {widgetCopy[widget].name}
                        <span className="text-[11px] text-[var(--color-brand-soft)]">{t.label}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- the demo site itself (tier passed into the page) ---------- */}
      <section className="px-5 pb-10 sm:px-8">
        <div className="relative mx-auto max-w-[1240px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_0_60px_rgba(0,0,0,0.5)]">
            {/* browser chrome, so it reads as a real site rather than part of this page */}
            <div className="flex items-center gap-2 border-b border-black/10 bg-[#e9ecf1] px-4 py-2.5">
              <span className="flex gap-1.5">
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} className="h-[10px] w-[10px] rounded-full" style={{ background: c }} />
                ))}
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11.5px] text-[#5b6472]">
                <Icon name="lock" className="text-[12px]" />
                www.{site.slug.replace(/-/g, "")}.demo — {current.label}
              </span>
            </div>
            <iframe
              key={siteUrl}
              src={siteUrl}
              title={`${site.brand} demo website at ${current.label}`}
              className="block h-[70vh] min-h-[520px] w-full border-0 bg-white"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
            />
          </div>

          <p className="mt-3 text-center text-[12px] text-[var(--color-faint)]">
            Scroll inside the frame and click the widgets — they change with the tier.{" "}
            <a href={siteUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--color-brand-soft)] hover:text-white">
              Open full-screen at {current.label} ↗
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
