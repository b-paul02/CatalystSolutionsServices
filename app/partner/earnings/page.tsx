import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { currentRateBpForPartner } from "@/lib/partner/rates";
import { formatRate } from "@/lib/partner/money";

export const metadata = { title: "Earnings", robots: { index: false } };

// Partner-facing and READ-ONLY. The partner sees the rate in force and nothing
// else about it: no history, no reason text, no who-set-it, no pending change.
// F8 and F9 add the commission figures below.
export default async function EarningsPage() {
  const actor = await partnerPage();
  // Explicit field allow-lists: anything selected here reaches the browser in
  // the RSC payload, so only what the partner may see is ever queried.
  const partner = await db.partner.findUnique({
    where: { id: actor.partnerId },
    select: { status: true },
  });
  const rateBp = await currentRateBpForPartner(actor.partnerId);

  return (
    <section className="shell py-14">
      <h1 className="text-[26px] font-bold text-white">Earnings</h1>

      <div className="card mt-6 max-w-[520px]">
        {rateBp !== null ? (
          <>
            <p className="label mb-2">Your commission rate</p>
            <p className="text-[40px] font-extrabold leading-none text-white">{formatRate(rateBp)}</p>
            <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-muted)]">
              of the onboarding fee on every deal you win.
            </p>
            <p className="mt-4 border-t border-[var(--color-line)] pt-4 text-[13px] leading-[1.6] text-[var(--color-faint)]">
              The monthly Growth Plan is recurring revenue and is not commissionable. Your rate is locked onto each deal
              at the moment it is won, so a later change never affects a deal you have already closed.
            </p>
          </>
        ) : (
          <>
            <p className="label mb-2">Your commission rate</p>
            <p className="text-[15px] leading-[1.6] text-[var(--color-muted)]">
              Your rate is being set up. Your Catalyst contact will confirm it before you register your first deal.
            </p>
          </>
        )}
      </div>

      {partner?.status !== "active" && (
        <p className="mt-4 max-w-[520px] text-[13px] leading-[1.6] text-[var(--color-faint)]">
          Your partner account is {partner?.status.replace(/_/g, " ")}.
        </p>
      )}
    </section>
  );
}
