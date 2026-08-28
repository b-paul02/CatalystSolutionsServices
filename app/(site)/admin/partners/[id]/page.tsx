import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { currentRate, rateHistory } from "@/lib/partner/rates";
import { FAMILIES } from "@/lib/partner/application-fields";
import CommissionCard, { type RateRow } from "./CommissionCard";
import PasswordCard from "./PasswordCard";
import StatusCard from "./StatusCard";

export const metadata = { title: "Partner", robots: { index: false } };

export default async function PartnerRecord({ params }: { params: Promise<{ id: string }> }) {
  const actor = await staffPage("admin", "super_admin", "deal_desk", "finance");
  const { id } = await params;
  const partner = await db.partner.findUnique({ where: { id }, include: { user: true } });
  if (!partner) notFound();

  const [rate, history] = await Promise.all([currentRate(partner.id), rateHistory(partner.id)]);
  const setters = await db.user.findMany({
    where: { id: { in: [...new Set(history.map((h) => h.setByUserId))] } },
    select: { id: true, email: true },
  });
  const emailOf = (uid: string) => setters.find((s) => s.id === uid)?.email ?? "unknown";

  // Deals already won, grouped by the rate locked onto them — this is what the
  // change-rate confirmation line reports as unaffected.
  const won = await db.deal.groupBy({
    by: ["commissionRateBpLocked"],
    where: { partnerId: partner.id, stage: "won", commissionRateBpLocked: { not: null } },
    _count: { _all: true },
  });
  const wonDeals = won
    .map((w) => ({ rateBp: w.commissionRateBpLocked!, count: w._count._all }))
    .sort((a, b) => b.count - a.count);

  const toRow = (h: (typeof history)[number]): RateRow => ({
    id: h.id,
    rateBp: h.rateBp,
    effectiveFrom: h.effectiveFrom.toISOString(),
    reason: h.reason,
    setBy: emailOf(h.setByUserId),
    approved: h.approvedAt !== null,
    approvedBy: h.approvedByUserId ? emailOf(h.approvedByUserId) : null,
    createdAt: h.createdAt.toISOString(),
  });

  return (
    <section className="shell py-10">
      <Link href="/admin/partners" className="text-[13px] text-[var(--color-muted)] hover:text-white">← All partners</Link>
      <h1 className="mt-3 text-[26px] font-bold text-white">{partner.legalName}</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-[var(--color-muted)]">
        {partner.contactEmail} · {partner.status.replace(/_/g, " ")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="card">
          <h2 className="mb-3.5 text-[15px] font-bold text-white">Terms</h2>
          <Row label="Markets" value={(JSON.parse(partner.markets) as string[]).join(", ") || "—"} />
          <Row label="Families" value={(JSON.parse(partner.families) as string[]).map((f) => FAMILIES.find((x) => x.value === f)?.label ?? f).join(", ") || "All"} />
          <Row label="Protection" value={`${partner.protectionDays} days`} />
          <Row label="Quote threshold" value={partner.quoteThresholdTier} />
          <Row label="Login" value={partner.user.email} />
        </div>

        <StatusCard partnerId={partner.id} status={partner.status} />

        <PasswordCard partnerId={partner.id} loginEmail={partner.user.email} />

        <CommissionCard
          partnerId={partner.id}
          current={rate ? toRow(rate) : null}
          history={history.map(toRow)}
          wonDeals={wonDeals}
          actorEmail={actor.email}
        />
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-[var(--color-line)] py-2.5 first:border-0 first:pt-0 sm:grid-cols-[150px_1fr]">
      <span className="text-[12.5px] text-[var(--color-faint)]">{label}</span>
      <span className="text-[13.5px] text-[var(--color-muted)]">{value}</span>
    </div>
  );
}
