import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF, type Market } from "@/lib/partner/money";
import { currentRateBpForPartner } from "@/lib/partner/rates";
import QuotePicker, { type Package } from "./QuotePicker";

export const metadata = { title: "Choose a package", robots: { index: false } };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await partnerPage();
  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id },
    select: {
      id: true, partnerId: true, market: true, stage: true, priceBookId: true,
      client: { select: { legalName: true } },
    },
  });
  if (!deal || deal.partnerId !== actor.partnerId) notFound();

  // Only this deal's market. Build-days, costs and margins are never selected,
  // so they cannot reach the browser.
  const packages = await db.priceBook.findMany({
    where: { market: deal.market, OR: [{ activeTo: null }, { activeTo: { gt: new Date() } }] },
    orderBy: [{ familyLabel: "asc" }, { tier: "asc" }],
    select: {
      id: true, family: true, familyLabel: true, program: true, tier: true, packageName: true,
      onboardingFee: true, growthPlanMonthly: true, guardrails: true, billingSchedule: true, currency: true,
    },
  });

  const rateBp = await currentRateBpForPartner(actor.partnerId);

  const serialisable: Package[] = packages.map((p) => ({
    id: p.id,
    family: p.family,
    familyLabel: p.familyLabel,
    program: p.program,
    tier: p.tier,
    packageName: p.packageName,
    onboardingFee: p.onboardingFee.toString(),
    growthPlanMonthly: p.growthPlanMonthly?.toString() ?? null,
    guardrails: p.guardrails ? (JSON.parse(p.guardrails) as string[]) : [],
    billingSchedule: p.billingSchedule,
  }));

  return (
    <section className="shell py-10">
      <Link href={`/partner/deals/${deal.id}`} className="text-[13px] text-[var(--color-muted)] hover:text-white">← Back to deal</Link>
      <h1 className="mt-3 text-[26px] font-bold text-white">Choose a package</h1>
      <p className="mt-1 mb-6 max-w-[640px] text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
        {deal.client.legalName} · {deal.market === "IN" ? "India" : "United States"}. Every price comes from the Catalyst
        price book — there is nothing to negotiate and nothing to type.
      </p>

      {rateBp === null && (
        <p className="card mb-5 max-w-[640px] text-[13.5px] text-amber-300">
          Your commission rate is not set up yet, so we cannot show what this deal would earn. Your Catalyst contact can sort that out.
        </p>
      )}

      <QuotePicker
        dealId={deal.id}
        packages={serialisable}
        currency={CURRENCY_OF[deal.market as Market]}
        rateBp={rateBp}
        selectedId={deal.priceBookId}
      />
    </section>
  );
}
