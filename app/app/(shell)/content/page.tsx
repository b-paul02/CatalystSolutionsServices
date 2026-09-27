import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import { CHANNELS } from "@/lib/os/channels";
import { formatInZone, zonedDay, zonedToUtc } from "@/lib/os/time";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { field, PageHeader, StateBadge } from "@/components/os/bits";
import { Notice, Pill, Tabs } from "@/components/os/v2";
import { fillCalendar, produceAll, produceItem } from "../_os/actions";
import { productionOf, isFormat } from "@/lib/os/contentPipeline";
import { AutoRefresh } from "@/components/os/StudioForm";
import { isStaffRole } from "@/lib/leados/rbac";
import GrowthStep from "@/components/os/GrowthStep";
import MonthCalendar from "./MonthCalendar";
import { campaignCreate, masterCreate, variantBulk } from "../_os/v2";

export const metadata = { title: "Content" };

function BulkWrap({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return enabled ? <ActionForm action={variantBulk} submit="Move selected" tone="ghost" className="p-3 text-[13px]">{children}</ActionForm> : <div className="p-3 text-[13px]">{children}</div>;
}

const STATES = ["draft", "internal_qa", "client_review", "approved", "scheduled", "published", "failed", "needs_review"];

// Content calendar of CHANNEL VARIANTS in the workspace time zone. Every variant has its own
// approval and publication; bulk actions move each one only if IT passes its own checks.
export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, ent } = await requireModule("content", "work.view");
  const sp = await searchParams;
  const tz = ent.timezone;
  const startDay = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : zonedDay(new Date(), tz);
  const start = zonedToUtc(`${startDay}T00:00`, tz).utc;
  const end = new Date(start.getTime() + 14 * 86_400_000);
  const view = sp.view === "campaigns" ? "campaigns" : sp.view === "month" ? "month" : "calendar";
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : zonedDay(new Date(), tz).slice(0, 7);

  const [campaigns, goals, members, masters] = await Promise.all([
    db.cosCampaign.findMany({ where: { orgId: actor.orgId, status: { not: "archived" } }, orderBy: { createdAt: "desc" } }),
    db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null } }),
    db.losMembership.findMany({ where: { orgId: actor.orgId }, include: { user: { select: { name: true, email: true } } } }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, type: "content", state: { notIn: ["cancelled", "closed"] }, ...(sp.campaign ? { campaignId: sp.campaign } : {}), ...(sp.plan ? { planId: sp.plan } : {}) }, orderBy: { createdAt: "desc" }, take: 60, include: { variants: { select: { id: true, state: true } } } }),
  ]);
  const variants = await db.cosContentVariant.findMany({
    where: { orgId: actor.orgId, state: { in: sp.status && STATES.includes(sp.status) ? [sp.status] : STATES }, ...(sp.channel && CHANNELS[sp.channel] ? { channel: sp.channel } : {}), ...(sp.owner ? { ownerId: sp.owner } : {}), ...(sp.campaign ? { workItem: { campaignId: sp.campaign } } : {}) },
    include: { workItem: { select: { title: true, campaignId: true } } }, orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }], take: 300,
  });
  const inWindow = variants.filter((v) => v.scheduledAt && v.scheduledAt >= start && v.scheduledAt < end);
  const unscheduled = variants.filter((v) => !v.scheduledAt && !["published"].includes(v.state));
  const days = Array.from({ length: 14 }, (_, i) => zonedDay(new Date(start.getTime() + i * 86_400_000 + 12 * 3_600_000), tz));
  const manage = can(actor.role, "work.manage"), make = manage || can(actor.role, "work.execute");
  const q = (patch: Record<string, string | undefined>) => `/app/content?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;
  const shift = (n: number) => q({ start: zonedDay(new Date(start.getTime() + n * 86_400_000 + 12 * 3_600_000), tz) });
  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;
  // WP-19 production status per master (from payload.production); the page polls while anything is queued/drafting
  const prod = new Map(masters.map((m) => [m.id, { p: productionOf(m.payload), format: (() => { try { return String((JSON.parse(m.payload ?? "{}") as { format?: string }).format ?? ""); } catch { return ""; } })() }]));
  const busy = [...prod.values()].some((x) => x.p?.status === "queued" || x.p?.status === "drafting");
  const staff = isStaffRole(actor.role) && can(actor.role, "work.execute");
  const PROD_LABEL: Record<string, string> = { queued: "queued", drafting: "drafting…", draft_ready: "draft ready", failed: "failed", needs_asset: "needs asset" };
  const justReady = masters.filter((m) => prod.get(m.id)?.p?.status === "draft_ready" && prod.get(m.id)?.p?.finishedAt && Date.now() - new Date(prod.get(m.id)!.p!.finishedAt!).getTime() < 10 * 60_000).length;

  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Content" sub={`Times shown in ${tz}. Each channel version is approved and published on its own.`}>
        {view === "calendar" && <div className="flex gap-2 text-[13px]"><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href={shift(-14)}>← Earlier</Link><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href={q({ start: undefined })}>Today</Link><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href={shift(14)}>Later →</Link></div>}
      </PageHeader>
      <Tabs active={view} items={[{ key: "calendar", label: "Calendar", href: q({ view: undefined }) }, { key: "month", label: "Month", href: q({ view: "month" }) }, { key: "campaigns", label: `Campaigns (${campaigns.length})`, href: q({ view: "campaigns" }) }]} />
      {view === "month" && <MonthView orgId={actor.orgId} month={month} tz={tz} />}

      {view === "month" ? null : view === "calendar" ? (
        <>
          {busy && <AutoRefresh everyMs={5000} />}
          {sp.plan && <p className="mb-3 text-[12.5px] text-[var(--los-muted)]">Showing the calendar generated for plan <code>{sp.plan}</code>. <Link className="underline" href={q({ plan: undefined })}>Show all</Link></p>}
          {justReady > 0 && <div className="mb-4"><GrowthStep done={`${justReady} draft${justReady === 1 ? "" : "s"} produced.`} step={{ pillar: "digital_visibility", metric: "impressions", metricLabel: "Impressions of published content", action: { kind: "work_item", label: "Send drafts to QA", title: "Review produced drafts and move them to internal QA", type: "task", serviceSlug: "content" } }} /></div>}
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-[13px]" aria-label="Filter the calendar">
            <input type="hidden" name="start" value={startDay} />
            <label className="flex flex-col gap-1">Campaign<select name="campaign" defaultValue={sp.campaign ?? ""} className={field}><option value="">All</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="flex flex-col gap-1">Channel<select name="channel" defaultValue={sp.channel ?? ""} className={field}><option value="">All</option>{Object.entries(CHANNELS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></label>
            <label className="flex flex-col gap-1">Owner<select name="owner" defaultValue={sp.owner ?? ""} className={field}><option value="">Anyone</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name ?? m.user.email}</option>)}</select></label>
            <label className="flex flex-col gap-1">Status<select name="status" defaultValue={sp.status ?? ""} className={field}><option value="">Any</option>{STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label>
            <button className="rounded-lg border border-[var(--los-line)] px-3 py-2 font-semibold">Apply</button>
            {(sp.campaign || sp.channel || sp.owner || sp.status) && <Link href={`/app/content?start=${startDay}`} className="px-2 py-2 text-[var(--los-brand)]">Clear</Link>}
          </form>

          <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-7">
            {days.map((d) => {
              const items = inWindow.filter((v) => zonedDay(v.scheduledAt!, tz) === d);
              return (
                <Card key={d} className="min-h-[112px] p-2">
                  <div className="mb-1 text-[11.5px] font-semibold text-[var(--los-faint)]">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</div>
                  {items.map((v) => (
                    <Link key={v.id} href={`/app/content/${v.workItemId}#v-${v.id}`} className="mb-1 block rounded-md bg-[var(--los-surface-2)] px-1.5 py-1 text-[12px] hover:bg-[var(--los-brand-soft)]">
                      <div className="truncate font-medium">{v.workItem.title}</div>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--los-faint)]"><span>{formatInZone(v.scheduledAt!, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · {CHANNELS[v.channel]?.label ?? v.channel}</span><Pill value={v.state} /></div>
                    </Link>
                  ))}
                </Card>
              );
            })}
          </div>
          {variants.length === 0 && <Card className="mb-5"><Notice title="No content matches" href="/app/content" action="Clear filters">{masters.length === 0 ? "Start with a campaign, then add a master piece and its channel versions." : "Try a different filter, or open a master piece below to add channel versions."}</Notice></Card>}

          {unscheduled.length > 0 && (
            <Card className="mb-5">
              <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Not scheduled yet ({unscheduled.length})</div>
              <BulkWrap enabled={make}>
                <ul className="mb-3 divide-y divide-[var(--los-line)]">
                  {unscheduled.slice(0, 40).map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                      {make && <input type="checkbox" name="ids" value={v.id} aria-label={`Select ${v.workItem.title} for ${CHANNELS[v.channel]?.label}`} />}
                      <Link href={`/app/content/${v.workItemId}#v-${v.id}`} className="min-w-0 flex-1 truncate font-medium text-[var(--los-brand)] hover:underline">{v.workItem.title}</Link>
                      <span className="text-[12px] text-[var(--los-faint)]">{CHANNELS[v.channel]?.label} · {v.format.replace(/_/g, " ")}{campaignName(v.workItem.campaignId) ? ` · ${campaignName(v.workItem.campaignId)}` : ""}</span>
                      {v.sourceChanged && <Pill value="needs_review" label="source changed" />}
                      <Pill value={v.state} />
                    </li>
                  ))}
                </ul>
                {make && <label className="mr-2 inline-flex items-center gap-2">Move to<select name="to" className={`${field} !w-auto`}><option value="internal_qa">Internal QA</option><option value="client_review">Client review</option><option value="cancelled">Cancelled</option></select></label>}
                {make && <p className="mt-2 text-[12px] text-[var(--los-faint)]">Each version is checked on its own — one that fails its checks stays where it is and is reported.</p>}
              </BulkWrap>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Master pieces{staff && masters.some((m) => { const x = prod.get(m.id)!; return isFormat(x.format) && x.p?.status !== "draft_ready"; }) && <ActionForm action={produceAll} submit="Produce all drafts" tone="ghost" hidden={{ start: startDay, planId: sp.plan ?? "" }} confirm="Draft every item in this window that has a production format? Text is Catalyst-metered; images use the client's credits only with their authorisation, otherwise the built-in template." />}</div>
              {masters.length === 0 ? <Notice title="No master pieces yet">A master piece holds the brief, sources and core message. Channel versions are made from it.</Notice> : (
                <ul className="divide-y divide-[var(--los-line)]">
                  {masters.slice(0, 25).map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-[13.5px]">
                      <Link href={`/app/content/${m.id}`} className="min-w-0 flex-1 truncate font-medium text-[var(--los-brand)] hover:underline">{m.title}</Link>
                      <span className="flex shrink-0 flex-wrap items-center gap-2 text-[12px] text-[var(--los-faint)]">
                        {prod.get(m.id)?.format && <span>{prod.get(m.id)!.format.replace(/_/g, " ")}</span>}
                        {prod.get(m.id)?.p && <Pill value={prod.get(m.id)!.p!.status === "draft_ready" ? "approved" : prod.get(m.id)!.p!.status === "failed" ? "failed" : prod.get(m.id)!.p!.status === "needs_asset" ? "needs_review" : "scheduled"} label={PROD_LABEL[prod.get(m.id)!.p!.status]} />}
                        {prod.get(m.id)?.p?.status === "failed" && <span className="text-[var(--los-danger)]" title={prod.get(m.id)!.p!.reason}>{(prod.get(m.id)!.p!.reason ?? "").slice(0, 60)}</span>}
                        {staff && isFormat(prod.get(m.id)?.format ?? "") && !["queued", "drafting"].includes(prod.get(m.id)?.p?.status ?? "") && <ActionForm action={produceItem} submit={prod.get(m.id)?.p?.status === "failed" ? "Retry" : "Produce"} tone="ghost" hidden={{ id: m.id }} />}
                        {m.variants.length} version{m.variants.length === 1 ? "" : "s"}<StateBadge state={m.state} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {manage && (
              <Card className="p-5">
                <div className="mb-2 text-[15px] font-bold">New master piece</div>
                <ActionForm action={masterCreate} submit="Create and add versions" className="grid gap-2 text-[13.5px]">
                  <div><Label>Title</Label><Input name="title" required maxLength={160} /></div>
                  <div><Label>Campaign</Label><select name="campaignId" className={field}><option value="">No campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><Label>Brief</Label><textarea name="brief" rows={2} className={field} placeholder="Who it is for, the point to land, the action to take" /></div>
                </ActionForm>
                {aiAvailable() ? (
                  <details className="mt-4 text-[13px]"><summary className="cursor-pointer font-semibold">Or draft a two-week plan with AI</summary>
                    <ActionForm action={fillCalendar} submit="Generate draft ideas" tone="ghost" hidden={{ start: startDay }} className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-2">{["linkedin", "x", "facebook", "instagram", "blog"].map((c) => <label key={c} className="flex items-center gap-1 capitalize"><input type="checkbox" name="channels" value={c} defaultChecked={c === "linkedin" || c === "blog"} />{c}</label>)}</div>
                      <p className="text-[12px] text-[var(--los-faint)]">Creates draft ideas from your profile and audit. Nothing is published without internal QA and your approval.</p>
                    </ActionForm>
                  </details>
                ) : <p className="mt-4 text-[12.5px] text-[var(--los-faint)]">AI drafting requires setup. Everything here works by hand.</p>}
              </Card>
            )}
          </div>
        </>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Campaigns</div>
            {campaigns.length === 0 ? <Notice title="No campaigns yet">A campaign ties content to a goal and gives every published link a tag, so enquiries can be traced back to it.</Notice> : (
              <ul className="divide-y divide-[var(--los-line)]">
                {campaigns.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]">
                    <div className="min-w-0"><Link href={`/app/content/campaigns/${c.id}`} className="font-medium text-[var(--los-brand)] hover:underline">{c.name}</Link><div className="text-[12px] text-[var(--los-faint)]">{goals.find((g) => g.id === c.goalId)?.metric ?? "No goal linked"} · {c.channels.map((ch) => CHANNELS[ch]?.label ?? ch).join(", ") || "no channels chosen"}</div></div>
                    <Pill value={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {manage && (
            <Card className="p-5">
              <div className="mb-2 text-[15px] font-bold">New campaign</div>
              <ActionForm action={campaignCreate} submit="Create campaign" className="grid gap-2 text-[13.5px]">
                <div><Label>Name</Label><Input name="name" required maxLength={160} /></div>
                <div><Label>Goal it serves</Label><select name="goalId" className={field}><option value="">Choose a goal…</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.metric} → {g.target} {g.unit}</option>)}</select></div>
                <div><Label>Objective</Label><Input name="objective" placeholder="What should happen because of this campaign?" /></div>
                <div><Label>Where links should lead (https)</Label><Input name="destinationUrl" type="url" placeholder="https://…" /></div>
                <fieldset className="flex flex-wrap gap-2"><legend className="mb-1 text-[12.5px] text-[var(--los-muted)]">Channels</legend>{Object.entries(CHANNELS).map(([k, c]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="channels" value={k} />{c.label}</label>)}</fieldset>
                <div><Label>Traffic</Label><select name="paidMode" className={field}><option value="organic">Organic</option><option value="paid">Paid</option><option value="mixed">Both</option></select></div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// WP-20 · month view: every publication in the month (workspace zone), scheduled ones draggable.
async function MonthView({ orgId, month, tz }: { orgId: string; month: string; tz: string }) {
  const start = zonedToUtc(`${month}-01T00:00`, tz).utc;
  const [y, m] = month.split("-").map(Number);
  const end = zonedToUtc(`${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}-01T00:00`, tz).utc;
  const pubs = await db.cosPublication.findMany({ where: { orgId, scheduledAt: { gte: start, lt: end }, status: { not: "cancelled" } }, include: { variant: { select: { workItemId: true, workItem: { select: { title: true } } } } }, orderBy: { scheduledAt: "asc" }, take: 300 });
  return <Card className="mb-5 p-4"><MonthCalendar month={month} tz={tz} pubs={pubs.map((p) => ({ id: p.id, day: zonedDay(p.scheduledAt, tz), time: formatInZone(p.scheduledAt, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), title: p.variant.workItem.title, channel: CHANNELS[p.channel]?.label ?? p.channel, status: p.status, href: `/app/content/${p.variant.workItemId}#v-${p.variantId}`, draggable: p.status === "scheduled" }))} /></Card>;
}
