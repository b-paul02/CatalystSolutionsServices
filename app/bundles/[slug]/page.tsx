import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import Market, { MarketOnly } from "@/components/Market";
import TierCard from "@/components/TierCard";
import { bundleBaseline } from "@/lib/content";
import { programBySlug } from "@/lib/programs";
import { proofForTier, siteForIndustry, blueprintForIndustry, samples, sampleBySlug, process90, fictionalNote } from "@/lib/proof";
import IndustryDemos from "@/components/demos/IndustryDemos";
import SampleExcerpt from "@/components/SampleExcerpt";

export function generateStaticParams() {
  return Object.keys(programBySlug).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = programBySlug[slug];
  return p ? { title: `${p.name} — ${p.industry} Program`, description: p.tagline } : { title: "Program" };
}

export default async function ProgramDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = programBySlug[slug];
  if (!program) notFound();

  const site = siteForIndustry(program.industry);
  const blueprint = blueprintForIndustry(program.industry);
  // The program's own monthly report if it has one, otherwise the closest equivalent.
  const sample =
    samples.find((s) => s.industry === program.industry && s.type === "Monthly Report") ?? sampleBySlug["monthly-seo-report"];

  const related = Object.values(programBySlug).filter((p) => p.slug !== slug).slice(0, 3);
  const grid =
    program.tiers.length >= 3 ? "lg:grid-cols-3" : program.tiers.length === 2 ? "mx-auto max-w-[880px] sm:grid-cols-2" : "mx-auto max-w-[560px]";
  const featured = program.tiers.length >= 3 ? 1 : -1; // highlight the middle tier

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-14 pt-16 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_75%_10%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto max-w-[1240px]">
          <nav className="mb-[26px] flex items-center gap-2 text-[13px] text-[var(--color-faint)]" aria-label="Breadcrumb">
            <Link href="/industries" className="hover:text-[var(--color-brand-soft)]">Industries</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-[var(--color-brand-soft)]">{program.name}</span>
          </nav>
          <div className="max-w-[720px]">
            <span className="badge mb-6"><span className="badge-dot anim-pulse" />{program.industry} Program</span>
            <h1 className="mb-5 text-[clamp(2.2rem,6vw,50px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">{program.name}</h1>
            <p className="mb-4 text-lg leading-[1.6] text-[var(--color-muted)]">{program.tagline}</p>
            {program.subIcps && <p className="mb-8 text-[13.5px] leading-[1.6] text-[var(--color-faint)]">Built for: {program.subIcps}</p>}
            <div className="flex flex-wrap items-center gap-[18px]">
              <Link href="/contact" className="btn-primary">Book a Call <Icon name="arrow_forward" className="text-[19px]" /></Link>
              <Link href="/growth-audit" className="btn-ghost">Start with a Free Growth Audit</Link>
            </div>
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="px-5 pb-6 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-8">
            <div className="eyebrow mb-3">Choose Your Tier</div>
            <h2 className="h2 mb-3">One Program, Sized to Where You Are</h2>
            <p className="max-w-[620px] text-[15px] leading-[1.6] text-[var(--color-muted)]">{program.tierIntro ?? "Every tier includes everything in the tier below it. Tier prices are one-time onboarding — book with 50% of it. Monthly maintenance is optional and can be added at checkout."}</p>
          </div>
          <div className={`grid gap-[18px] ${grid}`}>
            {program.tiers.map((t, i) => (
              <TierCard
                key={t.name}
                tier={t}
                featured={i === featured}
                bookHref={`/book?slug=${program.slug}&tier=${i}`}
                proof={proofForTier(program.industry, i, program.tiers.length)}
              />
            ))}
          </div>
          {program.notes && (
            <div className="mt-5 flex flex-col gap-2">
              {program.notes.map((n, i) => {
                const body = (
                  <p className="text-[13px] leading-[1.6] text-[var(--color-faint)]">
                    <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
                    {n.text ?? <Market in={n.in!} us={n.us!} />}
                  </p>
                );
                return n.market ? <MarketOnly key={i} market={n.market}>{body}</MarketOnly> : <span key={i}>{body}</span>;
              })}
            </div>
          )}
        </div>
      </section>

      {/* DEMO SITE — the whole program, browsable, tier by tier */}
      {site && (
        <section id="demo-site" className="scroll-mt-24 px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-[1240px]">
            <div className="overflow-hidden rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.75),rgba(12,10,24,0.75))]">
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                <div>
                  <div className="eyebrow mb-3">Proof Before Payment</div>
                  <h2 className="mb-3 text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-white sm:text-3xl">
                    Browse a Whole {program.name} Site — at Any Tier
                  </h2>
                  <p className="mb-5 max-w-[520px] text-[14.5px] leading-[1.65] text-[var(--color-muted)]">
                    <strong className="text-white">{site.brand}</strong> is a fictional {site.business.toLowerCase()} we built to this
                    program&apos;s exact specification. Switch between tiers and watch the systems light up — everything above your tier
                    shows locked, with what it costs to unlock.
                  </p>
                  <div className="mb-6 flex flex-wrap gap-2">
                    {site.tiers.map((t, i) => (
                      <Link
                        key={t.label}
                        href={`/proof/sites/${site.slug}?tier=${i + 1}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(168,85,247,0.35)] bg-[rgba(124,58,237,0.12)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-brand-soft)] transition-colors hover:bg-[rgba(124,58,237,0.28)] hover:text-white"
                      >
                        <Icon name="visibility" className="text-[15px]" />
                        View at {t.label}
                      </Link>
                    ))}
                  </div>
                  <Link href={`/proof/sites/${site.slug}`} className="btn-primary">
                    Open the demo site <Icon name="arrow_forward" className="text-[18px]" />
                  </Link>
                </div>

                <Link href={`/proof/sites/${site.slug}`} className="group block overflow-hidden rounded-xl border border-white/10 bg-white shadow-[0_0_40px_rgba(0,0,0,0.45)]">
                  <div className="flex items-center gap-2 border-b border-black/10 bg-[#e9ecf1] px-3 py-2">
                    <span className="flex gap-1.5">
                      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                        <span key={c} className="h-[9px] w-[9px] rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="mx-auto rounded bg-white px-2.5 py-0.5 text-[10.5px] text-[#5b6472]">
                      www.{site.slug.replace(/-/g, "")}.demo
                    </span>
                  </div>
                  <iframe
                    src={`/demo-sites/${site.slug}/index.html`}
                    title={`${site.brand} demo website preview`}
                    tabIndex={-1}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                    className="pointer-events-none block h-[300px] w-full border-0 bg-white"
                  />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* LIVE DEMOS — the systems this program deploys, running here */}
      <section id="demos" className="scroll-mt-24 border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">See It Working</div>
          <h2 className="h2 mb-3">The Automation in This Program — Live, Right Here</h2>
          <p className="mb-9 max-w-[660px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            These are the systems inside {program.name}, running on this page with fictional {program.industry.toLowerCase()} data.
            Click them. What you&apos;re testing is what gets deployed for you — trained on your business instead.
          </p>
          <IndustryDemos industry={program.industry} />
        </div>
      </section>

      {/* SAMPLE DELIVERABLE — what actually lands in your inbox */}
      <section id="sample" className="scroll-mt-24 border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">What You&apos;ll Receive</div>
          <h2 className="h2 mb-3">Your Monthly Report, Before You Pay for One</h2>
          <p className="mb-7 max-w-[660px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            Every tier reports monthly. Tier 1 reports on presence; higher tiers add conversion, cost per customer and strategy.
            Here&apos;s the opening of a real one.
          </p>
          <SampleExcerpt doc={sample} />
        </div>
      </section>

      {/* THE SYSTEM — blueprint folded in */}
      {blueprint && (
        <section id="system" className="scroll-mt-24 border-t border-white/5 px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-[1240px]">
            <div className="eyebrow mb-3">The System Behind This Program</div>
            <h2 className="h2 mb-3">{blueprint.title}</h2>
            <p className="mb-8 max-w-[680px] text-[15px] leading-[1.6] text-[var(--color-muted)]">{blueprint.promise}</p>

            <div className="mb-8 flex flex-col gap-4">
              {blueprint.stages.map((s, i) => (
                <div key={s.name} className="card p-6">
                  <div className="mb-3 flex items-start gap-4">
                    <span className="icon-grad h-[44px] w-[44px] shrink-0 text-[23px]"><Icon name={s.icon} /></span>
                    <div>
                      <h3 className="text-[16.5px] font-bold text-white">{s.name}</h3>
                      <p className="mt-0.5 text-[13px] italic text-[var(--color-brand-soft)]">{s.desc}</p>
                    </div>
                    <span className="ml-auto hidden text-[32px] font-extrabold text-white/10 sm:block">{i + 1}</span>
                  </div>
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {s.items.map((it) => (
                      <li key={it} className="flex items-start gap-2.5 text-[13.5px] leading-[1.55] text-[var(--color-muted)]">
                        <span className="mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]">
                          <Icon name="check" className="text-[12px]" />
                        </span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <h3 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">The KPIs we report on</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {blueprint.kpis.map((k) => (
                <div key={k.label} className="card p-5">
                  <Icon name="monitoring" className="mb-2.5 text-[22px] text-[var(--color-brand-soft)]" />
                  <h4 className="mb-1.5 text-[14.5px] font-bold text-white">{k.label}</h4>
                  <p className="text-[12.5px] leading-[1.5] text-[var(--color-faint)]">{k.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FIRST 90 DAYS — process transparency for everything that can't be demoed */}
      <section id="process" className="scroll-mt-24 border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3">Your First 90 Days</div>
          <h2 className="h2 mb-3">Exactly What Happens After You Book</h2>
          <p className="mb-8 max-w-[660px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
            A retainer can&apos;t be demoed — so here&apos;s the machine itself. This is every engagement&apos;s first 90 days, and you can hold us to it.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {process90.map((p, i) => (
              <div key={p.title} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="icon-chip h-[42px] w-[42px] text-[22px]"><Icon name={p.icon} /></span>
                  <span className="text-[28px] font-extrabold text-white/10">{i + 1}</span>
                </div>
                <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">{p.phase}</div>
                <h3 className="mb-2 text-[16px] font-bold text-white">{p.title}</h3>
                <p className="text-[13px] leading-[1.55] text-[var(--color-faint)]">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[12.5px] leading-[1.6] text-[var(--color-faint)]">
            <Icon name="theater_comedy" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
            {fictionalNote}
          </p>
        </div>
      </section>

      {/* ADD-ON MODULES (healthcare) */}
      {program.addOnModules && (
        <section className="px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-[1240px]">
            <div className="eyebrow mb-3">Add-On Modules</div>
            <h2 className="mb-6 text-2xl font-bold tracking-[-0.02em] text-white">Extend Any Tier</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {program.addOnModules.map((m) => (
                <div key={m.name} className="card-i flex items-start gap-4 p-6">
                  <span className="icon-chip h-[44px] w-[44px] text-[23px]"><Icon name={m.icon} /></span>
                  <div>
                    <h3 className="mb-1 text-[16px] font-semibold text-white">{m.name}</h3>
                    <p className="mb-2.5 text-[13.5px] leading-[1.55] text-[var(--color-faint)]">{m.desc}</p>
                    <Link href="/contact" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)] hover:text-white">
                      Ask about this module <Icon name="arrow_forward" className="text-[15px]" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* UPGRADE PATH */}
      {program.upgradePath.length > 0 && (
        <section className="px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-[1240px] rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,20,55,0.7),rgba(12,10,24,0.7))] p-6 sm:p-8">
            <div className="eyebrow mb-2.5">When to Move Up</div>
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {program.upgradePath.map((u) => (
                <div key={u.trigger} className="flex items-start gap-3">
                  <Icon name="trending_up" className="mt-0.5 text-[19px] text-[var(--color-brand-soft)]" />
                  <p className="text-[13.5px] leading-[1.55] text-[var(--color-muted)]">
                    {u.trigger} <Icon name="arrow_forward" className="mx-0.5 align-[-3px] text-[14px] text-[var(--color-faint)]" />{" "}
                    <span className="font-semibold text-white">{u.to}</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 border-t border-white/5 pt-4 text-[13px] text-[var(--color-faint)]">
              Need something a tier doesn't cover? <Link href="/add-ons" className="font-semibold text-[var(--color-brand-soft)] hover:text-white">Browse add-ons</Link> — beyond-guardrail requests go add-on → change request → tier upgrade.
            </p>
          </div>
        </section>
      )}

      {/* TRANSPARENCY */}
      <section className="border-t border-white/5 px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-9 max-w-[680px] text-center">
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

      {/* RELATED PROGRAMS */}
      <section className="px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-7 text-3xl font-bold tracking-[-0.02em] text-white">Other Industry Programs</h2>
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
        heading={`Ready to Start the ${program.name} Program?`}
        copy="Tell us where you are today and we'll recommend the right tier — starting with a growth audit, no pressure, no guesswork."
        button="Book a Call"
      />
    </>
  );
}
