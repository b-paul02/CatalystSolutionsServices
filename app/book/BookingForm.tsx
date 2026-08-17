"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/Icon";
import { useMarket } from "@/components/Market";
import { programBySlug, isBookable, setupAmount, processingFeeRate, bookableAddOns, maintenanceNote } from "@/lib/programs";

const fmt = (n: number, market: "in" | "us") => {
  const opts = n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined;
  return market === "in" ? `₹${n.toLocaleString("en-IN", opts)}` : `$${n.toLocaleString("en-US", opts)}`;
};

export default function BookingForm({ slug, tierIndex, canceled }: { slug: string; tierIndex: number; canceled: boolean }) {
  const market = useMarket();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const [maintenance, setMaintenance] = useState(false); // opt-in, never billed at checkout
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = programBySlug[slug];
  const tier = program?.tiers[tierIndex];

  if (!program || !tier || !isBookable(tier)) {
    return (
      <section className="px-5 py-24 text-center sm:px-8">
        <h1 className="mb-4 text-3xl font-bold text-white">This package can't be booked online</h1>
        <p className="mb-8 text-[15px] text-[var(--color-muted)]">Pick a tier from an industry program, or book a call and we'll scope it together.</p>
        <div className="flex justify-center gap-4">
          <Link href="/industries" className="btn-ghost">Browse Programs</Link>
          <Link href="/contact" className="btn-primary">Book a Call</Link>
        </div>
      </section>
    );
  }

  const chosen = bookableAddOns.filter((a) => selected.includes(a.name));
  const total = market ? setupAmount(tier.setup![market]) : null;
  const due = total !== null ? total / 2 : null;
  const addOnOneTime = market ? chosen.reduce((s, a) => s + (a.setup?.[market] ?? 0), 0) : 0;
  const addOnMonthly = market ? chosen.reduce((s, a) => s + (a.monthly?.[market] ?? 0), 0) : 0;
  const feeRate = market ? processingFeeRate[market] : 0;
  const chargedBase = due !== null ? due + addOnOneTime : null;
  const fee = chargedBase !== null ? Math.round(chargedBase * feeRate * 100) / 100 : null;
  const payNow = chargedBase !== null && fee !== null ? chargedBase + fee : null;

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!market) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tier: tierIndex, market, addOns: selected, maintenance, ...form }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Something went wrong. Please try again.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const input =
    "w-full rounded-xl border border-[var(--color-line)] bg-white/[0.04] px-4 py-3 text-[14.5px] text-white placeholder:text-[var(--color-faint)] focus:border-[rgba(168,85,247,0.6)] focus:outline-none";

  return (
    <section className="relative overflow-hidden px-5 py-16 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(124,58,237,0.2),transparent_62%)]" />
      <div className="relative mx-auto max-w-[980px]">
        <nav className="mb-[26px] flex items-center gap-2 text-[13px] text-[var(--color-faint)]" aria-label="Breadcrumb">
          <Link href="/industries" className="hover:text-[var(--color-brand-soft)]">Industries</Link>
          <Icon name="chevron_right" className="text-[16px]" />
          <Link href={`/bundles/${program.slug}`} className="hover:text-[var(--color-brand-soft)]">{program.name}</Link>
          <Icon name="chevron_right" className="text-[16px]" />
          <span className="text-[var(--color-brand-soft)]">Book</span>
        </nav>

        <h1 className="mb-3 text-[clamp(1.9rem,5vw,40px)] font-extrabold tracking-[-0.025em] text-white">Book {program.name} — {tier.label}: {tier.name}</h1>
        <p className="mb-10 max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--color-muted)]">
          Pay 50% of the onboarding fee to secure your start. The balance is due at launch. Monthly maintenance is optional — add it below to lock today's rate.
        </p>

        {canceled && (
          <p className="mb-6 rounded-xl border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] px-4 py-3 text-[13.5px] text-[#FBBF24]">
            Payment was canceled — nothing was charged. You can try again whenever you're ready.
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr]">
          {/* FORM */}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <input className={input} required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} required type="tel" placeholder="Phone / WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder="Business / clinic / firm name (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />

            {/* MONTHLY MAINTENANCE — opt-in, priced from the tier, not charged today */}
            {tier.monthly && (
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${maintenance ? "border-[rgba(168,85,247,0.5)] bg-[rgba(124,58,237,0.12)]" : "border-[var(--color-line)] bg-white/[0.02]"}`}>
                <input type="checkbox" checked={maintenance} onChange={() => setMaintenance((m) => !m)} className="mt-[3px] h-4 w-4 accent-[#7C3AED]" />
                <span>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13.5px] font-semibold text-white">Add monthly maintenance</span>
                    <span className="text-[13px] font-semibold text-[var(--color-brand-soft)]">{market ? `${tier.monthly[market]}` : "…"}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-[var(--color-faint)]">
                    Ongoing managed service — content, campaigns, reporting and optimization. Billed monthly in advance from kickoff, not charged today. {maintenanceNote}
                  </span>
                </span>
              </label>
            )}

            {/* ADD-ONS */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white/[0.02]">
              <div className="border-b border-white/5 px-4 py-3">
                <div className="text-[13px] font-semibold text-white">Add-ons <span className="font-normal text-[var(--color-faint)]">(optional)</span></div>
                <div className="mt-0.5 text-[12px] leading-[1.5] text-[var(--color-faint)]">One-time add-ons are charged in full at booking. Monthly add-ons are billed with your managed service from kickoff.</div>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2">
                {bookableAddOns.map((a) => {
                  const checked = selected.includes(a.name);
                  return (
                    <label key={a.name} className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.04] ${checked ? "bg-[rgba(124,58,237,0.12)]" : ""}`}>
                      <span className="flex items-start gap-2.5">
                        <input type="checkbox" checked={checked} onChange={() => toggle(a.name)} className="mt-[3px] h-4 w-4 accent-[#7C3AED]" />
                        <span className="text-[13px] leading-[1.45] text-[var(--color-fg)]">{a.name}</span>
                      </span>
                      <span className="shrink-0 text-right text-[12.5px] font-semibold text-[var(--color-brand-soft)]">
                        {market
                          ? a.setup
                            ? `${fmt(a.setup[market], market)}${a.monthly ? ` + ${fmt(a.monthly[market], market)}/mo` : ""}`
                            : `${fmt(a.monthly![market], market)}/mo`
                          : "…"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-[13.5px] text-[#FCA5A5]">{error}</p>}
            <button type="submit" disabled={submitting || !market} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Redirecting to secure payment…" : payNow !== null ? `Pay ${fmt(payNow, market!)} securely` : "Loading…"}
              <Icon name="lock" className="text-[17px]" />
            </button>
            <p className="text-[12.5px] leading-[1.55] text-[var(--color-faint)]">
              Pay securely by card or Google Pay — processed by Stripe. Prices are exclusive of applicable taxes. By booking you agree to the program's standard term — {program.termLine}
            </p>
          </form>

          {/* ORDER SUMMARY */}
          <div className="h-fit rounded-2xl border border-[rgba(168,85,247,0.28)] bg-[linear-gradient(155deg,rgba(30,20,55,0.85),rgba(12,10,24,0.85))] p-[26px]">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Booking Summary</div>
            <div className="mb-4 flex flex-col gap-2 border-b border-white/5 pb-4 text-[14px] text-[var(--color-fg)]">
              <div className="flex justify-between gap-3"><span className="text-[var(--color-faint)]">Program</span><span className="text-right font-semibold">{program.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--color-faint)]">Package</span><span className="text-right font-semibold">{tier.label}: {tier.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--color-faint)]">{tier.setupLabel ?? "Onboarding"}</span><span className="font-semibold">{total !== null ? fmt(total, market!) : "—"}</span></div>
            </div>
            <div className="mb-1 flex items-baseline justify-between text-[13.5px] text-[var(--color-muted)]">
              <span>Deposit (50%)</span>
              <span>{due !== null ? fmt(due, market!) : "—"}</span>
            </div>
            {chosen.filter((a) => a.setup).map((a) => (
              <div key={a.name} className="mb-1 flex items-baseline justify-between gap-3 text-[13px] text-[var(--color-muted)]">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0">{market ? fmt(a.setup![market], market) : "—"}</span>
              </div>
            ))}
            <div className="mb-2 flex items-baseline justify-between text-[13.5px] text-[var(--color-muted)]">
              <span>Payment processing fee ({(feeRate * 100).toFixed(0)}%)</span>
              <span>{fee !== null ? fmt(fee, market!) : "—"}</span>
            </div>
            <div className="mb-1 flex items-baseline justify-between border-t border-white/5 pt-2">
              <span className="text-[13.5px] text-[var(--color-muted)]">Total due now</span>
              <span className="text-[24px] font-extrabold text-white">{payNow !== null ? fmt(payNow, market!) : "—"}</span>
            </div>
            <div className="mb-1 flex items-baseline justify-between text-[13px] text-[var(--color-faint)]">
              <span>Balance at launch</span>
              <span>{due !== null ? fmt(due, market!) : "—"}</span>
            </div>
            {maintenance && tier.monthly && market && (
              <div className="mb-1 flex items-baseline justify-between text-[13px] text-[var(--color-brand-soft)]">
                <span>Maintenance from kickoff</span>
                <span>{tier.monthly[market]}</span>
              </div>
            )}
            {addOnMonthly > 0 && market && (
              <div className="mb-1 flex items-baseline justify-between text-[13px] text-[var(--color-brand-soft)]">
                <span>Monthly add-ons from kickoff</span>
                <span>{fmt(addOnMonthly, market)}/mo</span>
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-4 text-[12.5px] leading-[1.5] text-[var(--color-faint)]">
              <li className="flex gap-2"><Icon name="autorenew" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />{maintenance ? "Maintenance starts at kickoff, billed monthly in advance at the rate locked today." : "Maintenance is optional — adding it later costs 15% more."}</li>
              <li className="flex gap-2"><Icon name="fact_check" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />Starts with your Growth Audit and a live tracking dashboard.</li>
              <li className="flex gap-2"><Icon name="campaign" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />Ad/media budgets are always paid directly by you, never marked up.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
