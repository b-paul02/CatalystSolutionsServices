import Link from "next/link";
import Icon from "@/components/Icon";
import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF, formatMoney, type Market } from "@/lib/partner/money";
import { displayIdentity } from "@/lib/partner/domain";

export const metadata = { title: "Deals", robots: { index: false } };

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DealsList() {
  const actor = await partnerPage();
  // Scoped to this partner, columns named explicitly.
  const deals = await db.deal.findMany({
    where: { partnerId: actor.partnerId },
    orderBy: [{ registeredAt: "desc" }],
    select: {
      id: true, stage: true, market: true, onboardingFee: true, estimatedValue: true,
      registeredAt: true, protectedUntil: true, client: { select: { legalName: true, domainNormalised: true } },
    },
  });

  const now = Date.now();

  return (
    <section className="shell py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white">Deals</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">{deals.length} registered.</p>
        </div>
        <Link href="/partner/deals/new" className="btn-primary text-[13.5px]">
          Register a deal <Icon name="add" className="text-[18px]" />
        </Link>
      </div>

      {deals.length === 0 ? (
        <p className="card text-[14px] text-[var(--color-muted)]">
          No deals yet. Register an account to protect it while you work it.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>{["Client", "Stage", "Market", "Value", "Protected until", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>))}</tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const value = d.onboardingFee ?? d.estimatedValue;
                const daysLeft = Math.ceil((d.protectedUntil.getTime() - now) / 86400000);
                const open = !["won", "lost", "lapsed"].includes(d.stage);
                return (
                  <tr key={d.id} className="border-t border-[var(--color-line)] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{d.client.legalName}</div>
                      <div className="text-[12.5px] text-[var(--color-faint)]">{displayIdentity(d.client.domainNormalised)}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{d.stage.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{d.market}</td>
                    <td className="px-4 py-3 text-white">
                      {value ? formatMoney(value, CURRENCY_OF[d.market as Market]) : "—"}
                      {!d.onboardingFee && value ? <span className="ml-1 text-[11px] text-[var(--color-faint)]">est.</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={open && daysLeft < 14 ? "text-amber-300" : "text-[var(--color-muted)]"}>
                        {shortDate(d.protectedUntil)}
                      </span>
                      {open && daysLeft < 14 && (
                        <div className="text-[11.5px] text-amber-300">
                          {daysLeft < 0 ? "expired" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/partner/deals/${d.id}`} className="text-[var(--color-brand-soft)] hover:underline">Open</Link>
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
