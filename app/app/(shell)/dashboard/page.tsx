import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireOrg();
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId } });
  const members = await db.losMembership.count({ where: { orgId: actor.orgId } });

  // Real metrics arrive with leads (Phase 2) and allocation (Phase 4).
  const cards = [
    { label: "Leads", value: "—", hint: "Lead management opens in the next release" },
    { label: "Delivered today", value: "—", hint: "Daily lead delivery" },
    { label: "Team members", value: String(members), hint: "Manage in Settings → Team" },
    { label: "Token balance", value: "—", hint: "Token billing" },
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
