import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { demoSiteBySlug, demoSites, fictionalNote, blueprintForIndustry } from "@/lib/proof";
import { programBySlug } from "@/lib/programs";
import SiteFrame from "./SiteFrame";

export function generateStaticParams() {
  return demoSites.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = demoSiteBySlug[slug];
  return s
    ? {
        title: `Demo Site: ${s.brand}`,
        description: `A fictional ${s.business} website built to our ${s.programName} program spec — switch between tiers to see what each one unlocks.`,
        robots: { index: false },
      }
    : { title: "Demo Site" };
}

export default async function DemoSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tier?: string }>;
}) {
  const { slug } = await params;
  const { tier } = await searchParams;
  const site = demoSiteBySlug[slug];
  if (!site) notFound();

  const program = programBySlug[site.programSlug];
  const blueprint = blueprintForIndustry(site.industry);
  const others = demoSites.filter((s) => s.slug !== slug).slice(0, 4);

  // Onboarding price per tier, matched by label so a program's shape (3 tiers,
  // 2 tiers, single package, project model) drives what the switcher shows.
  const prices = site.tiers.map((t) => {
    const pt = program?.tiers.find((p) => p.label === t.label && p.name === t.name) ?? program?.tiers.find((p) => p.label === t.label);
    return pt?.setup ? `${pt.setup.in} / ${pt.setup.us}` : null;
  });

  const initial = Math.max(0, (Number(tier) || 1) - 1);

  return (
    <>
      <SiteFrame site={site} initialTier={initial} prices={prices} />

      {/* WHAT THIS DEMONSTRATES */}
      <section className="border-t border-white/5 px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <div className="eyebrow mb-3">Behind This Demo</div>
              <h2 className="h2 mb-4">A Real Site, Built to a Real Spec</h2>
              <p className="mb-5 max-w-[580px] text-[14.5px] leading-[1.65] text-[var(--color-muted)]">
                {site.brand} is an invented {site.business.toLowerCase()} — but the website is real: a production-grade template,
                rebranded and wired to the {site.programName} specification. Switch tiers above and the systems change with it, exactly
                as they would on your own site.
              </p>
              <p className="mb-6 max-w-[580px] text-[13px] leading-[1.6] text-[var(--color-faint)]">
                <Icon name="theater_comedy" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
                {fictionalNote}
              </p>

              <div className="rounded-xl border border-[var(--color-line)] bg-white/[0.02] p-4">
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-faint)]">Template credit</div>
                <p className="text-[13px] leading-[1.55] text-[var(--color-muted)]">
                  Built on the open-source <strong className="text-white">{site.template.name}</strong> template by {site.template.source},
                  used under its {site.template.license} license. Your build is designed from scratch — we use templates here so you can judge
                  the systems, not our stock photography.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <Link href={`/bundles/${site.programSlug}`} className="card-i flex items-start gap-4 p-6">
                <span className="icon-grad h-[46px] w-[46px] text-[24px]"><Icon name="sell" /></span>
                <span>
                  <span className="block text-[15.5px] font-semibold text-white">Get this built for your business</span>
                  <span className="mt-1 block text-[13px] leading-[1.55] text-[var(--color-faint)]">
                    {site.programName} tiers and pricing — book online with 50% of onboarding.
                  </span>
                </span>
              </Link>
              {blueprint && (
                <Link href={`/bundles/${site.programSlug}#system`} className="card-i flex items-start gap-4 p-6">
                  <span className="icon-chip h-[46px] w-[46px] text-[24px]"><Icon name="architecture" /></span>
                  <span>
                    <span className="block text-[15.5px] font-semibold text-white">The system behind it</span>
                    <span className="mt-1 block text-[13px] leading-[1.55] text-[var(--color-faint)]">{blueprint.title} — stages, rollout and the KPIs we report.</span>
                  </span>
                </Link>
              )}
              <Link href={`/bundles/${site.programSlug}#demos`} className="card-i flex items-start gap-4 p-6">
                <span className="icon-chip h-[46px] w-[46px] text-[24px]"><Icon name="smart_toy" /></span>
                <span>
                  <span className="block text-[15.5px] font-semibold text-white">Try the automation live</span>
                  <span className="mt-1 block text-[13px] leading-[1.55] text-[var(--color-faint)]">The AI assistant, WhatsApp bot and dashboard — fully working.</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* OTHER DEMO SITES */}
      <section className="border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-6 text-2xl font-bold tracking-[-0.02em] text-white">Other Demo Sites</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((o) => (
              <Link key={o.slug} href={`/proof/sites/${o.slug}`} className="card-i flex items-center gap-3 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[20px] text-white" style={{ background: o.accent }}>
                  <Icon name={o.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-white">{o.brand}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--color-faint)]">{o.industry}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link href="/proof" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-brand-soft)] hover:text-white">
            See all proof — samples, blueprints and demos <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      </section>
    </>
  );
}
