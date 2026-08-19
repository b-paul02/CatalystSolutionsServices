import Link from "next/link";
import Icon from "@/components/Icon";
import { partnerPage } from "@/lib/partner/page-guards";
import { formatMoney } from "@/lib/partner/money";
import { actionList, dashboardTiles, recentActivity, type MoneyByCurrency } from "@/lib/partner/dashboard";

export const metadata = { title: "Dashboard", robots: { index: false } };

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function PartnerHome() {
  const actor = await partnerPage();
  const [tiles, actions, activity] = await Promise.all([
    dashboardTiles(actor.partnerId),
    actionList(actor.partnerId),
    recentActivity(actor.partnerId),
  ]);

  return (
    <section className="shell py-10">
      <h1 className="text-[26px] font-bold text-white">Dashboard</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--color-muted)]">
        Commission is paid on the onboarding fee only. The monthly Growth Plan is not commissionable.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Payable now"
          money={tiles.payable}
          note={tiles.payable.length ? `Next payout run ${shortDate(tiles.nextPayout)}` : "Nothing awaiting payout"}
        />
        <Tile
          label="Accrued"
          money={tiles.accrued}
          note="Won and invoiced, awaiting client payment"
        />
        <Tile
          label="Pipeline value"
          money={tiles.pipeline}
          note={`${tiles.openDealCount} open deal${tiles.openDealCount === 1 ? "" : "s"}`}
        />
        <div className="card">
          <p className="label mb-2">Action needed</p>
          <p className={`text-[34px] font-extrabold leading-none ${actions.length ? "text-amber-300" : "text-white"}`}>
            {actions.length}
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--color-faint)]">
            {actions.length ? "See the list below" : "Nothing needs you right now"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card">
          <h2 className="mb-3.5 text-[15px] font-bold text-white">Needs your attention</h2>
          {actions.length === 0 ? (
            <p className="text-[13.5px] text-[var(--color-muted)]">
              Nothing right now. Deals appear here when they go quiet for 14 days or their protection is running out.
            </p>
          ) : (
            <ul className="grid gap-2.5">
              {actions.map((a, i) => (
                <li key={`${a.dealId}-${a.kind}-${i}`} className="flex items-start gap-3 border-t border-[var(--color-line)] pt-2.5 first:border-0 first:pt-0">
                  <Icon
                    name={a.kind === "protection_expiring" ? "timer" : "notifications_paused"}
                    className={`mt-0.5 text-[18px] ${a.kind === "protection_expiring" ? "text-amber-300" : "text-[var(--color-faint)]"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={`/partner/deals/${a.dealId}`} className="text-[14px] font-medium text-white hover:underline">
                      {a.clientName}
                    </Link>
                    <p className="text-[12.5px] text-[var(--color-muted)]">
                      {a.kind === "protection_expiring"
                        ? a.days < 0
                          ? `Protection expired ${Math.abs(a.days)} day${Math.abs(a.days) === 1 ? "" : "s"} ago`
                          : `Protection expires in ${a.days} day${a.days === 1 ? "" : "s"} — log an activity to extend it`
                        : `No activity for ${a.days} days`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3.5 text-[15px] font-bold text-white">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-[13.5px] text-[var(--color-muted)]">No activity logged yet.</p>
          ) : (
            <ul className="grid gap-2.5">
              {activity.map((a) => (
                <li key={a.id} className="border-t border-[var(--color-line)] pt-2.5 text-[13px] first:border-0 first:pt-0">
                  <div className="flex justify-between gap-3">
                    <Link href={`/partner/deals/${a.deal.id}`} className="font-medium text-white hover:underline">
                      {a.deal.client.legalName}
                    </Link>
                    <span className="shrink-0 text-[12px] text-[var(--color-faint)]">{shortDate(a.occurredAt)}</span>
                  </div>
                  <p className="text-[var(--color-muted)]">
                    {a.type.replace(/_/g, " ")}{a.notes ? ` — ${a.notes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Link href="/partner/deals/new" className="btn-primary">
          Register a deal <Icon name="arrow_forward" className="text-[19px]" />
        </Link>
      </div>
    </section>
  );
}

/** Renders one line per currency — India and the US are never added together. */
function Tile({ label, money, note }: { label: string; money: MoneyByCurrency; note: string }) {
  return (
    <div className="card">
      <p className="label mb-2">{label}</p>
      {money.length === 0 ? (
        <p className="text-[34px] font-extrabold leading-none text-white">—</p>
      ) : (
        <div className="grid gap-1">
          {money.map((m) => (
            <p key={m.currency} className="text-[28px] font-extrabold leading-tight text-white">
              {formatMoney(m.minor, m.currency)}
              {money.length > 1 && <span className="ml-1.5 text-[12px] font-semibold text-[var(--color-faint)]">{m.currency}</span>}
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--color-faint)]">{note}</p>
    </div>
  );
}
