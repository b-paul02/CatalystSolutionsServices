import { db } from "@/lib/audit/db";
import { observations } from "@/lib/os/competitors";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { competitorAdd, competitorObserve, competitorRemove } from "../_os/phase3";

// WP-47 · market section: tracked competitor domains and their dated first-party observations (CosSource notes).
export default async function Competitors({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const [comps, obs] = await Promise.all([db.cosCompetitor.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }), observations(orgId, 10)]);
  return (
    <Card className="mb-5 p-5 text-[13.5px]">
      <div className="mb-1 text-[15px] font-bold">Market · competitors observed</div>
      <p className="mb-3 text-[12.5px] text-[var(--los-muted)]">Weekly, first-party signals only: sitemap size, blog cadence, tech, top page titles. Traffic is never estimated.</p>
      <ul className="mb-2 flex flex-wrap gap-2">{comps.map((c) => <li key={c.id} className="flex items-center gap-1 rounded-lg border border-[var(--los-line)] px-2 py-1"><span className="font-medium">{c.domain}</span><span className="text-[11.5px] text-[var(--los-faint)]">{c.lastRunAt ? `· ${c.lastRunAt.toISOString().slice(0, 10)}` : "· not yet"}</span>{canManage && <><ActionForm action={competitorObserve} submit="Observe now" tone="ghost" hidden={{ id: c.id }} /><ActionForm action={competitorRemove} submit="×" tone="ghost" hidden={{ id: c.id }} /></>}</li>)}{comps.length === 0 && <li className="text-[var(--los-faint)]">No competitors tracked yet.</li>}</ul>
      {canManage && <ActionForm action={competitorAdd} submit="Track" tone="ghost" className="flex flex-wrap items-end gap-2"><div className="min-w-[200px]"><Label>Competitor domain</Label><Input name="domain" placeholder="competitor.com" required /></div></ActionForm>}
      {obs.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold">Latest observations ({obs.length})</summary><ul className="mt-2 space-y-2">{obs.map((o) => <li key={o.id} className="rounded-lg border border-[var(--los-line)] p-2"><div className="font-medium">{o.title}</div><pre className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--los-muted)]">{o.excerpt}</pre></li>)}</ul></details>}
      {obs.length > 0 && <GrowthStep done="Competitor observations on file." step={{ pillar: "market_intelligence", metric: "search.position", metricLabel: "Tracked search positions", action: { kind: "goal", label: "Set a visibility goal", title: "Match competitor publishing cadence", unit: "posts per month", horizon: "90 days" } }} />}
    </Card>
  );
}
