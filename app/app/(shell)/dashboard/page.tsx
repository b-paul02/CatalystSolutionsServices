import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { tokenBalance } from "@/lib/leados/tokens";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireOrg();
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId } });
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [members, leads, deliveredToday, balance] = await Promise.all([
    db.losMembership.count({ where: { orgId: actor.orgId } }),
    db.losLead.count({ where: { orgId: actor.orgId } }),
    db.losAllocation.count({ where: { orgId: actor.orgId, createdAt: { gte: dayStart } } }),
    tokenBalance(actor.orgId),
  ]);

  const cards = [
    { label: "Leads", value: leads.toLocaleString(), hint: "All leads in this org" },
    { label: "Delivered today", value: deliveredToday.toLocaleString(), hint: "Daily lead delivery" },
    { label: "Team members", value: String(members), hint: "Manage in Settings → Team" },
    { label: "Token balance", value: balance.toLocaleString(), hint: "Settings → Billing" },
  ];

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-extrabold tracking-tight">Welcome{actor.name ? `, ${actor.name.split(" ")[0]}` : ""}</h1>
      <p className="mb-6 text-[14px] text-[var(--los-muted)]">{org?.name}</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-[12.5px] font-medium text-[var(--los-muted)]">{c.label}</div>
            <div className="mt-1 text-[26px] font-extrabold tracking-tight">{c.value}</div>
            <div className="mt-1 text-[12px] text-[var(--los-faint)]">{c.hint}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
