import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import { cannibalisation, latestQueryRows, noClick, strikingDistance, type Topic } from "@/lib/os/keywords";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { day, Empty, field, PageHeader } from "@/components/os/bits";
import { Notice, Tabs } from "@/components/os/v2";
import { addTopicToBriefAction, clusterKeywords } from "./actions";

export const metadata = { title: "Keyword opportunities" };

// WP-14 · Search Console rows → striking distance, cannibalisation, no-click; LLM topics whose queries all exist.
export default async function KeywordsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { actor } = await requireModule("search", "work.view");
  const sp = await searchParams;
  const view = ["striking", "cannibal", "noclick", "topics"].includes(sp.view ?? "") ? sp.view! : "striking";
  const { day: synced, rows } = await latestQueryRows(actor.orgId);
  const manage = can(actor.role, "work.manage") || can(actor.role, "strategy.manage");
  const [briefs, topicSources] = await Promise.all([
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, studio: "Search", type: "content", state: { notIn: ["closed", "cancelled"] } }, select: { id: true, title: true }, take: 20 }),
    db.cosSource.findMany({ where: { orgId: actor.orgId, title: { startsWith: "Keyword topic: " }, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const href = (v: string) => `/app/search/keywords?view=${v}`;
  const pos = (n: number) => n.toFixed(1);
  const striking = strikingDistance(rows), cann = cannibalisation(rows), nc = noClick(rows);
  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Keyword opportunities" sub={synced ? `Search Console rows as of ${day(synced)} · ${rows.length} query/page pairs · impressions, clicks and position only — search volumes are not available first-party and are never shown` : "Search Console has not synced query data yet"}>
        <Link href="/app/search" className="text-[13px] font-semibold text-[var(--los-brand)] hover:underline">Search Studio</Link>
      </PageHeader>
      {!synced && <Card><Notice title="Connect Search Console" href="/app/settings/connections" action="Open Connections">Query and page data arrive with the daily sync once a Search Console property is verified.</Notice></Card>}
      {synced && (
        <>
          <Tabs active={view} items={[{ key: "striking", label: `Striking distance (${striking.length})`, href: href("striking") }, { key: "cannibal", label: `Cannibalisation (${cann.length})`, href: href("cannibal") }, { key: "noclick", label: `No click (${nc.length})`, href: href("noclick") }, { key: "topics", label: "Topics", href: href("topics") }]} />
          {view === "striking" && <Table rows={striking.map((r) => [r.query, r.page, String(r.impressions), String(r.clicks), pos(r.position)])} head={["Query", "Page", "Impressions", "Clicks", "Position"]} empty="No query sits at position 8–20 with enough impressions." note="Pages already ranking on page two: a content or internal-link improvement is the cheapest lift." />}
          {view === "cannibal" && <Table rows={cann.flatMap((c) => c.pages.map((p, i) => [i === 0 ? c.query : "", p.page, String(p.impressions), String(p.clicks), pos(p.position)]))} head={["Query", "Competing page", "Impressions", "Clicks", "Position"]} empty="No query is served by two or more pages." note="Pick one page per query; consolidate or redirect the others." />}
          {view === "noclick" && <Table rows={nc.map((r) => [r.query, r.page, String(r.impressions), "0", pos(r.position)])} head={["Query", "Page", "Impressions", "Clicks", "Position"]} empty="Every query with impressions got at least one click." note="Shown but not clicked: rewrite the title and description for that intent." />}
          {view === "topics" && (
            <div className="space-y-4">
              {manage && (aiAvailable() ? <ActionForm action={clusterKeywords} submit="Cluster queries into topics" className="text-[13px]"><p className="mb-2 text-[var(--los-muted)]">The model groups your top {Math.min(300, new Set(rows.map((r) => r.query)).size)} queries. Any topic that cites a query not in your rows is dropped. Only the query strings are sent.</p></ActionForm> : <p className="text-[13px] text-[var(--los-warn)]">AI is not configured (LLM_API_KEY).</p>)}
              <TopicsFromSources sources={topicSources} briefs={briefs} manage={manage} rows={rows} />
            </div>
          )}
          <div className="mt-5"><GrowthStep done="Opportunities reviewed." step={{ pillar: "digital_visibility", metric: "clicks", metricLabel: "Search clicks", action: { kind: "work_item", label: "Plan the top opportunity", title: striking[0] ? `Improve page for "${striking[0].query}" (position ${pos(striking[0].position)})` : "Improve a striking-distance page", type: "task", serviceSlug: "seo", payload: { query: striking[0]?.query ?? null, page: striking[0]?.page ?? null } } }} /></div>
        </>
      )}
    </div>
  );
}

function Table({ rows, head, empty, note }: { rows: string[][]; head: string[]; empty: string; note: string }) {
  return (
    <Card className="overflow-x-auto">
      {rows.length === 0 ? <Empty>{empty}</Empty> : (
        <table className="w-full min-w-[720px] text-left text-[13px]"><thead><tr className="border-b border-[var(--los-line)] text-[12px] text-[var(--los-muted)]">{head.map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i} className="border-b border-[var(--los-line)]">{r.map((c, j) => <td key={j} className={`px-4 py-1.5 ${j === 1 ? "max-w-[320px] truncate text-[var(--los-muted)]" : ""}`}>{c}</td>)}</tr>)}</tbody></table>
      )}
      <p className="px-4 py-2 text-[12px] text-[var(--los-faint)]">{note}</p>
    </Card>
  );
}

function TopicsFromSources({ sources, briefs, manage, rows }: { sources: { id: string; title: string; excerpt: string | null; createdAt: Date }[]; briefs: { id: string; title: string }[]; manage: boolean; rows: { query: string }[] }) {
  if (sources.length === 0) return <Card><Empty>No topics yet. Cluster the queries above; each topic can then be added to a brief.</Empty></Card>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sources.map((s) => {
        const queries = (s.excerpt ?? "").split("\n").slice(1).map((l) => l.split(" — ")[0]).filter((q) => rows.some((r) => r.query === q));
        const topic: Topic = { name: s.title.replace(/^Keyword topic: /, ""), intent: (s.excerpt ?? "").match(/^Intent: (\w+)/)?.[1] ?? "unknown", queries };
        return (
          <Card key={s.id} className="p-4 text-[13px]">
            <div className="font-semibold">{topic.name} <span className="text-[11.5px] font-normal text-[var(--los-faint)]">· {topic.intent} · saved {day(s.createdAt)}</span></div>
            <ul className="mt-1 text-[12.5px] text-[var(--los-muted)]">{(s.excerpt ?? "").split("\n").slice(1, 9).map((l) => <li key={l}>{l}</li>)}</ul>
            {manage && briefs.length > 0 && <ActionForm action={addTopicToBriefAction} submit="Add to brief" tone="ghost" hidden={{ topic: JSON.stringify(topic) }} className="mt-2 flex items-end gap-2"><select name="workItemId" className={`${field} !w-auto`} aria-label="Brief">{briefs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></ActionForm>}
            {manage && briefs.length === 0 && <p className="mt-2 text-[12px] text-[var(--los-faint)]">Create a brief on Search Studio to attach this topic to it.</p>}
          </Card>
        );
      })}
    </div>
  );
}
