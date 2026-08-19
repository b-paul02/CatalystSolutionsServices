import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { partnerPage } from "@/lib/partner/page-guards";
import { CURRENCY_OF, formatMoney, type Market } from "@/lib/partner/money";
import { FAMILIES } from "@/lib/partner/application-fields";
import ActivityPanel from "./ActivityPanel";
import StagePanel from "./StagePanel";

export const metadata = { title: "Deal", robots: { index: false } };

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function DealDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registered?: string }>;
}) {
  const actor = await partnerPage();
  const { id } = await params;
  const { registered } = await searchParams;

  const deal = await db.deal.findUnique({
    where: { id },
    select: {
      id: true, partnerId: true, stage: true, market: true, family: true, estimatedTier: true,
      estimatedValue: true, onboardingFee: true, expectedCloseDate: true, howYouKnowThem: true, notes: true,
      registeredAt: true, protectedUntil: true, proposalSentAt: true, lastActivityAt: true,
      client: { select: { legalName: true, domainNormalised: true, contactName: true, contactEmail: true, contactPhone: true } },
    },
  });
  // A deal belonging to another partner is indistinguishable from one that does
  // not exist.
  if (!deal || deal.partnerId !== actor.partnerId) notFound();

  const activities = await db.activity.findMany({
    where: { dealId: deal.id },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: { id: true, type: true, notes: true, occurredAt: true },
  });

  const currency = CURRENCY_OF[deal.market as Market];
  const daysLeft = Math.ceil((deal.protectedUntil.getTime() - Date.now()) / 86400000);
  const open = !["won", "lost", "lapsed"].includes(deal.stage);

  return (
    <section className="shell py-10">
      <Link href="/partner/deals" className="text-[13px] text-[var(--color-muted)] hover:text-white">← All deals</Link>

      {registered && (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[13.5px] text-emerald-300">
          Registered and protected until {longDate(deal.protectedUntil)}.
        </p>
      )}

      <h1 className="mt-3 text-[26px] font-bold text-white">{deal.client.legalName}</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--color-muted)]">
        {deal.client.domainNormalised} · {deal.market} · {deal.stage.replace(/_/g, " ")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-4">
          <div className="card">
            <h2 className="mb-3.5 text-[15px] font-bold text-white">Protection</h2>
            <p className={`text-[28px] font-extrabold leading-none ${open && daysLeft < 14 ? "text-amber-300" : "text-white"}`}>
              {open ? (daysLeft < 0 ? "Expired" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`) : "—"}
            </p>
            <p className="mt-2 text-[13px] text-[var(--color-muted)]">
              Protected until {longDate(deal.protectedUntil)}. Registered {longDate(deal.registeredAt)}.
            </p>
            <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-[12.5px] leading-[1.55] text-[var(--color-faint)]">
              Logging an activity extends protection by 30 days, up to 180 days from registration until a proposal is sent.
            </p>
          </div>

          <div className="card">
            <h2 className="mb-3.5 text-[15px] font-bold text-white">Deal</h2>
            <Row label="Family" value={FAMILIES.find((f) => f.value === deal.family)?.label ?? deal.family} />
            <Row label="Estimated tier" value={deal.estimatedTier} />
            <Row label={deal.onboardingFee ? "Onboarding fee" : "Your estimate"}
                 value={(deal.onboardingFee ?? deal.estimatedValue) ? formatMoney((deal.onboardingFee ?? deal.estimatedValue)!, currency) : null} />
            <Row label="Expected close" value={deal.expectedCloseDate ? longDate(deal.expectedCloseDate) : null} />
            <Row label="How you know them" value={deal.howYouKnowThem} />
            <Row label="Notes" value={deal.notes} />
            {!deal.onboardingFee && (
              <Link href={`/partner/deals/${deal.id}/quote`} className="btn-primary mt-4 w-full justify-center text-[13.5px]">
                Choose a package
              </Link>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3.5 text-[15px] font-bold text-white">Client contact</h2>
            <Row label="Name" value={deal.client.contactName} />
            <Row label="Email" value={deal.client.contactEmail} />
            <Row label="Phone" value={deal.client.contactPhone} />
          </div>
        </div>

        <div className="grid content-start gap-4">
          <StagePanel dealId={deal.id} stage={deal.stage} hasPackage={deal.onboardingFee !== null} closed={!open} />
          <ActivityPanel dealId={deal.id} disabled={!open} />

          <div className="card">
            <h2 className="mb-3.5 text-[15px] font-bold text-white">Activity</h2>
            {activities.length === 0 ? (
              <p className="text-[13.5px] text-[var(--color-muted)]">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-2.5">
                {activities.map((a) => (
                  <li key={a.id} className="border-t border-[var(--color-line)] pt-2.5 text-[13px] first:border-0 first:pt-0">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-white">{a.type.replace(/_/g, " ")}</span>
                      <span className="shrink-0 text-[12px] text-[var(--color-faint)]">{longDate(a.occurredAt)}</span>
                    </div>
                    {a.notes && <p className="text-[var(--color-muted)]">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-t border-[var(--color-line)] py-2.5 first:border-0 first:pt-0 sm:grid-cols-[150px_1fr]">
      <span className="text-[12.5px] text-[var(--color-faint)]">{label}</span>
      <span className="whitespace-pre-wrap text-[13.5px] text-[var(--color-muted)]">{value}</span>
    </div>
  );
}
