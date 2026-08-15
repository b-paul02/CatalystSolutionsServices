"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { useMarket } from "@/components/Market";
import { programBySlug, isBookable, setupAmount } from "@/lib/programs";

const fmt = (n: number, market: "in" | "us") =>
  market === "in" ? `₹${n.toLocaleString("en-IN")}` : `$${n.toLocaleString("en-US")}`;

export default function BookingForm() {
  const params = useSearchParams();
  const market = useMarket();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = params.get("slug") ?? "";
  const tierIndex = Number(params.get("tier") ?? "-1");
  const canceled = params.get("canceled") === "1";
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

  const total = market ? setupAmount(tier.setup![market]) : null;
  const due = total !== null ? total / 2 : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!market) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tier: tierIndex, market, ...form }),
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
          Pay 50% of the onboarding fee to secure your start. The balance is due at launch, and the monthly managed service is scoped on your kickoff call.
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
            {error && <p className="text-[13.5px] text-[#FCA5A5]">{error}</p>}
            <button type="submit" disabled={submitting || !market} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Redirecting to secure payment…" : due !== null ? `Pay ${fmt(due, market!)} securely` : "Loading…"}
              <Icon name="lock" className="text-[17px]" />
            </button>
            <p className="text-[12.5px] leading-[1.55] text-[var(--color-faint)]">
              Payments are processed securely by Stripe. By booking you agree to the program's standard term — {program.termLine}
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
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[13.5px] text-[var(--color-muted)]">Due now (50%)</span>
              <span className="text-[24px] font-extrabold text-white">{due !== null ? fmt(due, market!) : "—"}</span>
            </div>
            <div className="mb-4 flex items-baseline justify-between text-[13px] text-[var(--color-faint)]">
              <span>Balance at launch</span>
              <span>{due !== null ? fmt(due, market!) : "—"}</span>
            </div>
            <ul className="flex flex-col gap-2 border-t border-white/5 pt-4 text-[12.5px] leading-[1.5] text-[var(--color-faint)]">
              <li className="flex gap-2"><Icon name="autorenew" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />Ongoing monthly managed service scoped on your kickoff call.</li>
              <li className="flex gap-2"><Icon name="fact_check" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />Starts with your Growth Audit and a live tracking dashboard.</li>
              <li className="flex gap-2"><Icon name="campaign" className="mt-[1px] text-[14px] text-[var(--color-brand-soft)]" />Ad/media budgets are always paid directly by you, never marked up.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
