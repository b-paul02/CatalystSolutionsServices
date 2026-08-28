import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import TierCard from "@/components/TierCard";
import { db } from "@/lib/audit/db";
import { parsePlanProgram, planExpired } from "@/lib/customPresets";

// Customer-specific pricing proposal — tokenized, unlisted, never indexed.
export const metadata = { title: "Your Custom Plan", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CustomPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await db.customPlan.findUnique({ where: { token } });
  const program = plan && !planExpired(plan) ? parsePlanProgram(plan.json) : null;
  if (!plan || !program) notFound();

  const market = plan.market as "in" | "us";
  const grid =
    program.tiers.length >= 3 ? "lg:grid-cols-3" : program.tiers.length === 2 ? "mx-auto max-w-[880px] sm:grid-cols-2" : "mx-auto max-w-[560px]";
  const featured = program.tiers.length >= 3 ? 1 : -1;

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-10 pt-16 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_75%_10%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto max-w-[1240px]">
          <div className="max-w-[720px]">
            <span className="badge mb-6"><span className="badge-dot anim-pulse" />Prepared for {plan.customerName}</span>
            <h1 className="mb-5 text-[clamp(2.2rem,6vw,50px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">{program.name}</h1>
            <p className="mb-4 text-lg leading-[1.6] text-[var(--color-muted)]">{program.tagline}</p>
            {plan.expiresAt && (
              <p className="mb-4 text-[13px] text-[var(--color-faint)]">
                <Icon name="schedule" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
                This proposal is valid until {plan.expiresAt.toISOString().slice(0, 10)}.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="px-5 pb-14 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-8">
            <div className="eyebrow mb-3">Your Options</div>
            <p className="max-w-[620px] text-[15px] leading-[1.6] text-[var(--color-muted)]">
              {program.tierIntro ??
                (program.upfrontPct === 100
                  ? "Prices below are one-time, charged in full at booking. Monthly maintenance, where listed, is optional and can be added at checkout."
                  : "Prices below are one-time — book with 50% of it. Monthly maintenance, where listed, is optional and can be added at checkout.")}
            </p>
          </div>
          <div className={`grid gap-[18px] ${grid}`}>
            {program.tiers.map((t, i) => (
              <TierCard
                key={t.name}
                tier={t}
                featured={i === featured}
                bookHref={`/book?plan=${plan.token}&tier=${i}`}
                market={market}
                upfrontPct={program.upfrontPct ?? 50}
              />
            ))}
          </div>
          <p className="mt-8 text-[13px] leading-[1.6] text-[var(--color-faint)]">
            Questions, or want something adjusted? <Link href="/contact" className="font-semibold text-[var(--color-brand-soft)] hover:text-white">Get in touch</Link> — this plan was scoped for you and can be revised.
          </p>
        </div>
      </section>
    </>
  );
}
