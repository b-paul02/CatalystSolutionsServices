import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import { serviceData, allServiceLinks, deliveryApproach } from "@/lib/services";

export function generateStaticParams() {
  return Object.keys(serviceData).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const svc = serviceData[slug];
  return { title: svc ? svc.title : "Service" };
}

export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = serviceData[slug];
  if (!svc) notFound();

  const related = allServiceLinks.filter((r) => r.slug !== slug).slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_75%_10%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto max-w-[1240px]">
          <nav className="mb-[26px] flex items-center gap-2 text-[13px] text-[var(--color-faint)]" aria-label="Breadcrumb">
            <Link href="/services" className="hover:text-[var(--color-brand-soft)]">Services</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-[var(--color-brand-soft)]">{svc.title}</span>
          </nav>
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="icon-grad mb-6 h-[58px] w-[58px] text-[30px]"><Icon name={svc.icon} /></span>
              <h1 className="mb-5 text-[clamp(2.2rem,6vw,50px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">{svc.title}</h1>
              <p className="mb-8 max-w-[540px] text-lg leading-[1.6] text-[var(--color-muted)]">{svc.intro}</p>
              <Link href="/contact" className="btn-primary">Request a Custom Proposal <Icon name="arrow_forward" className="text-[19px]" /></Link>
            </div>
            <div className="rounded-2xl border border-[rgba(168,85,247,0.28)] bg-[linear-gradient(155deg,rgba(30,20,55,0.85),rgba(12,10,24,0.85))] p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.18)]">
              <div className="mb-[18px] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">What's Included</div>
              <div className="flex flex-col gap-[13px]">
                {svc.included.map((inc) => (
                  <div key={inc} className="flex items-center gap-[11px]">
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]"><Icon name="check" className="text-[16px]" /></span>
                    <span className="text-sm text-[var(--color-fg)]">{inc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="eyebrow mb-3.5">Why It Matters</div>
            <h2 className="text-3xl font-extrabold leading-[1.14] tracking-[-0.025em] text-white">{svc.whyHeading}</h2>
          </div>
          <p className="self-center text-[17px] leading-[1.68] text-[var(--color-muted)]">{svc.whyBody}</p>
        </div>
      </section>

      <section className="px-5 pb-16 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-7 text-3xl font-bold tracking-[-0.02em] text-white">Problems We Solve</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {svc.problems.map((p) => (
              <div key={p} className="flex items-start gap-3.5 rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(22,18,38,0.7),rgba(12,11,22,0.7))] p-[22px]">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[rgba(244,114,182,0.12)] text-[#F9A8D4]"><Icon name="priority_high" className="text-[18px]" /></span>
                <span className="text-[14.5px] leading-[1.5] text-[var(--color-fg)]">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-7 text-3xl font-bold tracking-[-0.02em] text-white">Core Services Included</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {svc.core.map((c) => (
              <div key={c.title} className="card-i">
                <span className="icon-chip mb-[15px] h-[42px] w-[42px] text-[22px]"><Icon name={c.icon} /></span>
                <h3 className="mb-[7px] text-base font-semibold text-white">{c.title}</h3>
                <p className="text-[13.5px] leading-[1.55] text-[var(--color-faint)]">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#070510,#0a0716)] px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-12 max-w-[600px] text-center">
            <div className="eyebrow mb-3.5">Delivery Approach</div>
            <h2 className="text-3xl font-extrabold tracking-[-0.025em] text-white">How We Deliver This Engagement</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {deliveryApproach.map((a) => (
              <div key={a.num} className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))] p-6">
                <div className="mb-3 text-[28px] font-extrabold text-[rgba(168,85,247,0.4)]">{a.num}</div>
                <h3 className="mb-[7px] text-[15.5px] font-semibold text-white">{a.title}</h3>
                <p className="text-[13px] leading-[1.5] text-[var(--color-faint)]">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="eyebrow mb-3.5">The Team</div>
            <h2 className="mb-4 text-[32px] font-extrabold leading-[1.14] tracking-[-0.025em] text-white">Experts Behind the Engagement</h2>
            <p className="text-base leading-[1.62] text-[var(--color-muted)]">Every project is staffed with vetted specialists matched to your goals — not generalists. You get senior expertise across each discipline this work touches.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {svc.experts.map((e) => (
              <div key={e.role} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(24,19,42,0.7),rgba(12,11,22,0.7))] px-[18px] py-[13px]">
                <span className="icon-chip h-8 w-8 border-0 text-[18px]"><Icon name={e.icon} /></span>
                <span className="text-sm font-medium text-[var(--color-fg)]">{e.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-7 text-3xl font-bold tracking-[-0.02em] text-white">Related Services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.slug} href={`/services/${r.slug}`} className="card-i flex items-center justify-between gap-3.5">
                <div className="flex items-center gap-3.5">
                  <span className="icon-chip h-10 w-10 border-0 text-[21px]"><Icon name={r.icon} /></span>
                  <span className="text-[15px] font-semibold text-white">{r.title}</span>
                </div>
                <Icon name="arrow_forward" className="text-[20px] text-[var(--color-brand-soft)]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Tailored to your goals"
        heading={svc.ctaHeading}
        copy="Share where you are today and we'll put together a custom proposal mapped to your goals — no pressure, no pricing guesswork."
        button="Request a Custom Proposal"
      />
    </>
  );
}
