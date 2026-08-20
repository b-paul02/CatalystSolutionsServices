import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import Market from "@/components/Market";
import HeroApplyForm from "./HeroApplyForm";
import {
  DEALS_PER_MONTH_HIGH, DEALS_PER_MONTH_LOW, earningsEstimate, inrShort, usdShort,
} from "@/lib/partner/earnings-estimate";

export const metadata: Metadata = {
  title: "Become a Sales Partner",
  description:
    "Sell Catalyst onboarding engagements and earn commission on every one you close. Apply to join the Catalyst partner network.",
};

// What a partner actually sells. Straight from the programme catalogue.
const SELLS = [
  "AI strategy & consulting",
  "Website design & development",
  "SEO & AI search",
  "AI automation",
  "Mobile & web apps",
  "Customer & market research",
];

const HOW = [
  { icon: "person_search", title: "You find the client", body: "You know your market. You bring the relationship and run the conversation end to end." },
  { icon: "inventory_2", title: "You pick the package", body: "Every package and price comes from our published price book. No guesswork, no negotiating — you choose the fit." },
  { icon: "handshake", title: "We deliver the work", body: "Once the client signs, our team builds and ships the engagement. You stay the relationship owner." },
  { icon: "payments", title: "You get paid on collection", body: "Commission becomes payable as the client pays. Milestone-billed deals pay you in the same slices." },
];

const TERMS = [
  { label: "Commission", value: "30%", note: "of the onboarding fee, set per partner when you join" },
  { label: "Deal protection", value: "90 days", note: "from the day you register the account, extended by activity" },
  { label: "Markets", value: "India & US", note: "priced independently — you sell in the market you know" },
];

export default async function PartnersPage() {
  // Computed from the live price book, so the headline cannot drift from the
  // packages partners actually sell.
  const est = await earningsEstimate();

  return (
    <>
      {/* Hero: the pitch on the left, the first step of the application on the right. */}
      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_25%_0%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="badge mb-6"><span className="badge-dot" />Partner network</span>

            <h1 className="mb-5 text-[clamp(2.1rem,5.2vw,50px)] font-extrabold leading-[1.07] tracking-[-0.03em] text-white">
              Earn{" "}
              <span className="bg-gradient-to-r from-[#A855F7] to-[#7C3AED] bg-clip-text text-transparent">
                <Market
                  in={`${inrShort(est.IN.yearLow)}–${inrShort(est.IN.yearHigh)}`}
                  us={`${usdShort(est.US.yearLow)}–${usdShort(est.US.yearHigh)}`}
                />
              </span>{" "}
              a year making introductions.
            </h1>

            <p className="mb-4 max-w-[560px] text-[17px] leading-[1.6] text-[var(--color-muted)]">
              Catalyst is an AI-enabled digital growth partner. You introduce businesses that need software, marketing
              or automation built properly — and earn <strong className="text-white">30% of the onboarding fee</strong> on
              every deal you close.
            </p>

            {/* The maths, in the open. An earnings claim nobody can check is worthless. */}
            <div className="mb-7 max-w-[560px] rounded-xl border border-[var(--color-line)] bg-white/[0.03] px-4 py-3.5">
              <p className="text-[13.5px] leading-[1.65] text-[var(--color-muted)]">
                That is <strong className="text-white">
                  <Market in={inrShort(est.IN.perDeal)} us={usdShort(est.US.perDeal)} />
                </strong>{" "}
                commission on a typical mid-tier engagement (
                <Market in={inrShort(est.IN.medianFee)} us={usdShort(est.US.medianFee)} /> onboarding), closing{" "}
                {DEALS_PER_MONTH_LOW}–{DEALS_PER_MONTH_HIGH} deals a month. Larger packages pay up to{" "}
                <strong className="text-white">
                  <Market in={inrShort(est.IN.topPerDeal)} us={usdShort(est.US.topPerDeal)} />
                </strong>{" "}
                on a single deal.
              </p>
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-faint)]">
                An illustration from our published price book, not a guarantee — what you earn depends on what you close.
              </p>
            </div>

            <p className="label mb-3">What you can sell:</p>
            <ul className="mb-8 grid max-w-[560px] gap-y-2 sm:grid-cols-2">
              {SELLS.map((s) => (
                <li key={s} className="flex items-center gap-2 text-[14.5px] text-[var(--color-muted)]">
                  <Icon name="check" className="shrink-0 text-[17px] text-[var(--color-brand-soft)]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>

            <div className="grid max-w-[560px] gap-4 border-t border-[var(--color-line)] pt-6 sm:grid-cols-3">
              {TERMS.map((t) => (
                <div key={t.label}>
                  <p className="text-[22px] font-extrabold leading-none text-white">{t.value}</p>
                  <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--color-brand-soft)]">{t.label}</p>
                  <p className="mt-1 text-[12px] leading-[1.5] text-[var(--color-faint)]">{t.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:sticky lg:top-8 lg:justify-self-end">
            <HeroApplyForm />
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="mb-10 text-center text-[clamp(1.7rem,4vw,34px)] font-bold tracking-[-0.02em] text-white">How the partnership works</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW.map((s, i) => (
              <div key={s.title} className="card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="icon-chip h-10 w-10 text-[21px]"><Icon name={s.icon} /></span>
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Step {i + 1}</span>
                </div>
                <h3 className="mb-2 text-[18px] font-bold text-white">{s.title}</h3>
                <p className="text-[14.5px] leading-[1.6] text-[var(--color-muted)]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-[820px] card">
          <h2 className="mb-4 text-[22px] font-bold text-white">Who we are looking for</h2>
          <ul className="grid gap-2.5 text-[14.5px] leading-[1.6] text-[var(--color-muted)]">
            {[
              "You have sold services to businesses before and can point to deals you closed.",
              "You have people to call in the next 90 days — not a plan to start cold.",
              "You sell in India or the US and know that market properly.",
              "You want to own the relationship, not just pass a lead over the wall.",
            ].map((x) => (
              <li key={x} className="flex gap-2.5">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[18px] text-[var(--color-brand-soft)]" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[13.5px] leading-[1.6] text-[var(--color-faint)]">
            Applications are read by hand, usually within five working days. The form takes about eight minutes and saves as you go.
          </p>
          <Link href="/partners/apply" className="btn-primary mt-6 w-full sm:w-auto">
            Apply to become a partner <Icon name="arrow_forward" className="text-[19px]" />
          </Link>
        </div>
      </section>
    </>
  );
}
