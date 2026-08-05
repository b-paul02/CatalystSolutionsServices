import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import { bundleBySlug, bundleBaseline, services, steps } from "@/lib/content";

export function generateStaticParams() {
  return Object.keys(bundleBySlug).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = bundleBySlug[slug];
  return b ? { title: `${b.name} — ${b.industry} Growth Bundle`, description: b.seoDesc } : { title: "Bundle" };
}

const serviceIcon = (slug: string) => services.find((s) => s.slug === slug)?.icon ?? "star";
const serviceDesc = (slug: string) => services.find((s) => s.slug === slug)?.desc ?? "";

export default async function BundleDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = bundleBySlug[slug];
  if (!bundle) notFound();

  const related = Object.values(bundleBySlug).filter((b) => b.slug !== slug).slice(0, 3);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_75%_10%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto max-w-[1240px]">
          <nav className="mb-[26px] flex items-center gap-2 text-[13px] text-[var(--color-faint)]" aria-label="Breadcrumb">
            <Link href="/industries" className="hover:text-[var(--color-brand-soft)]">Industries</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-[var(--color-brand-soft)]">{bundle.name}</span>
          </nav>
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="badge mb-6"><span className="badge-dot anim-pulse" />{bundle.industry} Growth Bundle</span>
              <h1 className="mb-5 text-[clamp(2.2rem,6vw,50px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">{bundle.name}</h1>
              <p className="mb-8 max-w-[540px] text-lg leading-[1.6] text-[var(--color-muted)]">{bundle.seoDesc}</p>
              <div className="flex flex-wrap items-center gap-[18px]">
                <Link href="/contact" className="btn-primary">Request This Bundle <Icon name="arrow_forward" className="text-[19px]" /></Link>
                <Link href="/growth-audit" className="btn-ghost">Start with a Free Growth Audit</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-[rgba(168,85,247,0.28)] bg-[linear-gradient(155deg,rgba(30,20,55,0.85),rgba(12,10,24,0.85))] p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.18)]">
              <div className="mb-[18px] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">What's Included</div>
              <div className="flex flex-col gap-[13px]">
                {[...bundleBaseline.items.map((b) => b.label), ...bundle.items.map((i) => i.label)].map((inc) => (
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

      {/* TRANSPARENCY */}
      <section className="border-t border-white/5 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-10 max-w-[680px] text-center">
            <div className="eyebrow mb-3.5">Built-In Transparency</div>
            <h2 className="h2 mb-4">You Always See What We're Doing — and What It's Returning</h2>
            <p className="text-[16px] leading-[1.62] text-[var(--color-muted)]">{bundleBaseline.note}</p>
          </div>
          <div className="mx-auto grid max-w-[880px] gap-4 sm:grid-cols-2">
            {bundleBaseline.items.map((b) => (
              <Link key={b.label} href={b.href} className="card-i flex items-start gap-3.5 p-6">
                <span className="icon-chip h-[42px] w-[42px] text-[22px]"><Icon name={b.icon} /></span>
                <span>
                  <span className="block text-[15.5px] font-semibold text-white">{b.label}</span>
                  <span className="mt-1 block text-[13.5px] leading-[1.55] text-[var(--color-faint)]">{b.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES IN THIS BUNDLE */}
      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-3 text-3xl font-bold tracking-[-0.02em] text-white">Services in This Bundle</h2>
          <p className="mb-7 max-w-[620px] text-[15px] leading-[1.6] text-[var(--color-muted)]">{bundle.pitch}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {bundle.items.map((it) => (
              <Link key={it.label} href={`/services/${it.slug}`} className="card-i block">
                <span className="icon-chip mb-[15px] h-[42px] w-[42px] text-[22px]"><Icon name={serviceIcon(it.slug)} /></span>
                <h3 className="mb-[7px] text-base font-semibold text-white">{it.label}</h3>
                <p className="mb-3 text-[13px] leading-[1.55] text-[var(--color-faint)]">{serviceDesc(it.slug)}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)]">Learn More <Icon name="arrow_forward" className="text-[16px]" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="bg-[linear-gradient(180deg,#070510,#0a0716)] px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-12 max-w-[600px] text-center">
            <div className="eyebrow mb-3.5">How It Works</div>
            <h2 className="text-3xl font-extrabold tracking-[-0.025em] text-white">From Audit to Measurable Growth</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((st) => (
              <div key={st.num} className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))] p-6">
                <div className="mb-3 text-[28px] font-extrabold text-[rgba(168,85,247,0.4)]">{st.num}</div>
                <h3 className="mb-[7px] text-[15.5px] font-semibold text-white">{st.title}</h3>
                <p className="text-[13px] leading-[1.5] text-[var(--color-faint)]">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RELATED BUNDLES */}
      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-7 text-3xl font-bold tracking-[-0.02em] text-white">Other Industry Bundles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.slug} href={`/bundles/${r.slug}`} className="card-i flex items-center justify-between gap-3.5">
                <div>
                  <div className="text-[15px] font-semibold text-white">{r.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--color-faint)]">{r.industry}</div>
                </div>
                <Icon name="arrow_forward" className="text-[20px] text-[var(--color-brand-soft)]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Built for your market"
        heading={`Ready to Launch the ${bundle.name}?`}
        copy="Tell us where you are today and we'll tailor this bundle to your goals — starting with a growth audit, no pressure, no guesswork."
        button="Request This Bundle"
      />
    </>
  );
}
