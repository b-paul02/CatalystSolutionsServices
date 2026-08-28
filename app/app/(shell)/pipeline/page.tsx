import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { getStages } from "@/lib/leados/stages";
import KanbanBoard from "./KanbanBoard";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const actor = await requireOrg("leads.view");
  const [stages, leads, members] = await Promise.all([
    getStages(actor.orgId),
    db.losLead.findMany({
      where: { orgId: actor.orgId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 400,
      include: { b2c: true },
    }),
    db.losMembership.findMany({
      where: { orgId: actor.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true } });
  const ownerName = (id: string | null) => {
    const m = members.find((x) => x.userId === id);
    return m ? (m.user.name ?? m.user.email).split(" ")[0] : null;
  };
  return (
    <div>
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">Pipeline</h1>
      <KanbanBoard
        stages={stages.map((s) => ({ key: s.key, label: s.label, isWon: s.isWon, isLost: s.isLost }))}
        currency={org?.market === "US" ? "$" : "₹"}
        canEdit={can(actor.role, "leads.edit")}
        leads={leads.map((l) => ({
          id: l.id,
          name: [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email || l.phone || "Lead",
          status: l.status,
          intentScore: l.intentScore,
          conversionValue: l.conversionValue ? Number(l.conversionValue) / 100 : null,
          owner: ownerName(l.ownerId),
          interest: l.b2c?.productInterest ?? null,
          staleDays: Math.floor((Date.now() - l.updatedAt.getTime()) / 86_400_000),
        }))}
      />
    </div>
  );
}
