import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { CHANNELS } from "@/lib/os/channels";
import { campaignContentTotals, metricsFor, METRICS, SOURCE_LABEL } from "@/lib/os/metrics";
import { businessOutcomes } from "@/lib/os/outcomes";
import { periodBounds, formatInZone } from "@/lib/os/time";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { field, PageHeader } from "@/components/os/bits";
import { Figure, money, Notice, Pill } from "@/components/os/v2";
import { campaignUpdate, captureFormLink } from "../../../_os/v2";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, ent } = await requireModule("content", "work.view");
  const { id } = await params;
  const c = await db.cosCampaign.findFirst({ where: { id, orgId: actor.orgId } });
  if (!c) notFound();
  const manage = can(actor.role, "work.manage");
  const range = periodBounds("last30", ent.timezone);
  const [goal, goals, forms, content, site, outcomes] = await Promise.all([
    c.goalId ? db.cosGoal.findFirst({ where: { id: c.goalId, orgId: actor.orgId } }) : null,
    db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null } }),
    db.losCampaign.findMany({ where: { orgId: actor.orgId }, select: { id: true, name: true, marketingCampaignId: true, status: true } }),
    campaignContentTotals(actor.orgId, c.id, range, ent.demo),
    metricsFor(actor.orgId, { campaignId: c.id }, range, ent.demo),
    businessOutcomes(actor.orgId, range, { campaignId: c.id, includeDemo: ent.demo }),
  ]);
  const linkedForms = forms.filter((f) => f.marketingCampaignId === c.id);
  const sessions = site.find((m) => m.metric === "sessions");

  return (
    <div className="max-w-[1100px]">
      <Link href="/app/content?view=campaigns" className="text-[13px] text-[var(--los-muted)] hover:underline">← Campaigns</Link>
      <PageHeader title={c.name} sub={`${goal ? `Serves the goal “${goal.metric} → ${goal.target} ${goal.unit}”` : "No goal linked yet"} · link tag: ${c.code}`}><Pill value={c.status} /></PageHeader>

      <h2 className="mb-2 text-[15px] font-bold">Results — {range.label}</h2>
      <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["impressions", "views", "link_clicks"] as const).map((m) => <Figure key={m} label={METRICS[m].label} value={content.totals.find((t) => t.metric === m)?.value} note={METRICS[m].definition} />)}
        <Figure label="Website sessions from this campaign" value={sessions?.value} source={sessions ? SOURCE_LABEL[sessions.source] ?? "Mixed sources" : undefined} note={sessions ? undefined : "Connect website analytics, or record it by hand in Results."} />
        <Figure label="Enquiries" value={outcomes.leads.total} note={`${outcomes.leads.known} through a tagged link · ${outcomes.leads.unknown} source unknown`} />
        <Figure label="Qualified" value={outcomes.qualified} />
        <Figure label="Opportunities opened" value={outcomes.opportunitiesOpened} />
        {Object.keys(outcomes.sales).length === 0 ? <Figure label="Recorded sales" value={null} note="No sale has been recorded against this campaign in this period." /> : Object.entries(outcomes.sales).map(([cur, s]) => <Figure key={cur} label={`Recorded sales (${cur})`} value={money(s.valueMinor, cur)} note={`${s.count} sale(s) · ${money(s.known, cur)} through a tagged link`} />)}
      </div>
      <p className="mb-5 text-[12px] text-[var(--los-faint)]">{content.note} {outcomes.limitations}</p>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Published in this campaign</div>
          {content.publications.length === 0 ? <Notice title="Nothing published yet" href="/app/content" action="Open the calendar">Approved versions appear here once they go live, with the numbers each platform reports.</Notice> : (
            <ul className="divide-y divide-[var(--los-line)] text-[13px]">
              {content.publications.map((p) => (
                <li key={p.id} className="px-5 py-2.5">
                  <div className="flex items-center justify-between gap-2"><Link href={`/app/content/${p.variant.workItemId}`} className="font-medium text-[var(--los-brand)] hover:underline">{p.variant.workItem.title}</Link><span className="text-[12px] text-[var(--los-faint)]">{CHANNELS[p.channel]?.label} · {p.publishedAt ? formatInZone(p.publishedAt, ent.timezone, { dateStyle: "medium" }) : ""}</span></div>
                  <div className="text-[12px] text-[var(--los-muted)]">{p.values.length === 0 ? (p.adapter === "manual" ? "Published by hand — no platform numbers. Record them in Results." : "No numbers yet — the account is not connected for statistics, or the first sync has not run.") : p.values.map((v) => `${METRICS[v.metric]?.label ?? v.metric}: ${v.value.toLocaleString("en")}`).join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Lead-capture forms for this campaign</div>
          {linkedForms.length === 0 ? <Notice title="No form linked">Link a lead-capture form so its enquiries count here. People who arrive through a tagged link are traced to the exact post.</Notice> : <ul className="divide-y divide-[var(--los-line)] text-[13px]">{linkedForms.map((f) => <li key={f.id} className="flex items-center justify-between px-5 py-2"><Link href={`/app/campaigns/${f.id}`} className="text-[var(--los-brand)] hover:underline">{f.name}</Link><Pill value={f.status} /></li>)}</ul>}
          {manage && forms.some((f) => f.marketingCampaignId !== c.id) && (
            <ActionForm action={captureFormLink} submit="Link form" tone="ghost" hidden={{ campaignId: c.id }} className="flex items-end gap-2 border-t border-[var(--los-line)] p-3 text-[13px]"><select name="losCampaignId" className={field} aria-label="Lead-capture form">{forms.filter((f) => f.marketingCampaignId !== c.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></ActionForm>
          )}
        </Card>

        <Card className="p-5 md:col-span-2">
          <div className="mb-2 text-[15px] font-bold">Brief</div>
          {manage ? (
            <ActionForm action={campaignUpdate} submit="Save brief" hidden={{ id: c.id, channelsSent: "1" }} className="grid gap-2 text-[13.5px] md:grid-cols-2">
              <div><Label>Name</Label><Input name="name" defaultValue={c.name} /></div>
              <div><Label>Goal</Label><select name="goalId" defaultValue={c.goalId ?? ""} className={field}><option value="">No goal</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.metric} → {g.target} {g.unit}</option>)}</select></div>
              <div className="md:col-span-2"><Label>Objective</Label><Input name="objective" defaultValue={c.objective ?? ""} /></div>
              <div><Label>Audience</Label><textarea name="audience" rows={2} defaultValue={c.audience ?? ""} className={field} /></div>
              <div><Label>Key message</Label><textarea name="keyMessage" rows={2} defaultValue={c.keyMessage ?? ""} className={field} /></div>
              <div><Label>Offer</Label><Input name="offer" defaultValue={c.offer ?? ""} /></div>
              <div><Label>Call to action</Label><Input name="cta" defaultValue={c.cta ?? ""} /></div>
              <div><Label>Where links lead (https)</Label><Input name="destinationUrl" type="url" defaultValue={c.destinationUrl ?? ""} /></div>
              <div><Label>Status</Label><select name="status" defaultValue={c.status} className={field}>{["draft", "active", "paused", "completed", "archived"].map((s) => <option key={s}>{s}</option>)}</select></div>
              <fieldset className="flex flex-wrap gap-2 md:col-span-2"><legend className="mb-1 text-[12.5px] text-[var(--los-muted)]">Channels</legend>{Object.entries(CHANNELS).map(([k, ch]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="channels" value={k} defaultChecked={c.channels.includes(k)} />{ch.label}</label>)}</fieldset>
              <p className="text-[12px] text-[var(--los-faint)] md:col-span-2">Changing the brief flags this campaign’s open content for review. Approvals already given are not withdrawn.</p>
            </ActionForm>
          ) : (
            <dl className="grid gap-2 text-[13.5px] md:grid-cols-2">{([["Objective", c.objective], ["Audience", c.audience], ["Key message", c.keyMessage], ["Offer", c.offer], ["Call to action", c.cta], ["Links lead to", c.destinationUrl]] as const).map(([k, v]) => <div key={k}><dt className="text-[12px] text-[var(--los-muted)]">{k}</dt><dd>{v || "—"}</dd></div>)}</dl>
          )}
        </Card>
      </div>
    </div>
  );
}
