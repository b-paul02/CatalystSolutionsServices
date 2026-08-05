import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { serviceGroups } from "@/lib/content";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <>
      <PageHero
        badge="Full-Stack Growth Services"
        title="Digital Growth Services Built for Modern Businesses"
        subtitle="From strategy and websites to SEO, paid ads, automation, content, branding, software, analytics, and retainers, Catalyst Solutions Services helps businesses build the systems they need to grow with clarity."
      />
      <section className="px-5 pt-8 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] px-6 py-5">
          <p className="text-[14.5px] text-[var(--color-muted)]">Not sure what to pick? We've bundled services by industry — each includes a Growth Audit and a live tracking dashboard.</p>
          <Link href="/industries" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--color-brand-soft)] hover:text-white">See Bundles by Industry <Icon name="arrow_forward" className="text-[17px]" /></Link>
        </div>
      </section>
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-16">
          {serviceGroups.map((g) => (
            <div key={g.title}>
              <div className="mb-[26px] flex items-center gap-3.5 border-b border-[var(--color-line)] pb-[18px]">
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-[rgba(168,85,247,0.3)] bg-[linear-gradient(135deg,rgba(124,58,237,0.28),rgba(168,85,247,0.12))] text-[24px] text-[var(--color-brand-soft)]"><Icon name={g.icon} /></span>
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">{g.title}</h2>
                  <p className="mt-0.5 text-[13.5px] text-[var(--color-faint)]">{g.sub}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {g.items.map((it, i) => (
                  <Link key={it.label + i} href={`/services/${it.slug}`} className="card-i flex items-center gap-[11px] p-4">
                    <span className="icon-chip h-[30px] w-[30px] border-0 text-[18px]"><Icon name={it.icon} /></span>
                    <span className="text-[13.5px] font-medium leading-[1.3] text-[var(--color-fg)]">{it.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <CTASection
        eyebrow="Let's build your growth system"
        heading="Not Sure Where to Start?"
        copy="Tell us your goals and we'll recommend the right mix of services to move the needle."
        button="Talk to a Strategy Expert"
      />
    </>
  );
}
