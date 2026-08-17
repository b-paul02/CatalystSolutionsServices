import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import Market, { MarketOnly } from "@/components/Market";
import { bundleBaseline } from "@/lib/content";
import { programBySlug, isBookable, maintenanceNote, type Tier } from "@/lib/programs";

export function generateStaticParams() {
  return Object.keys(programBySlug).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = programBySlug[slug];
  return p ? { title: `${p.name} — ${p.industry} Program`, description: p.tagline } : { title: "Program" };
}

function TierCard({ tier, featured, slug, index }: { tier: Tier; featured: boolean; slug: string; index: number }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-[26px] ${
        featured
          ? "border-[rgba(168,85,247,0.5)] bg-[linear-gradient(160deg,rgba(40,25,75,0.85),rgba(14,11,26,0.85))] shadow-[0_0_40px_rgba(124,58,237,0.2)]"
          : "border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))]"
      }`}
    >
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-brand-soft)]">{tier.label}</div>
      <h3 className="mb-1.5 text-[19px] font-bold text-white">{tier.name}</h3>
      <p className="mb-5 text-[13.5px] leading-[1.55] text-[var(--color-muted)]">{tier.positioning}</p>

      {/* Pricing — onboarding is the tier price; monthly maintenance is priced but optional */}
      <div className="mb-5 rounded-xl border border-[rgba(168,85,247,0.2)] bg-[rgba(124,58,237,0.08)] p-4">
        {tier.setup ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-[var(--color-faint)]">{tier.setupLabel ?? "Onboarding"}</span>
            <span className="text-[17px] font-bold text-white"><Market in={tier.setup.in} us={tier.setup.us} /></span>
          </div>
        ) : (
          <div className="text-[13px] font-semibold text-white">Monthly plan — priced on your call</div>
        )}
        {tier.setup && tier.monthly && (
          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-faint)]">
                <Icon name="autorenew" className="text-[14px] text-[var(--color-brand-soft)]" />
                Monthly maintenance <span className="text-[11.5px]">(optional)</span>
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--color-brand-soft)]"><Market in={tier.monthly.in} us={tier.monthly.us} /></span>
            </div>
            <div className="mt-1 text-[11.5px] leading-[1.45] text-[var(--color-faint)]">{maintenanceNote}</div>
          </div>
        )}
        {tier.qualifier && (
          <div className="mt-2 border-t border-white/5 pt-2 text-right text-[12.5px] font-medium text-[#FBBF24]">
            Qualifier: <Market in={tier.qualifier.in} us={tier.qualifier.us} />
          </div>
        )}
        {tier.priceNote && <div className="mt-2 border-t border-white/5 pt-2 text-[12px] leading-[1.5] text-[var(--color-faint)]">{tier.priceNote}</div>}
        {tier.setup && (
          <div className="mt-2 border-t border-white/5 pt-2 text-[11.5px] leading-[1.45] text-[var(--color-faint)]">
            Prices are exclusive of taxes and payment processing charges.
          </div>
        )}
      </div>

      {isBookable(tier) ? (
        <Link href={`/book?slug=${slug}&tier=${index}`} className="btn-primary mb-5 w-full justify-center text-[14px]">
          Book Now — pay 50% to start <Icon name="arrow_forward" className="text-[17px]" />
        </Link>
      ) : (
        <Link href="/contact" className="btn-ghost mb-5 w-full justify-center text-[14px]">Book a Call</Link>
      )}

      <p className="mb-4 text-[13px] leading-[1.55] text-[var(--color-faint)]"><span className="font-semibold text-[var(--color-fg)]">Who it's for: </span>{tier.whoFor}</p>

      {tier.deliverables && (
        <div className="mb-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">
            {tier.includesPrior ? "Everything in the previous tier, plus:" : "What's included"}
          </div>
          <ul className="flex flex-col gap-[7px]">
            {tier.deliverables.map((d) => (
              <li key={d} className="flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--color-muted)]">
                <span className="mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]"><Icon name="check" className="text-[12px]" /></span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!tier.deliverables && tier.includesPrior && (
        <div className="mb-4 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">Everything in the previous tier, plus expanded scope:</div>
      )}

      <div className="mt-auto border-t border-white/5 pt-4">
        <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-faint)]">Scope</div>
        <div className="flex flex-wrap gap-1.5">
          {tier.guardrails.map((g) => (
            <span key={g} className="rounded-full border border-[var(--color-line)] bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-muted)]">{g}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function ProgramDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = programBySlug[slug];
  if (!program) notFound();

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
            {program.tiers.map((t, i) => <TierCard key={t.name} tier={t} featured={i === featured} slug={program.slug} index={i} />)}
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
