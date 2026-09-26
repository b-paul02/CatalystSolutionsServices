import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { entitlements } from "@/lib/os/entitlements";
import { canSeeAllUsage, channelsIn, parseBrief, toolByKey, type StudioOutput } from "@/lib/os/studio";
import { CHANNELS } from "@/lib/os/channels";
import { formatInZone } from "@/lib/os/time";
import { Card } from "@/components/leados/ui";
import { field, PageHeader, StateBadge } from "@/components/os/bits";
import { Notice } from "@/components/os/v2";
import ActionForm from "@/components/os/ActionForm";
import { AutoRefresh } from "@/components/os/StudioForm";
import { studioSave, studioSaveCampaign } from "../../../_os/studio";

export const metadata = { title: "AI Studio run" };

export default async function StudioRunPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOrgPage("ai.use");
  // members see their own runs; billing admins and staff leads see the workspace's. Another tenant's id is a 404.
  const op = await db.cosAiOperation.findFirst({ where: { id: (await params).id, orgId: actor.orgId, ...(canSeeAllUsage(actor.role) ? {} : { userId: actor.userId }) } });
  if (!op) notFound();
  const tool = toolByKey(op.toolKey);
  const [ent, campaigns] = await Promise.all([entitlements(actor.orgId), db.cosCampaign.findMany({ where: { orgId: actor.orgId, status: { not: "archived" } }, select: { id: true, name: true }, take: 50 })]);
  const out = (op.output ? JSON.parse(op.output) : {}) as StudioOutput;
  const flags = JSON.parse(op.flags) as string[], saved = JSON.parse(op.savedTo) as { kind: string; id: string }[];
  const pending = op.status === "queued" || op.status === "running";
  const canSave = op.status === "completed" && tool && tool.kind !== "image" && tool.kind !== "summary" && ent.modules.has("content") && ent.accessMode === "active";
  const savedCampaign = saved.find((s) => s.kind === "campaign");
  const asCampaign = canSave && op.toolKey === "campaign_brief";
  const [engagements, goals] = asCampaign && !savedCampaign ? await Promise.all([
    db.cosEngagement.findMany({ where: { orgId: actor.orgId, stage: { notIn: ["prospect", "declined", "offboarded"] } }, select: { id: true, name: true }, take: 30 }),
    db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null }, select: { id: true, metric: true, target: true, unit: true }, take: 50 }),
  ]) : [[], []];
  const brief = parseBrief(out.body ?? ""), briefChannels = channelsIn(brief.channels);
  const items = (out.items ?? []) as { dayOffset: number; channel: string; topic: string; hook: string }[];
  return (
    <div className="max-w-[860px]">
      {pending && <AutoRefresh />}
      <PageHeader title={tool?.label ?? op.toolKey} sub={`Started ${formatInZone(op.createdAt, ent.timezone)}`}><Link href="/app/studio" className="text-[13px] font-semibold text-[var(--los-brand)] hover:underline">AI Studio</Link></PageHeader>
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-3 text-[13px]" role="status" aria-live="polite">
          <StateBadge state={op.status} />
          {op.payer === "client_wallet"
            ? <span>{op.status === "completed" ? <>Charged <b>{op.chargedCredits}</b> of a maximum {op.maxCredits} credits.</> : pending || op.status === "uncertain" ? <>Up to {op.maxCredits} credits are <b>held</b>, not spent.</> : <>Not charged. The held credits were returned.</>}</span>
            : <span>Paid for by Catalyst — no client credits used.</span>}
        </div>
        {pending && <p className="mt-2 text-[13px] text-[var(--los-muted)]">{op.status === "queued" ? "Waiting to start…" : "Working on it…"} This page updates by itself. You can leave; the result will be in your history.</p>}
        {op.status === "uncertain" && <Notice kind="blocked" title="We are checking this one">{op.error} Our team has been alerted; there is nothing you need to do.</Notice>}
        {op.status === "failed" && <Notice kind="error" title="This run did not produce a draft" href={`/app/studio/${op.toolKey}`} action="Try again with a new quote">{op.error}</Notice>}
      </Card>

      {op.status === "completed" && tool?.kind === "image" && out.assetId && <Card className="p-5">
        {/* served through the membership-checked asset route, never a storage URL */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/os/assets/${out.assetId}`} alt="AI-generated draft image" className="max-h-[480px] rounded-lg" />
        <p className="mt-3 text-[13px]">Saved to <Link className="font-semibold text-[var(--los-brand)] underline" href="/app/assets">Assets</Link>. {tool.handoff}</p>
      </Card>}

      {op.status === "completed" && tool?.kind !== "image" && <Card className="p-5">
        {flags.length > 0 && <div className="mb-4 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px]"><b>Check before using:</b><ul className="ml-4 list-disc">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
        {tool?.handoff && <p className="mb-4 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px]">{tool.handoff}</p>}
        {saved.some((s) => s.kind === "work") && <p className="mb-4 text-[13px]">Saved: {saved.filter((s) => s.kind === "work").slice(0, 5).map((s) => <Link key={s.id} className="mr-2 font-semibold text-[var(--los-brand)] underline" href={`/app/content/${s.id}`}>open draft</Link>)}</p>}
        {tool?.kind === "calendar" && <ol className="mb-4 space-y-1 text-[13px]">{items.map((it, i) => <li key={i}><b>Day {it.dayOffset + 1}</b> · {CHANNELS[it.channel]?.label ?? it.channel} — {it.topic}{it.hook && <span className="text-[var(--los-muted)]"> · {it.hook}</span>}</li>)}</ol>}
        {savedCampaign && <p className="mb-4 rounded-lg bg-[var(--los-success-soft)] px-3 py-2 text-[13px]">Saved as a draft campaign: <Link className="font-semibold underline" href={`/app/content/campaigns/${savedCampaign.id}`}>open the campaign</Link>.</p>}
        {asCampaign && !savedCampaign && <details className="mb-5 rounded-lg border border-[var(--los-line)] p-4" open>
          <summary className="cursor-pointer text-[14px] font-bold">Save as a campaign</summary>
          <p className="my-2 text-[12.5px] text-[var(--los-muted)]">Check each field — it was filled from the brief below and you can change anything. Saving uses no credits and does not write the brief again. The campaign starts as a <b>draft</b>; the Catalyst team reviews and activates it.</p>
          <ActionForm action={studioSaveCampaign} submit="Save as a draft campaign" hidden={{ operationId: op.id }} className="space-y-3">
            <div><label htmlFor="c-name" className="mb-1 block text-[13px] font-semibold">Campaign name</label><input id="c-name" name="name" defaultValue={out.title ?? ""} maxLength={160} required className={field} /></div>
            {engagements.length > 0 && <div><label htmlFor="c-eng" className="mb-1 block text-[13px] font-semibold">Engagement</label><select id="c-eng" name="engagementId" defaultValue={op.engagementId ?? ""} className={field}>{engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>}
            {goals.length > 0 && <div><label htmlFor="c-goal" className="mb-1 block text-[13px] font-semibold">Goal it supports</label><select id="c-goal" name="goalId" defaultValue="" className={field}><option value="">No goal yet</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.metric}: {g.target} {g.unit}</option>)}</select></div>}
            {([["objective", "Objective"], ["audience", "Audience"], ["keyMessage", "Key message"], ["offer", "Offer"]] as const).map(([k, label]) => <div key={k}><label htmlFor={`c-${k}`} className="mb-1 block text-[13px] font-semibold">{label}</label><textarea id={`c-${k}`} name={k} rows={3} maxLength={k === "offer" ? 600 : 1000} defaultValue={brief[k]} className={field} /></div>)}
            <div><label htmlFor="c-cta" className="mb-1 block text-[13px] font-semibold">Call to action (optional)</label><input id="c-cta" name="cta" maxLength={200} className={field} /></div>
            <fieldset><legend className="mb-1 text-[13px] font-semibold">Channels</legend><div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{Object.entries(CHANNELS).map(([k, c]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="channels" value={k} defaultChecked={briefChannels.includes(k)} />{c.label}</label>)}</div></fieldset>
            {brief.measures && <p className="text-[12.5px] text-[var(--los-muted)]"><b>Measures in the brief</b> (kept with the saved brief; link a goal to track them): {brief.measures}</p>}
          </ActionForm>
        </details>}
        {canSave ? (
          <ActionForm action={studioSave} submit={tool!.kind === "calendar" ? "Save as content drafts" : "Save as a content draft"} hidden={{ operationId: op.id }} className="space-y-3">
            {tool!.kind === "calendar" ? <div><label htmlFor="s-start" className="mb-1 block text-[13px] font-semibold">Day 1 is</label><input id="s-start" type="date" name="startDate" className={field} /></div> : <>
              <div><label htmlFor="s-title" className="mb-1 block text-[13px] font-semibold">Title</label><input id="s-title" name="title" defaultValue={out.title ?? ""} maxLength={200} required className={field} /></div>
              <div><label htmlFor="s-body" className="mb-1 block text-[13px] font-semibold">Draft — edit before saving</label><textarea id="s-body" name="body" rows={14} defaultValue={out.body ?? ""} className={field} /></div>
              {(out.parts?.length ?? 0) > 0 && <div><label htmlFor="s-parts" className="mb-1 block text-[13px] font-semibold">Parts (separate with a line containing ---)</label><textarea id="s-parts" name="parts" rows={10} defaultValue={out.parts!.join("\n---\n")} className={field} /></div>}
              {out.meta?.title && <p className="text-[12.5px] text-[var(--los-muted)]">SEO title: {out.meta.title}<br />Description: {out.meta.description}</p>}
              {tool!.saveAs.length > 0 && <div><label htmlFor="s-as" className="mb-1 block text-[13px] font-semibold">Also create a channel version</label><select id="s-as" name="saveAs" className={field}><option value="">Master draft only</option>{tool!.saveAs.map(([c, f]) => <option key={`${c}:${f}`} value={`${c}:${f}`}>{CHANNELS[c]?.label} — {CHANNELS[c]?.formats[f]?.label}</option>)}</select></div>}
            </>}
            {campaigns.length > 0 && <div><label htmlFor="s-camp" className="mb-1 block text-[13px] font-semibold">Campaign</label><select id="s-camp" name="campaignId" defaultValue={op.campaignId ?? ""} className={field}><option value="">No campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
            <p className="text-[12.5px] text-[var(--los-muted)]">Saving creates a <b>draft</b>. It is reviewed by Catalyst and approved by you before it can be scheduled — using credits does not skip that.</p>
          </ActionForm>
        ) : <>
          <h2 className="text-[16px] font-bold">{out.title}</h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[13.5px]">{out.body}</pre>
          {(out.parts ?? []).map((p, i) => <pre key={i} className="mt-2 whitespace-pre-wrap border-t border-[var(--los-line)] pt-2 font-sans text-[13.5px]">{p}</pre>)}
          {tool?.kind === "summary" && <><h3 className="mt-4 text-[13px] font-bold">The stored numbers this was written from</h3><ul className="mt-1 text-[12.5px] text-[var(--los-muted)]">{(out.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}</ul></>}
          {tool?.kind === "text" && !ent.modules.has("content") && <p className="mt-4 text-[12.5px] text-[var(--los-muted)]">Content is not part of this workspace&apos;s scope, so this draft stays here in your history. Copy it, or ask Catalyst about adding Content.</p>}
        </>}
      </Card>}
    </div>
  );
}
