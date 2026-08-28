import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { rollupOrgDay, type DayMetrics } from "@/lib/leados/metrics";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Reports" };

const empty: DayMetrics = { leadsCreated: 0, bySource: {}, delivered: 0, contacted: 0, converted: 0, submissions: 0, views: 0, messagesSent: 0, tokensSpent: 0 };

export default async function ReportsPage() {
  const actor = await requireOrg("reports.view");
  const today = new Date().toISOString().slice(0, 10);
  await rollupOrgDay(actor.orgId, today); // today live-refreshed on view
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.losDailyMetric.findMany({
    where: { orgId: actor.orgId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  const days = rows.map((r) => ({ date: r.date, m: { ...empty, ...(JSON.parse(r.metrics) as DayMetrics) } }));
  const sum = days.reduce(
    (acc, d) => {
      acc.leads += d.m.leadsCreated; acc.delivered += d.m.delivered; acc.contacted += d.m.contacted;
      acc.converted += d.m.converted; acc.submissions += d.m.submissions; acc.views += d.m.views;
      acc.messages += d.m.messagesSent; acc.tokens += d.m.tokensSpent;
      for (const [src, n] of Object.entries(d.m.bySource)) acc.sources[src] = (acc.sources[src] ?? 0) + n;
      return acc;
    },
    { leads: 0, delivered: 0, contacted: 0, converted: 0, submissions: 0, views: 0, messages: 0, tokens: 0, sources: {} as Record<string, number> },
  );
  const [lostReasons, plans] = await Promise.all([
    db.losLead.groupBy({ by: ["lostReason"], where: { orgId: actor.orgId, status: "lost", lostReason: { not: null } }, _count: true }),
    db.losLeadPlan.findMany({
      where: { orgId: actor.orgId },
      include: { runs: { where: { runDate: { gte: since } } } },
    }),
  ]);
  const quotaDue = plans.flatMap((p) => p.runs).reduce((s, r) => s + r.due, 0);
  const quotaDelivered = plans.flatMap((p) => p.runs).reduce((s, r) => s + r.allocated, 0);
  const conversionValue = await db.losLead.aggregate({
    where: { orgId: actor.orgId, status: "converted" },
    _sum: { conversionValue: true },
  });
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true } });
  const currency = org?.market === "US" ? "$" : "₹";
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const maxDay = Math.max(1, ...days.map((d) => d.m.leadsCreated));

  return (
    <div className="max-w-[900px]">
      <h1 className="mb-1 text-[22px] font-extrabold tracking-tight">Reports</h1>
      <p className="mb-5 text-[13.5px] text-[var(--los-muted)]">Last 30 days · owners get this as a weekly email every Monday.</p>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "New leads", value: sum.leads.toLocaleString() },
          { label: "Delivered (quota)", value: `${quotaDelivered}/${quotaDue || "—"}` },
          { label: "Contact rate", value: pct(sum.contacted, sum.leads) },
          { label: "Conversion rate", value: pct(sum.converted, sum.leads) },
          { label: "Form views → submits", value: pct(sum.submissions, sum.views) },
          { label: "Messages sent", value: sum.messages.toLocaleString() },
          { label: "Tokens used", value: sum.tokens.toLocaleString() },
          { label: "Pipeline won", value: `${currency}${(Number(conversionValue._sum.conversionValue ?? 0) / 100).toLocaleString()}` },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-[12.5px] font-medium text-[var(--los-muted)]">{c.label}</div>
            <div className="mt-1 text-[24px] font-extrabold tracking-tight">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-[15px] font-bold">New leads per day</h2>
        <div className="flex h-[120px] items-end gap-1">
          {days.map((d) => (
            <div key={d.date} className="group relative flex-1">
              <div
                className="w-full rounded-t bg-[var(--los-brand)] opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${(d.m.leadsCreated / maxDay) * 110 + 2}px` }}
                title={`${d.date}: ${d.m.leadsCreated} leads`}
              />
            </div>
          ))}
          {days.length === 0 && <p className="text-[13px] text-[var(--los-faint)]">No data yet.</p>}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Leads by source</h2>
          <ul className="space-y-2">
            {Object.entries(sum.sources).sort(([, a], [, b]) => b - a).map(([src, n]) => (
              <li key={src} className="text-[13.5px]">
                <div className="mb-0.5 flex justify-between"><span className="capitalize">{src}</span><span className="text-[var(--los-muted)]">{n}</span></div>
                <div className="h-1.5 rounded bg-[var(--los-surface-2)]">
                  <div className="h-1.5 rounded bg-[var(--los-brand)]" style={{ width: `${(n / Math.max(1, sum.leads)) * 100}%` }} />
                </div>
              </li>
            ))}
            {Object.keys(sum.sources).length === 0 && <li className="text-[13px] text-[var(--los-faint)]">No leads in this period.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Lost reasons</h2>
          <ul className="space-y-1.5 text-[13.5px]">
            {lostReasons.map((r) => (
              <li key={r.lostReason} className="flex justify-between">
                <span>{r.lostReason}</span>
                <span className="text-[var(--los-muted)]">{r._count}</span>
              </li>
            ))}
            {lostReasons.length === 0 && <li className="text-[13px] text-[var(--los-faint)]">No lost leads recorded.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
