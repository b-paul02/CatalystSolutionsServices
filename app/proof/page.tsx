import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { samples, demoSites, fictionalNote } from "@/lib/proof";
import { programBySlug } from "@/lib/programs";

export const metadata: Metadata = {
  title: "Proof — See Exactly What You'll Get",
  description:
    "Ten demo websites, one per industry program, with live AI demos and real sample deliverables. See the work before you pay for it.",
};

export default function ProofPage() {
  return (
    <>
      <PageHero
        badge="Proof, before payment"
        title="See Exactly What You'll Get — Before You Spend a Rupee or a Dollar"
        subtitle="Every industry program has a full demo website you can browse tier by tier, live automation you can click, and real sample deliverables. All built for fictional brands — the craft is what we're showing, not borrowed logos."
      />

      {/* WHY FICTIONAL */}
      <section className="px-5 pb-6 sm:px-8">
        <div className="mx-auto max-w-[1240px] rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="icon-grad h-[44px] w-[44px] shrink-0 text-[23px]"><Icon name="theater_comedy" /></span>
            <div>
              <h2 className="mb-2 text-[19px] font-bold text-white">Why fictional brands?</h2>
              <p className="max-w-[820px] text-[14.5px] leading-[1.65] text-[var(--color-muted)]">
                Client work is confidential, and we won&apos;t dress up someone else&apos;s brand to win yours. So we invented ten
                businesses — a dental clinic, a law firm, a roofing contractor, a SaaS product and six more — and built each one a real
                website to the exact spec of its program. What you&apos;re evaluating is the craft and the systems. That part is entirely real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO SITES — the main event */}
      <section className="px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">Demo Websites</div>
          <h2 className="h2 mb-3">Ten Businesses We Invented — One Per Program</h2>
          <p className="mb-8 max-w-[680px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            Switch tiers on any of them and watch the systems light up — booking, WhatsApp automation, AI assistants, dashboards.
            Anything above the tier you&apos;re viewing shows locked, with what it costs to unlock.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demoSites.map((s) => (
              <div key={s.slug} className="card-i flex flex-col p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl text-[24px] text-white" style={{ background: s.accent }}>
                    <Icon name={s.icon} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-bold text-white">{s.brand}</div>
                    <div className="truncate text-[12.5px] text-[var(--color-faint)]">{s.business}</div>
                  </div>
                </div>
                <p className="mb-4 text-[13.5px] leading-[1.55] text-[var(--color-muted)]">{s.tagline}</p>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  {s.tiers.map((t, i) => (
                    <Link
                      key={t.label}
                      href={`/proof/sites/${s.slug}?tier=${i + 1}`}
                      className="rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.1)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--color-brand-soft)] transition-colors hover:bg-[rgba(124,58,237,0.28)] hover:text-white"
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                  <Link href={`/bundles/${s.programSlug}`} className="truncate text-[12px] text-[var(--color-faint)] hover:text-white">
                    {s.programName} →
                  </Link>
                  <Link href={`/proof/sites/${s.slug}`} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)] hover:text-white">
                    Browse <Icon name="arrow_forward" className="text-[15px]" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SAMPLES */}
      <section className="border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">Sample Deliverables</div>
          <h2 className="h2 mb-3">What Lands in Your Inbox Every Month</h2>
          <p className="mb-8 max-w-[660px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            Reports, articles, sequences and case studies — shown exactly as delivered. Each tier gets different reporting, so the
            Tier 1 report covers presence while higher tiers add conversion and cost per customer.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {samples.map((s) => (
              <Link key={s.slug} href={`/proof/samples/${s.slug}`} className="card-i flex flex-col p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="icon-chip h-[42px] w-[42px] text-[22px]"><Icon name={s.icon} /></span>
                  <span className="shrink-0 rounded-full border border-[var(--color-line)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[var(--color-muted)]">{s.type}</span>
                </div>
                <h3 className="mb-1 text-[15.5px] font-semibold text-white">{s.title}</h3>
                <div className="mb-2.5 text-[12px] text-[var(--color-brand-soft)]">{s.brand} · {s.industry}</div>
                <p className="mb-4 text-[13px] leading-[1.55] text-[var(--color-faint)]">{s.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)]">
                  Read the sample <Icon name="arrow_forward" className="text-[15px]" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* WHERE THE REST LIVES */}
      <section className="border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">On Every Program Page</div>
          <h2 className="h2 mb-3">The Live Demos and Blueprints Sit With the Pricing</h2>
          <p className="mb-8 max-w-[680px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            The working AI demos, the full system blueprint, and the 90-day rollout live on each program page — right beside the tier
            you&apos;d be buying, so you can judge proof and price together.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demoSites.map((s) => {
              const program = programBySlug[s.programSlug];
              return (
                <Link key={s.programSlug} href={`/bundles/${s.programSlug}#demos`} className="card-i flex items-center justify-between gap-3 p-5">
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-white">{program?.name ?? s.programName}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--color-faint)]">{s.industry}</span>
                  </span>
                  <Icon name="arrow_forward" className="shrink-0 text-[19px] text-[var(--color-brand-soft)]" />
                </Link>
              );
            })}
          </div>
          <p className="mt-6 text-[12.5px] leading-[1.6] text-[var(--color-faint)]">
            <Icon name="theater_comedy" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
            {fictionalNote}
          </p>
        </div>
      </section>

      <CTASection
        eyebrow="Convinced enough to talk?"
        heading="Start With a Free Growth Audit — More Proof, This Time About Your Business"
        copy="The audit shows you what we'd fix and why, before any commitment. It's the same diagnostic we run for paying clients."
        button="Get My Free Audit"
      />
    </>
  );
}
