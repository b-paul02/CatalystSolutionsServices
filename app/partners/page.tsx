import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import Market from "@/components/Market";
import HeroApplyForm from "./HeroApplyForm";
import { earningsEstimate, inrShort, usdShort } from "@/lib/partner/earnings-estimate";

export const metadata: Metadata = {
  title: "Sales Partner Program",
  description:
    "Bring qualified digital opportunities to Catalyst and earn commission on the onboarding fee collected. Apply to the Catalyst Sales Partner Program.",
};

// Named exactly as on the main Services page so the two never drift apart.
const REPRESENTS = [
  "AI Strategy & Growth Consulting",
  "Website Design & Development",
  "SEO & AI Search Visibility",
  "Workflow Automation",
  "Custom Web Apps",
  "Mobile App Development",
];

const HOW = [
  { icon: "person_search", title: "You identify and qualify the opportunity", body: "You know your market. You find qualified businesses, lead the client relationship, and run the conversation." },
  { icon: "inventory_2", title: "We scope the right solution", body: "Catalyst owns pricing and scope. We work with you to shape the engagement that actually fits the client." },
  { icon: "handshake", title: "We deliver, you stay the relationship partner", body: "After the agreement is signed, Catalyst manages delivery while you remain the primary relationship partner." },
  { icon: "payments", title: "You receive commission after collection", body: "Commission is paid proportionately as Catalyst receives each client payment." },
];

const TERMS = [
  { label: "Commission", value: "30%", note: "of the collected onboarding fee, set per partner when you join" },
  { label: "Opportunity protection", value: "90 days", note: "approved opportunities are protected for 90 days from registration and may be extended while active" },
  { label: "Initial markets", value: "India & US", note: "priced independently — you work in the market you know" },
];

// The fine print the page's claims rest on, each anchored on the terms page.
const TERM_LINKS = [
  { label: "Partner Program Terms", href: "/partners/terms" },
  { label: "Commission rules", href: "/partners/terms#commission" },
  { label: "Opportunity protection", href: "/partners/terms#protection" },
  { label: "Payment timing", href: "/partners/terms#payment" },
  { label: "Taxes", href: "/partners/terms#taxes" },
  { label: "Cancellations", href: "/partners/terms#cancellations" },
  { label: "Conflict handling", href: "/partners/terms#conflicts" },
];

export default async function PartnersPage() {
  // Computed from the live price book, so the examples cannot drift from the
  // packages partners actually represent.
  const est = await earningsEstimate();

  return (
    <>
      {/* Hero: the pitch on the left, the first step of the application on the right. */}
      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_25%_0%,rgba(124,58,237,0.14),transparent_62%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="badge mb-6"><span className="badge-dot" />Sales Partner Program</span>

            <h1 className="mb-5 text-[clamp(2.1rem,5.2vw,50px)] font-extrabold leading-[1.07] tracking-[-0.03em] text-white">
              Earn commission by bringing{" "}
              <span className="bg-gradient-to-r from-[#A855F7] to-[#7C3AED] bg-clip-text text-transparent">
                qualified digital opportunities
              </span>
              .
            </h1>

            <p className="mb-4 max-w-[560px] text-[17.5px] leading-[1.6] text-[#c2c6d1]">
              Identify qualified businesses, lead the client relationship, and work with Catalyst to close the right
              solution. Catalyst handles scoping, delivery, and execution — and you earn{" "}
              <strong className="text-white">30% of the onboarding fee collected by Catalyst</strong> on every deal
              you help close.
            </p>

            <div className="mb-7 max-w-[560px] rounded-xl border border-[var(--color-line)] bg-white/[0.03] px-4 py-3.5">
              <p className="text-[14px] leading-[1.65] text-[#c2c6d1]">
                For example, a{" "}
                <Market in={inrShort(est.IN.medianFee)} us={usdShort(est.US.medianFee)} /> onboarding fee pays{" "}
                <strong className="text-white">
                  <Market in={inrShort(est.IN.perDeal)} us={usdShort(est.US.perDeal)} />
                </strong>{" "}
                in commission, and a{" "}
                <Market in={inrShort(est.IN.topFee)} us={usdShort(est.US.topFee)} /> engagement pays{" "}
                <strong className="text-white">
                  <Market in={inrShort(est.IN.topPerDeal)} us={usdShort(est.US.topPerDeal)} />
                </strong>
                .
              </p>
              <p className="mt-2 text-[12px] leading-[1.55] text-[#9a9aac]">
                Examples are illustrative, at the 30% rate from the approved partner price book shared after
                acceptance. Commission is paid after Catalyst receives the corresponding client payment and is
                subject to the <Link href="/partners/terms" className="underline hover:text-white">partner agreement</Link> and
                applicable taxes.
              </p>
            </div>

            <p className="label mb-3">Solutions you can represent:</p>
            <ul className="mb-8 grid max-w-[560px] gap-y-2 sm:grid-cols-2">
              {REPRESENTS.map((s) => (
                <li key={s} className="flex items-center gap-2 text-[15px] text-[#c2c6d1]">
                  <Icon name="check" className="shrink-0 text-[17px] text-[var(--color-brand-soft)]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>

            <div className="grid max-w-[560px] gap-4 border-t border-[var(--color-line)] pt-6 sm:grid-cols-3">
              {TERMS.map((t) => (
                <div key={t.label}>
                  <p className="text-[20px] font-extrabold leading-none text-white">{t.value}</p>
                  <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--color-brand-soft)]">{t.label}</p>
                  <p className="mt-1 text-[12.5px] leading-[1.5] text-[#9a9aac]">{t.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:sticky lg:top-8 lg:justify-self-end">
            <HeroApplyForm />
          </div>
        </div>
      </section>

      {/* A lighter section to break up the dark theme. */}
      <section className="bg-[#eef0f5] px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="mb-10 text-center text-[clamp(1.7rem,4vw,34px)] font-bold tracking-[-0.02em] text-[#16122a]">How the partnership works</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-[#dcdfe8] bg-white p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(124,58,237,0.2)] bg-[rgba(124,58,237,0.08)] text-[21px] text-[var(--color-brand-strong)]"><Icon name={s.icon} /></span>
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-strong)]">Step {i + 1}</span>
                </div>
                <h3 className="mb-2 text-[18px] font-bold text-[#16122a]">{s.title}</h3>
                <p className="text-[15px] leading-[1.6] text-[#4b4e5c]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[820px] card">
          <h2 className="mb-4 text-[22px] font-bold text-white">Who we are looking for</h2>
          <ul className="grid gap-2.5 text-[15px] leading-[1.6] text-[#c2c6d1]">
            {[
              "You have experience in B2B sales, consulting, partnerships, or client acquisition.",
              "You have an active professional network or a realistic pipeline of qualified opportunities.",
              "You work in India or the US and know that market properly.",
              "You want to own the relationship, not just pass a lead over the wall.",
            ].map((x) => (
              <li key={x} className="flex gap-2.5">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[18px] text-[var(--color-brand-soft)]" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[14px] leading-[1.6] text-[#9a9aac]">
            Applications are read by hand, usually within five working days. The application takes approximately
            eight minutes and covers your sales experience, target market, and current business network.
          </p>
          <Link href="/partners/apply" className="btn-primary glow-quiet mt-6 w-full sm:w-auto">
            Apply for the Sales Partner Program <Icon name="arrow_forward" className="text-[19px]" />
          </Link>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--color-line)] pt-4">
            {TERM_LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="text-[12.5px] text-[#9a9aac] underline-offset-2 hover:text-white hover:underline">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
