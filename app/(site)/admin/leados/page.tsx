import Link from "next/link";
import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";

export const metadata = { title: "LeadOS Admin" };

export default async function LeadosAdminPage() {
  await requirePlatform();
  const [orgs, leads, pendingReviews, openRequests, suppressions] = await Promise.all([
    db.losOrg.count(),
    db.losLead.count({ where: { deletedAt: null } }),
    db.losComplianceReview.count({ where: { status: "pending" } }),
    db.losPrivacyRequest.count({ where: { completedAt: null } }),
    db.losSuppressionEntry.count(),
  ]);
  const cards = [
    { label: "Organizations", value: orgs, href: "/admin/leados" },
    { label: "Leads (all tenants)", value: leads, href: "/admin/leados" },
    { label: "Pending reviews", value: pendingReviews, href: "/admin/leados/reviews" },
    { label: "Open privacy requests", value: openRequests, href: "/admin/leados/privacy-requests" },
    { label: "Suppression entries", value: suppressions, href: "/admin/leados/suppressions" },
  ];
  return (
    <div className="shell py-8">
      <h1 className="mb-6 text-2xl font-extrabold text-white">LeadOS Platform</h1>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card !p-4 hover:border-[var(--color-brand)]">
            <div className="text-[12.5px] text-[var(--color-muted)]">{c.label}</div>
            <div className="text-[26px] font-extrabold text-white">{c.value}</div>
          </Link>
        ))}
      </div>
      <nav className="flex flex-wrap gap-4 text-[14px]">
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/datasets">Datasets</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/inventory">Inventory</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/plans">Lead plans</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/tokens">Tokens</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/reviews">Compliance reviews</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/privacy-requests">Privacy requests</Link>
        <Link className="text-[var(--color-brand-soft)] hover:text-white" href="/admin/leados/suppressions">Suppression list</Link>
      </nav>
    </div>
  );
}
