import Link from "next/link";
import { requireModule } from "@/lib/os/guard";
import { db } from "@/lib/audit/db";
import { heatmapData, topPaths } from "@/lib/os/beacon";
import { Card } from "@/components/leados/ui";
import GrowthStep from "@/components/os/GrowthStep";
import { PageHeader } from "@/components/os/bits";
import Heatmap from "./Heatmap";

export const metadata = { title: "Heatmap" };

// WP-43 · clicks and scroll depth per path over a screenshot the client uploaded to Assets (no browser here to capture one).
export default async function HeatmapPage({ searchParams }: { searchParams: Promise<{ path?: string; asset?: string }> }) {
  const { actor } = await requireModule("results", "reports.view", "work.view");
  const sp = await searchParams;
  const paths = await topPaths(actor.orgId);
  const path = sp.path && sp.path.startsWith("/") ? sp.path : paths[0]?.path ?? "/";
  const [data, shots] = await Promise.all([heatmapData(actor.orgId, path), db.cosAsset.findMany({ where: { orgId: actor.orgId, kind: "image", status: { not: "archived" } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, name: true } })]);
  const asset = sp.asset && shots.some((s) => s.id === sp.asset) ? sp.asset : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Heatmap" sub="Clicks (percent of page) and scroll depth from the beacon. No text, no input values, no cookies; 30-day retention."><Link href="/app/results" className="text-[13px] underline">Results</Link></PageHeader>
      {paths.length === 0 ? (
        <Card className="p-5 text-[13.5px]"><p>No behaviour data yet. Add this to your site:</p><pre className="mt-2 overflow-auto rounded-lg bg-[var(--los-surface-2)] p-3 text-[12px]">{`<script src="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/s/beacon.js" data-workspace="${actor.orgId}" defer></script>`}</pre><p className="mt-2 text-[12.5px] text-[var(--los-faint)]">Visitors with Do Not Track on are never recorded.</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-3 text-[13px]"><div className="mb-1 font-bold">Pages (views)</div><ul className="divide-y divide-[var(--los-line)]">{paths.map((p) => <li key={p.path}><Link href={`/app/results/heatmap?path=${encodeURIComponent(p.path)}${asset ? `&asset=${asset}` : ""}`} className={`flex justify-between py-1.5 ${p.path === path ? "font-bold" : ""}`}><span className="truncate">{p.path}</span><span className="text-[var(--los-faint)]">{p.views}</span></Link></li>)}</ul></Card>
          <Card className="p-4 text-[13.5px]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b>{path}</b> · {data.pages} views · {data.clicks.length} clicks{data.scroll ? ` · average scroll depth ${data.scroll.avgDepth}% (${data.scroll.samples} samples)` : " · no scroll samples"}</div>
              <form className="flex items-center gap-2 text-[12.5px]"><input type="hidden" name="path" value={path} /><select name="asset" defaultValue={asset ?? ""} className="rounded-lg border border-[var(--los-line)] px-2 py-1"><option value="">Screenshot from Assets…</option>{shots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="rounded-lg border border-[var(--los-line)] px-2 py-1">Show</button></form></div>
            <Heatmap src={asset ? `/api/os/assets/${asset}` : null} clicks={data.clicks} />
            {!asset && <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">Upload a full-page screenshot of this page to Assets, then pick it above to see the clicks over it.</p>}
            <GrowthStep done="Behaviour data reviewed." step={{ pillar: "digital_presence", metric: "key_events", metricLabel: "Website key events", action: { kind: "work_item", label: "Plan a page experiment", title: `Experiment on ${path} from heatmap findings`, type: "experiment" } }} />
          </Card>
        </div>
      )}
    </div>
  );
}
