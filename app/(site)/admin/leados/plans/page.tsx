import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import PlanForm from "./PlanForm";
import PlanRow from "./PlanRow";
import ReplacementQueue from "./ReplacementQueue";

export const metadata = { title: "Client lead plans" };

export default async function PlansPage() {
  await requirePlatform("super_admin", "campaign_admin", "auditor");
  const [plans, orgs, replacements, geoRows] = await Promise.all([
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
    db.losInventoryRecord.findMany({
      where: { status: "available" },
      select: { leadType: true, country: true, state: true, city: true, fields: true },
    }),
  ]);
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);
  // Distinct geo values in available stock, with counts, per lead type.
  const tally = (key: "country" | "state" | "city") => {
    const m = new Map<string, { value: string; leadType: string; count: number }>();
    for (const r of geoRows) {
      const v = r[key]?.trim();
      if (!v) continue;
      const k = `${r.leadType}:${v.toLowerCase()}`;
      const e = m.get(k);
      if (e) e.count++;
      else m.set(k, { value: v, leadType: r.leadType, count: 1 });
    }
    return [...m.values()].sort((a, b) => a.value.localeCompare(b.value));
  };
  const geo = { countries: tally("country"), states: tally("state"), cities: tally("city") };
  // Dataset-column filters: distinct values per column in available stock.
  // PII and geo columns excluded; high-cardinality columns are not filters.
  const EXCLUDED = new Set(["firstName", "lastName", "email", "phone", "city", "state", "country", "companyDomain"]);
  const MAX_VALUES = 30;
  const columns = new Map<string, Map<string, { value: string; leadType: string; count: number }>>();
  for (const r of geoRows) {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(r.fields); } catch { continue; }
    for (const [col, raw] of Object.entries(parsed)) {
      if (EXCLUDED.has(col) || typeof raw !== "string") continue;
      // tags-style columns: each token is a value
      for (const v of raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
        const byValue = columns.get(col) ?? new Map();
        columns.set(col, byValue);
        const k = `${r.leadType}:${v.toLowerCase()}`;
        const e = byValue.get(k);
        if (e) e.count++;
        else byValue.set(k, { value: v, leadType: r.leadType, count: 1 });
      }
    }
  }
  const fieldOptions = [...columns.entries()]
    .map(([column, byValue]) => ({ column, values: [...byValue.values()].sort((a, b) => a.value.localeCompare(b.value)) }))
    .filter((c) => c.values.length > 0 && c.values.length <= MAX_VALUES)
    .sort((a, b) => a.column.localeCompare(b.column));
  return (
    <div className="shell space-y-6 py-8">
      <h1 className="text-2xl font-extrabold text-white">Client lead plans</h1>
      <PlanForm orgs={orgs} geo={geo} fieldOptions={fieldOptions} />
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
