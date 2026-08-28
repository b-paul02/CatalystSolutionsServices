import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import Market from "@/components/Market";
import { addOns, strategic, commercialRules } from "@/lib/programs";

export const metadata: Metadata = {
  title: "Add-Ons & Strategic Partnerships",
  description: "Extend any Catalyst industry program with add-ons, or scale into a blueprint-first Strategic Partnership.",
};

export default function AddOnsPage() {
  return (
    <>
      <PageHero
        badge="Add-Ons & Partnerships"
        title="Extend Your Program. Or Outgrow It."
        subtitle="Every industry program extends with the same add-on catalogue — and when a program stops being enough, it scales into a blueprint-first Strategic Partnership."
      />

      {/* ADD-ON CATALOGUE */}
      <section className="px-5 pt-10 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-7">
            <div className="eyebrow mb-3">Add-On Catalogue</div>
            <h2 className="h2 mb-3">Available on Every Program</h2>
            <p className="max-w-[620px] text-[15px] leading-[1.6] text-[var(--color-muted)]">Need one more location, article, dashboard, or bot than your tier covers? Add it — no tier jump required. Booking a program online? You can attach add-ons right at checkout; quote-based items and anything else can be added on your call.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {addOns.map((a) => (
              <div key={a.name} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))] px-5 py-4">
                <span className="text-[13.5px] leading-[1.45] text-[var(--color-fg)]">{a.name}</span>
                <span className="shrink-0 text-right text-[13.5px] font-bold text-[var(--color-brand-soft)]"><Market in={a.in} us={a.us} /></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STRATEGIC PARTNERSHIPS */}
      <section className="px-5 pt-20 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-10 max-w-[680px] text-center">
            <div className="eyebrow mb-3.5">Tier 4 — Strategic Partnership</div>
            <h2 className="h2 mb-4">When a Program Isn't Enough</h2>
            <p className="text-[16px] leading-[1.62] text-[var(--color-muted)]">Multi-location groups, multi-city firms, and transformation mandates get a custom hybrid engagement — always blueprint-first, never off a price card.</p>
          </div>

          {/* Blueprint-first process */}
          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {strategic.process.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))] p-6">
                <div className="mb-3 text-[28px] font-extrabold text-[rgba(168,85,247,0.4)]">{`0${i + 1}`}</div>
                <span className="icon-chip mb-3 h-[40px] w-[40px] text-[21px]"><Icon name={s.icon} /></span>
                <h3 className="mb-[7px] text-[15.5px] font-semibold text-white">{s.title}</h3>
                <p className="text-[13px] leading-[1.5] text-[var(--color-faint)]">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Engagement bands — starting-from only, no self-serve checkout */}
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {strategic.bands.map((b) => (
              <div key={b.name} className="flex flex-col rounded-2xl border border-[rgba(168,85,247,0.28)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] p-6">
                <h3 className="mb-3 text-[16px] font-bold text-white">{b.name}</h3>
                <div className="mb-1 text-[12px] text-[var(--color-faint)]">Starting from</div>
                <div className="mb-4 text-[22px] font-extrabold text-white"><Market in={b.from.in} us={b.from.us} /><span className="ml-1 text-[12.5px] font-medium text-[var(--color-faint)]">annual value</span></div>
                <div className="mt-auto flex flex-col gap-2 border-t border-white/5 pt-3.5 text-[12.5px] text-[var(--color-muted)]">
                  <span><Icon name="schedule" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />Term: {b.term}</span>
                  <span><Icon name="architecture" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />Blueprint fee: <Market in={b.blueprint.in} us={b.blueprint.us} /></span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2 text-[13px] leading-[1.6] text-[var(--color-faint)]">
            <p><Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" /><Market in={strategic.floors.in} us={strategic.floors.us} /></p>
            <p><Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />Runs on a managed-capacity retainer, scoped in the blueprint · {strategic.governance}</p>
          </div>

          <div className="mt-9 text-center">
            <Link href="/contact" className="btn-primary">Book a Call <Icon name="arrow_forward" className="text-[19px]" /></Link>
            <p className="mt-3 text-[12.5px] text-[var(--color-faint)]">Strategic Partnerships are scoped through a paid Solution Blueprint — there's no self-serve checkout at this level.</p>
          </div>
        </div>
      </section>

      {/* COMMERCIAL RULES */}
      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1240px] rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] p-6 sm:p-8">
          <div className="eyebrow mb-2.5">How We Work, Commercially</div>
          <ul className="flex flex-col gap-3">
            {commercialRules.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
                <Icon name="gavel" className="mt-0.5 text-[16px] text-[var(--color-brand-soft)]" />
                <span>{r.text ?? <Market in={r.in!} us={r.us!} />}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CTASection
        eyebrow="Scale on your terms"
        heading="Not Sure Which Path Fits?"
        copy="Tell us where you are and we'll recommend a tier, an add-on, or a partnership conversation — whichever actually fits."
        button="Book a Call"
      />
    </>
  );
}
