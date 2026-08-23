import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF, commissionAmount, formatMoney, formatRate, type Market } from "@/lib/partner/money";
import { isCustomPriced } from "@/lib/partner/deals";
import { currentRateBpForPartner } from "@/lib/partner/rates";
import QuotePicker, { type Package } from "./QuotePicker";
import RequestCustomPrice from "./RequestCustomPrice";

export const metadata = { title: "Choose a package", robots: { index: false } };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await partnerPage();
  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id },
    select: {
      id: true, partnerId: true, market: true, stage: true, priceBookId: true, onboardingFee: true,
      customPriceRequested: true,
      client: { select: { legalName: true } },
    },
  });
  if (!deal || deal.partnerId !== actor.partnerId) notFound();

  // A staff-set custom price replaces the picker entirely: the fee is decided,
  // the partner sees it read-only, and there is still nothing to type.
  if (isCustomPriced(deal)) {
    const currency = CURRENCY_OF[deal.market as Market];
    const rateBp = await currentRateBpForPartner(actor.partnerId);
    const commission = rateBp === null ? null : commissionAmount(deal.onboardingFee!, rateBp);
    return (
      <section className="shell py-10">
        <Link href={`/partner/deals/${deal.id}`} className="text-[13px] text-[var(--color-muted)] hover:text-white">← Back to deal</Link>
        <h1 className="mt-3 text-[26px] font-bold text-white">Pricing for {deal.client.legalName}</h1>
        <div className="card mt-6 max-w-[520px]">
          <p className="label mb-2">Custom price — set by Catalyst</p>
          <p className="text-[36px] font-extrabold leading-none text-white">{formatMoney(deal.onboardingFee!, currency)}</p>
          <p className="mt-2 text-[13px] text-[var(--color-muted)]">onboarding fee for this deal</p>
          <dl className="mt-5 grid gap-2.5 border-t border-[var(--color-line)] pt-4 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-muted)]">Your rate</dt>
              <dd className="font-semibold text-white">{rateBp === null ? "—" : formatRate(rateBp)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white">Your commission on this deal</dt>
              <dd className="text-[20px] font-extrabold leading-none text-white">
                {commission === null ? "—" : formatMoney(commission, currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] leading-[1.55] text-[var(--color-faint)]">
            Catalyst has priced this engagement individually. If you think it should change, talk to your Catalyst
            contact — the price cannot be edited here.
          </p>
        </div>
      </section>
    );
  }

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

      <div className="mt-6 max-w-[640px]">
        <RequestCustomPrice
          dealId={deal.id}
          currency={CURRENCY_OF[deal.market as Market]}
          pending={deal.customPriceRequested ? formatMoney(deal.customPriceRequested, CURRENCY_OF[deal.market as Market]) : null}
        />
      </div>
    </section>
  );
}
