import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { CHANNELS } from "@/lib/os/channels";
import { campaignContentTotals, metricsFor, METRICS, SOURCE_LABEL } from "@/lib/os/metrics";
import { businessOutcomes } from "@/lib/os/outcomes";
import { clicksByVariant } from "@/lib/os/links";
import { scorecardSummary } from "@/lib/os/scorecardResults";
import { getLayout, WIDGETS } from "@/lib/os/reports";
import { reviewsSummary } from "@/lib/os/reviews";
import { approvalProviderEnabled } from "@/lib/os/connections";
import { reviewsSync } from "../_os/phase3";
import { widgetSet } from "../_os/v2";
import { PILLAR_LABEL } from "@/lib/os/pillarDefs";
import { formatInZone, periodBounds } from "@/lib/os/time";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { field, PageHeader } from "@/components/os/bits";
import { Figure, money, Notice, Tabs } from "@/components/os/v2";
import { metricImport, metricRecord } from "../_os/v2";

export const metadata = { title: "Results" };

// Three connected views: each piece of content → each campaign → business outcomes.
// A number that does not exist is said in words; nothing is shown as 0 unless it IS 0.
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ view?: string; period?: string }> }) {
  const { actor, ent } = await requireModule("results", "work.view");
  const sp = await searchParams;
  const view = ["content", "campaigns", "business"].includes(sp.view ?? "") ? sp.view! : "business";
  const period = (["week", "month", "last30"].includes(sp.period ?? "") ? sp.period : "last30") as "week" | "month" | "last30";
  const range = periodBounds(period, ent.timezone), tz = ent.timezone, demo = ent.demo, staff = isStaffRole(actor.role);
  const href = (patch: Record<string, string>) => `/app/results?${new URLSearchParams({ view, period, ...patch }).toString()}`;
  const [connections, campaigns, goals] = await Promise.all([
    db.cosConnection.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "asc" } }),
    db.cosCampaign.findMany({ where: { orgId: actor.orgId, status: { not: "archived" } }, orderBy: { createdAt: "desc" } }),
    db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null } }),
  ]);
  const broken = connections.filter((c) => ["failed", "disconnected"].includes(c.status));
  const layout = await getLayout(actor.orgId);
  const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Results" sub={`${range.label}${demo ? " · demo workspace: figures are synthetic" : ""}`}>
        <div className="flex flex-wrap gap-1 text-[13px]"><Link href={`/app/reports/print?month=${lastMonth}`} className="rounded-lg border border-[var(--los-line)] px-3 py-1.5">Monthly report (print)</Link><Link href="/app/results/heatmap" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5">Heatmap</Link>{([["week", "This week"], ["month", "This month"], ["last30", "Last 30 days"]] as const).map(([k, l]) => <Link key={k} href={href({ period: k })} aria-current={k === period ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${k === period ? "bg-[var(--los-fg)] font-semibold text-[var(--los-surface)]" : "border border-[var(--los-line)]"}`}>{l}</Link>)}</div>
      </PageHeader>
      <Tabs active={view} items={[{ key: "business", label: "Business outcomes", href: href({ view: "business" }) }, { key: "campaigns", label: "Campaigns", href: href({ view: "campaigns" }) }, { key: "content", label: "Content", href: href({ view: "content" }) }]} />
      {broken.length > 0 && <div role="status" className="mb-4 rounded-lg border border-[var(--los-warn)] px-4 py-2.5 text-[13px]">{broken.map((c) => `${c.accountLabel ?? c.provider}: ${c.status}${c.lastError ? ` (${c.lastError})` : ""}`).join(" · ")} — numbers from these accounts are not updating. <Link className="font-semibold underline" href="/app/settings/connections">Reconnect</Link></div>}

      {view === "business" && <><Business orgId={actor.orgId} range={range} demo={demo} goals={goals} /><Reviews orgId={actor.orgId} canSync={can(actor.role, "os.settings") || can(actor.role, "work.execute")} />
        <details className="mt-4 rounded-xl border border-[var(--los-line)] p-4 text-[13px]"><summary className="cursor-pointer font-semibold">Report widgets (hide / reorder)</summary>
          <ul className="mt-2 divide-y divide-[var(--los-line)]">{layout.map((w, i) => { const def = WIDGETS.find((x) => x.key === w.key)!; return <li key={w.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span className={w.hidden ? "text-[var(--los-faint)] line-through" : ""}>{def.label} <span className="text-[11.5px] text-[var(--los-faint)]">· {PILLAR_LABEL[def.pillar]}</span></span><span className="flex gap-1">{i > 0 && <ActionForm action={widgetSet} submit="↑" tone="ghost" hidden={{ key: w.key, op: "up" }} />}{i < layout.length - 1 && <ActionForm action={widgetSet} submit="↓" tone="ghost" hidden={{ key: w.key, op: "down" }} />}<ActionForm action={widgetSet} submit={w.hidden ? "Show" : "Hide"} tone="ghost" hidden={{ key: w.key, op: w.hidden ? "show" : "hide" }} /></span></li>; })}</ul>
          <p className="mt-2 text-[12px] text-[var(--los-faint)]">The order and hidden widgets apply to the monthly print report too.</p>
        </details></>}
      {view === "campaigns" && <><Scorecards orgId={actor.orgId} range={range} demo={demo} period={period} /><Campaigns orgId={actor.orgId} range={range} demo={demo} campaigns={campaigns} /></>}
      {view === "content" && <Content orgId={actor.orgId} range={range} demo={demo} tz={tz} />}

      {staff && can(actor.role, "work.execute") && ent.accessMode === "active" && (
        <details className="mt-6 rounded-xl border border-[var(--los-line)] p-4 text-[13.5px]"><summary className="cursor-pointer font-semibold">Record or import numbers by hand</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <ActionForm action={metricRecord} submit="Record" className="grid gap-2 md:grid-cols-2">
              <div><Label>Metric</Label><select name="metric" className={field}>{Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></div>
              <div><Label>Platform / source</Label><Input name="provider" placeholder="linkedin, ga4, google_ads…" required /></div>
              <div><Label>Value</Label><Input name="value" inputMode="decimal" required /></div>
              <div><Label>Day</Label><Input name="day" type="date" required /></div>
              <div><Label>Kind</Label><select name="kind" className={field}><option value="daily">That day only</option><option value="lifetime">Running total as of that day</option></select></div>
              <div><Label>Campaign</Label><select name="campaignId" className={field}><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Label>Currency (money only)</Label><Input name="currency" maxLength={3} placeholder={ent.currency} /></div>
              <div><Label>Confidence</Label><select name="grade" className={field}><option value="C">C — entered by hand</option><option value="B">B — copied from the platform</option><option value="D">D — estimate</option></select></div>
            </ActionForm>
            <ActionForm action={metricImport} submit="Import" tone="ghost" className="grid gap-2"><Label>Paste CSV: date,provider,metric,kind,value,campaign_code,post_url,currency</Label><textarea name="csv" rows={7} className={`${field} font-mono text-[12px]`} required /></ActionForm>
          </div>
          <p className="mt-2 text-[12px] text-[var(--los-faint)]">Hand-entered and imported numbers are always labelled as such next to the figure.</p>
        </details>
      )}
    </div>
  );
}

type Range = { start: Date; end: Date };

async function Business({ orgId, range, demo, goals }: { orgId: string; range: Range; demo: boolean; goals: { id: string; metric: string; target: number; unit: string; currentValue: number | null; currentLabel: string; horizon: string }[] }) {
  const [o, delivered, site] = await Promise.all([
    businessOutcomes(orgId, range, { includeDemo: demo }),
    db.cosWorkItem.count({ where: { orgId, deliveredAt: { gte: range.start, lt: range.end }, ...(demo ? {} : { demo: false }) } }),
    db.cosMetricSnapshot.groupBy({ by: ["metric", "provider", "source"], where: { orgId, kind: "daily", metric: { in: ["sessions", "key_events"] }, periodStart: { gte: range.start, lt: range.end }, ...(demo ? {} : { demo: false }) }, _sum: { value: true } }),
  ]);
  const search = await db.cosMetricPoint.aggregate({ where: { orgId, provider: "gsc", metric: "clicks", day: { gte: range.start, lt: range.end } }, _sum: { value: true }, _count: true });
  const sum = (m: string) => { const rows = site.filter((r) => r.metric === m); return rows.length ? rows.reduce((a, r) => a + (r._sum.value ?? 0), 0) : null; };
  const src = (m: string) => { const s = new Set(site.filter((r) => r.metric === m).map((r) => r.source)); return s.size === 0 ? undefined : s.size > 1 ? "Mixed sources" : SOURCE_LABEL[[...s][0]]; };
  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Enquiries" value={o.leads.total} note={`${o.leads.known} tagged link · ${o.leads.self_reported} told us · ${o.leads.unknown} unknown`} />
        <Figure label="Qualified" value={o.qualified} />
        <Figure label="Opportunities opened" value={o.opportunitiesOpened} />
        {Object.keys(o.sales).length === 0 ? <Figure label="Recorded sales" value={null} note="No sale recorded in this period. Record sales on the lead." /> : Object.entries(o.sales).map(([cur, s]) => <Figure key={cur} label={`Recorded sales (${cur})`} value={money(s.valueMinor, cur)} note={`${s.count} sale(s): ${money(s.known, cur)} tagged link · ${money(s.selfReported, cur)} told us · ${money(s.unknown, cur)} unknown`} />)}
        <Figure label="Website sessions" value={sum("sessions")} source={src("sessions")} note={sum("sessions") === null ? "Website analytics is not connected." : METRICS.sessions.definition} />
        <Figure label="Website key events" value={sum("key_events")} source={src("key_events")} />
        <Figure label="Search clicks" value={search._count ? search._sum.value : null} source={search._count ? "Synced from Search Console" : undefined} note={search._count ? "Clicks from Google results — a different thing from website sessions." : "Search Console is not connected."} />
        <Figure label="Work delivered" value={delivered} note="Counted on the day each item was first delivered." />
      </div>
      <p className="mb-5 text-[12px] text-[var(--los-faint)]">{o.limitations} Amounts are never added across currencies.</p>
      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Goals</div>
        {goals.length === 0 ? <Notice title="No goals agreed yet" href="/app/strategy" action="Open Growth Plan">Goals give every campaign and project something to be measured against.</Notice> : <ul className="divide-y divide-[var(--los-line)] text-[13.5px]">{goals.map((g) => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"><span className="font-medium">{g.metric}</span><span className="text-[var(--los-muted)]">{g.currentValue === null ? "current value not available" : `${g.currentValue.toLocaleString("en")} (${g.currentLabel})`} → target {g.target.toLocaleString("en")} {g.unit} · {g.horizon}</span></li>)}</ul>}
      </Card>
    </>
  );
}

async function Scorecards({ orgId, range, demo, period }: { orgId: string; range: Range; demo: boolean; period: string }) {
  const [rows, byLink] = await Promise.all([
    scorecardSummary(orgId, range, demo),
    db.losFormSubmission.groupBy({ by: ["campaignId", "trackingCode"], where: { orgId, score: { not: null }, createdAt: { gte: range.start, lt: range.end } }, _count: true }),
  ]);
  if (rows.length === 0) return null;
  return (
    <Card className="mb-4 p-5 text-[13.5px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="text-[15px] font-bold">Scorecards</div><a className="text-[12.5px] font-semibold text-[var(--los-brand)] hover:underline" href={`/api/os/export/scorecard?period=${period}`}>Download CSV</a></div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.campaignId} className="rounded-lg border border-[var(--los-line)] p-3">
            <div className="font-semibold">{r.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]"><span>Starts <b>{r.starts}</b></span><span>→ completions <b>{r.completions}</b>{r.starts ? <span className="text-[var(--los-faint)]"> ({Math.round((r.completions / r.starts) * 100)}%)</span> : null}</span><span>→ leads <b>{r.leads}</b></span><span>Average score {r.averageScore === null ? <span className="text-[var(--los-faint)]">n/a</span> : <b>{r.averageScore}</b>}</span></div>
            <div className="mt-1 text-[12.5px] text-[var(--los-muted)]">Bands: {Object.entries(r.bands).map(([b, n]) => `${b.replace(/_/g, " ")} ${n}`).join(" · ") || "—"}</div>
            {byLink.filter((l) => l.campaignId === r.campaignId).length > 0 && <div className="mt-1 text-[12.5px] text-[var(--los-muted)]">By link: {byLink.filter((l) => l.campaignId === r.campaignId).map((l) => `${l.trackingCode ?? "direct"} ${l._count}`).join(" · ")}</div>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-[var(--los-faint)]">Self-reported answers; counts and averages of stored scores only. Band counts are never added to reach or sessions.</p>
    </Card>
  );
}

async function Campaigns({ orgId, range, demo, campaigns }: { orgId: string; range: Range; demo: boolean; campaigns: { id: string; name: string; paidMode: string; goalId: string | null }[] }) {
  if (campaigns.length === 0) return <Card><Notice title="No campaigns yet" href="/app/content?view=campaigns" action="Create a campaign">Campaign results appear once content is published under a campaign.</Notice></Card>;
  const rows = await Promise.all(campaigns.slice(0, 20).map(async (c) => ({ c, content: await campaignContentTotals(orgId, c.id, range, demo), site: await metricsFor(orgId, { campaignId: c.id }, range, demo), o: await businessOutcomes(orgId, range, { campaignId: c.id, includeDemo: demo }) })));
  const cell = (v: number | undefined | null) => (v === undefined || v === null ? <span className="text-[var(--los-faint)]">n/a</span> : v.toLocaleString("en"));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">Campaign comparison for the selected period</caption>
        <thead><tr className="border-b border-[var(--los-line)] text-[12px] text-[var(--los-muted)]"><th scope="col" className="px-4 py-2">Campaign</th><th scope="col" className="px-3 py-2">Traffic</th><th scope="col" className="px-3 py-2">Posts live</th><th scope="col" className="px-3 py-2">Impressions</th><th scope="col" className="px-3 py-2">Sessions</th><th scope="col" className="px-3 py-2">Enquiries</th><th scope="col" className="px-3 py-2">Qualified</th><th scope="col" className="px-3 py-2">Recorded sales</th></tr></thead>
        <tbody>{rows.map(({ c, content, site, o }) => (
          <tr key={c.id} className="border-b border-[var(--los-line)]">
            <th scope="row" className="px-4 py-2 font-medium"><Link href={`/app/content/campaigns/${c.id}`} className="text-[var(--los-brand)] hover:underline">{c.name}</Link></th>
            <td className="px-3 py-2 capitalize">{c.paidMode}</td><td className="px-3 py-2">{content.publications.length}</td>
            <td className="px-3 py-2">{cell(content.totals.find((t) => t.metric === "impressions")?.value)}</td><td className="px-3 py-2">{cell(site.find((m) => m.metric === "sessions")?.value)}</td>
            <td className="px-3 py-2">{o.leads.total}</td><td className="px-3 py-2">{o.qualified}</td>
            <td className="px-3 py-2">{Object.keys(o.sales).length ? Object.entries(o.sales).map(([cur, s]) => money(s.valueMinor, cur)).join(" + ") : <span className="text-[var(--los-faint)]">none recorded</span>}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="px-4 py-2 text-[12px] text-[var(--los-faint)]">“n/a” means the platform or website analytics did not supply the number — it is not zero. Organic and paid campaigns are listed separately and never blended.</p>
    </Card>
  );
}

async function Content({ orgId, range, demo, tz }: { orgId: string; range: Range; demo: boolean; tz: string }) {
  const pubs = await db.cosPublication.findMany({ where: { orgId, status: "published", ...(demo ? {} : { adapter: { not: "test" } }) }, include: { variant: { select: { workItemId: true, format: true, workItem: { select: { title: true } } } } }, orderBy: { publishedAt: "desc" }, take: 40 });
  if (pubs.length === 0) return <Card><Notice title="Nothing published yet" href="/app/content" action="Open Content">Each published post, article and video appears here with the numbers its platform reports.</Notice></Card>;
  const rows = await Promise.all(pubs.map(async (p) => ({ p, values: await metricsFor(orgId, { publicationId: p.id }, range, demo) })));
  const clicks = await clicksByVariant(orgId, pubs.map((p) => p.variantId), range);
  return (
    <Card>
      <ul className="divide-y divide-[var(--los-line)]">
        {rows.map(({ p, values }) => (
          <li key={p.id} className="px-5 py-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/app/content/${p.variant.workItemId}`} className="font-semibold text-[var(--los-brand)] hover:underline">{p.variant.workItem.title}</Link><span className="text-[12px] text-[var(--los-faint)]">{CHANNELS[p.channel]?.label} · {p.variant.format.replace(/_/g, " ")} · {p.publishedAt ? formatInZone(p.publishedAt, tz, { dateStyle: "medium" }) : ""}{p.externalUrl ? <> · <a className="underline" href={p.externalUrl} target="_blank" rel="noreferrer">view</a></> : null}</span></div>
            {clicks.has(p.variantId) && <p className="text-[12.5px]"><span className="text-[var(--los-muted)]">Short-link clicks (our count, bots excluded): </span><b>{clicks.get(p.variantId)!.toLocaleString("en")}</b></p>}
            {values.length === 0 ? <p className="text-[12.5px] text-[var(--los-muted)]">{p.adapter === "manual" ? "Published by hand — the platform’s numbers are not pulled in. They can be recorded below." : "No numbers available: statistics access is not connected for this account, or the first sync has not run yet."}</p> : (
              <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{values.map((v) => <div key={`${v.provider}${v.metric}${v.kind}`}><dt className="inline text-[12px] text-[var(--los-muted)]" title={METRICS[v.metric]?.definition}>{METRICS[v.metric]?.label ?? v.metric}{v.kind === "lifetime" ? " (total to date)" : ""}: </dt><dd className="inline font-semibold">{v.value.toLocaleString("en")}</dd><span className="ml-1 text-[11px] text-[var(--los-faint)]">{SOURCE_LABEL[v.source] ?? "Mixed sources"} · {formatInZone(v.syncedAt, tz, { dateStyle: "short" })}</span></div>)}</dl>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// WP-49 · Google Business Profile reviews: lifetime count + average (latest sync), never summed across periods.
async function Reviews({ orgId, canSync }: { orgId: string; canSync: boolean }) {
  const enabled = approvalProviderEnabled("gbp");
  const r = enabled ? await reviewsSummary(orgId) : null;
  return (
    <Card className="mt-4 p-4 text-[13.5px]">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><div className="text-[15px] font-bold">Google reviews</div>{enabled && canSync && <ActionForm action={reviewsSync} submit="Sync now" tone="ghost" />}</div>
      {!enabled ? <p className="text-[var(--los-faint)]">Awaiting approval — Google Business Profile API access is not enabled on this server yet.</p> : !r ? <p className="text-[var(--los-faint)]">No reviews synced yet. Connect Google (Settings → Connections) and press Sync.</p> : (
        <>
          <div className="text-[22px] font-extrabold">{r.average} <span className="text-[13px] font-normal text-[var(--los-muted)]">average · {r.count} reviews · synced {r.syncedAt?.toISOString().slice(0, 10)}</span></div>
          <ul className="mt-2 space-y-1 text-[13px]">{r.latest.map((x) => <li key={x.id}><b>{"★".repeat(x.rating)}</b> <span className="text-[var(--los-faint)]">{x.at.toISOString().slice(0, 10)}</span>{x.snippet ? ` — ${x.snippet}` : ""}</li>)}</ul>
        </>
      )}
    </Card>
  );
}
