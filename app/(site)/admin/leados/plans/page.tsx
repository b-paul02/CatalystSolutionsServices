import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import PlanForm from "./PlanForm";
import PlanRow from "./PlanRow";
import ReplacementQueue from "./ReplacementQueue";

export const metadata = { title: "Client lead plans" };

export default async function PlansPage() {
  await requirePlatform("super_admin", "campaign_admin", "auditor");
  const [plans, orgs, replacements] = await Promise.all([
    db.losLeadPlan.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { runs: { orderBy: { runDate: "desc" }, take: 5 } },
    }),
    db.losOrg.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.losLeadReplacement.findMany({
      where: { status: "requested" },
      include: { allocation: { include: { plan: { select: { name: true, orgId: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);
  return (
    <div className="shell space-y-6 py-8">
      <h1 className="text-2xl font-extrabold text-white">Client lead plans</h1>
      <PlanForm orgs={orgs} />
      {replacements.length > 0 && (
        <ReplacementQueue
          items={replacements.map((r) => ({
            id: r.id, reason: r.reason, createdAt: r.createdAt.toISOString().slice(0, 10),
            planName: r.allocation.plan.name, orgName: orgName(r.allocation.plan.orgId),
            tokens: r.allocation.tokensCharged,
          }))}
        />
      )}
      <div className="space-y-3">
        {plans.map((p) => (
          <PlanRow
            key={p.id}
            plan={{
              id: p.id, name: p.name, orgName: orgName(p.orgId), leadType: p.leadType,
              dailyQuota: p.dailyQuota, status: p.status, exclusivity: p.exclusivity,
              purpose: p.purpose, rollover: p.rolloverPolicy,
              runs: p.runs.map((r) => ({ runDate: r.runDate, due: r.due, allocated: r.allocated, shortage: r.shortage })),
            }}
          />
        ))}
        {plans.length === 0 && <p className="text-[var(--color-muted)]">No plans yet.</p>}
      </div>
    </div>
  );
}
