import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Become a Sales Partner",
  description:
    "Sell Catalyst onboarding engagements and earn commission on every one you close. Apply to join the Catalyst partner network.",
};

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

export default function PartnersPage() {
  return (
    <>
      <PageHero
        badge="Partner network"
        title="Sell Catalyst engagements. Earn on every one you close."
        subtitle="We are looking for a small number of people who already sell to businesses and want a serious product behind them. You bring the relationship — we build the work."
      />

      <section className="px-5 pb-6 sm:px-8">
        <div className="mx-auto grid max-w-[1000px] gap-4 sm:grid-cols-3">
          {TERMS.map((t) => (
            <div key={t.label} className="card text-center">
              <p className="label mb-2">{t.label}</p>
              <p className="mb-2 text-[34px] font-extrabold leading-none text-white">{t.value}</p>
              <p className="text-[13px] leading-[1.55] text-[var(--color-faint)]">{t.note}</p>
            </div>
          ))}
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
            Applications are read by hand, usually within five working days. The form takes about ten minutes and saves as you go.
          </p>
          <Link href="/partners/apply" className="btn-primary mt-6 w-full sm:w-auto">
            Apply to become a partner <Icon name="arrow_forward" className="text-[19px]" />
          </Link>
        </div>
      </section>
    </>
  );
}
