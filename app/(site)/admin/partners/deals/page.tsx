import Link from "next/link";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF, formatMoney, type Market } from "@/lib/partner/money";
import { displayIdentity } from "@/lib/partner/domain";
import { OPEN_STAGES, isCustomPriced } from "@/lib/partner/deals";
import CustomPriceControl from "./CustomPriceControl";

export const metadata = { title: "Open deals", robots: { index: false } };

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AdminOpenDeals() {
  await staffPage("admin", "super_admin", "deal_desk");

  const deals = await db.deal.findMany({
    where: { stage: { in: OPEN_STAGES } },
    orderBy: { registeredAt: "desc" },
    take: 200,
    select: {
      id: true, stage: true, market: true, priceBookId: true, onboardingFee: true,
      customPriceRequested: true, customPriceRequestNote: true,
      estimatedValue: true, registeredAt: true, protectedUntil: true,
      partner: { select: { legalName: true } },
      client: { select: { legalName: true, domainNormalised: true } },
      priceBook: { select: { program: true, tier: true } },
    },
  });

  return (
    <section className="shell py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white">Open deals</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">
            {deals.length} in the pipeline. A custom price replaces the price-book fee for one deal —
            the partner sees it read-only and their commission is calculated on it.
          </p>
        </div>
        <Link href="/admin/partners" className="text-[13.5px] text-[var(--color-muted)] hover:text-white">Partners →</Link>
      </div>

      {deals.length === 0 ? (
        <p className="card text-[14px] text-[var(--color-muted)]">No open deals.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>{["Client", "Partner", "Stage", "Market", "Onboarding fee", "Registered", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>))}</tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const currency = CURRENCY_OF[d.market as Market];
                const custom = isCustomPriced(d);
                return (
                  <tr key={d.id} className="border-t border-[var(--color-line)] align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{d.client.legalName}</div>
                      <div className="text-[11.5px] text-[var(--color-faint)]">{displayIdentity(d.client.domainNormalised)}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{d.partner.legalName}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{d.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{d.market}</td>
                    <td className="px-4 py-3">
                      {d.onboardingFee ? (
                        <>
                          <span className="font-semibold text-white">{formatMoney(d.onboardingFee, currency)}</span>
                          <div className="text-[11.5px] text-[var(--color-faint)]">
                            {custom ? (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">custom price</span>
                            ) : (
                              `${d.priceBook?.program} · ${d.priceBook?.tier}`
                            )}
                          </div>
                        </>
                      ) : d.estimatedValue ? (
                        <span className="text-[var(--color-muted)]">{formatMoney(d.estimatedValue, currency)} <span className="text-[11px] text-[var(--color-faint)]">partner est.</span></span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-faint)]">{shortDate(d.registeredAt)}</td>
                    <td className="px-4 py-3">
                      <CustomPriceControl
                        dealId={d.id}
                        currency={currency}
                        isCustom={custom}
                        requested={d.customPriceRequested ? formatMoney(d.customPriceRequested, currency) : null}
                        requestNote={d.customPriceRequestNote}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
