import Link from "next/link";
import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF } from "@/lib/partner/money";
import { FAMILIES, MARKETS } from "@/lib/partner/application-fields";
import NewDealForm from "./NewDealForm";

export const metadata = { title: "Register a deal", robots: { index: false } };

export default async function NewDealPage() {
  const actor = await partnerPage();
  const partner = await db.partner.findUnique({
    where: { id: actor.partnerId },
    select: { markets: true, families: true },
  });

  // A partner only ever sees the markets and families they are enabled for.
  const enabledMarkets = JSON.parse(partner?.markets ?? "[]") as string[];
  const enabledFamilies = JSON.parse(partner?.families ?? "[]") as string[];
  const markets = MARKETS.filter((m) => enabledMarkets.includes(m.value)).map((m) => ({ value: m.value, label: m.label }));
  const families = enabledFamilies.length
    ? FAMILIES.filter((f) => enabledFamilies.includes(f.value)).map((f) => ({ value: f.value, label: f.label }))
    : FAMILIES.map((f) => ({ value: f.value, label: f.label }));

  return (
    <section className="shell py-10">
      <Link href="/partner/deals" className="text-[13px] text-[var(--color-muted)] hover:text-white">← All deals</Link>
      <h1 className="mt-3 text-[26px] font-bold text-white">Register a deal</h1>
      <p className="mt-1 mb-6 max-w-[620px] text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
        Registering an account protects it for you. Protection lasts {""}
        <strong className="text-white">90 days</strong> by default and extends each time you log an activity.
      </p>

      <div className="max-w-[760px]">
        {markets.length === 0 ? (
          <p className="card text-[14px] text-amber-300">
            No markets are enabled on your account yet. Your Catalyst contact will sort this out before you register a deal.
          </p>
        ) : (
          <NewDealForm markets={markets} families={families} currencyOf={CURRENCY_OF} />
        )}
      </div>
    </section>
  );
}
