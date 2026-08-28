import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { industries, bundleBaseline } from "@/lib/content";
import { programByIndustry } from "@/lib/programs";

export const metadata: Metadata = { title: "Industries" };

export default function IndustriesPage() {
  return (
    <>
      <PageHero
        badge="Industries We Serve"
        title="Growth Programs Tailored to Your Industry"
        subtitle="Every market is different. We adapt strategy, channels, and execution to the realities of how your industry actually buys and grows — with a tiered program for each, sized to where you are today."
      />

      {/* INCLUDED IN EVERY PROGRAM */}
      <section className="px-5 pt-10 sm:px-8">
        <div className="mx-auto max-w-[1240px] rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] p-6 sm:p-8">
          <div className="eyebrow mb-2.5">Included in Every Program</div>
          <p className="mb-6 max-w-[720px] text-[14.5px] leading-[1.6] text-[var(--color-muted)]">{bundleBaseline.note}</p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {bundleBaseline.items.map((b) => (
              <Link key={b.label} href={b.href} className="card-i flex items-start gap-3.5 p-5">
                <span className="icon-chip h-[38px] w-[38px] text-[21px]"><Icon name={b.icon} /></span>
                <span>
                  <span className="block text-[15px] font-semibold text-white">{b.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.5] text-[var(--color-faint)]">{b.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-10 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((i) => {
            const program = programByIndustry[i.title];
            return (
              <div key={i.title} className="card-i flex flex-col">
                <span className="mb-[18px] flex h-[50px] w-[50px] items-center justify-center rounded-[13px] border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.1))] text-[26px] text-[var(--color-brand-soft)]"><Icon name={i.icon} /></span>
                <h3 className="mb-2.5 text-lg font-semibold text-white">{i.title}</h3>
                <p className="text-sm leading-[1.6] text-[var(--color-faint)]">{i.desc}</p>
                {program && (
                  <div className="mt-5 flex grow flex-col border-t border-[var(--color-line)] pt-4">
                    <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-brand-soft)]">Industry Program</div>
                    <Link href={`/bundles/${program.slug}`} className="mb-1.5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-white hover:text-[var(--color-brand-soft)]">
                      {program.name} <Icon name="arrow_forward" className="text-[15px]" />
                    </Link>
                    <p className="mb-3 text-[12.5px] leading-[1.55] text-[var(--color-faint)]">{program.tagline}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {program.tiers.map((t) => (
                        <Link key={t.name} href={`/bundles/${program.slug}`} className="rounded-full border border-[rgba(168,85,247,0.25)] bg-[rgba(124,58,237,0.12)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-brand-soft)] hover:border-[rgba(168,85,247,0.5)] hover:text-white">
                          {t.label === "Single Package" ? t.name : `${t.label} · ${t.name}`}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ADD-ONS & PARTNERSHIPS POINTER */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] px-6 py-5">
          <p className="text-[14.5px] text-[var(--color-muted)]">Need more than a tier covers — or a fully custom engagement? Every program extends with add-ons, and scales into a Strategic Partnership.</p>
          <Link href="/add-ons" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--color-brand-soft)] hover:text-white">Add-Ons & Strategic Partnerships <Icon name="arrow_forward" className="text-[17px]" /></Link>
        </div>
      </section>

      <CTASection
        eyebrow="Built for your market"
        heading="Let's Build a Plan for Your Industry"
        copy="Tell us about your business and we'll map a growth approach suited to how your market actually works."
      />
    </>
  );
}
