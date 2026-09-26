import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import { CHANNELS, formatSpec } from "@/lib/os/channels";
import { duplicatesOf, publishLink, variantCheck } from "@/lib/os/content";
import { formatInZone, utcToZonedInput } from "@/lib/os/time";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { field, PageHeader, StateBadge } from "@/components/os/bits";
import { Notice, Pill } from "@/components/os/v2";
import { saveWorkItem } from "../../_os/actions";
import { claimPropose, publicationCancel, publicationManual, publicationReconcile, publicationSchedule, sourceAdd, variantAckSource, variantComment, variantCreate, variantEdit, variantMove, variantsAiDraft } from "../../_os/v2";

export const metadata = { title: "Content piece" };

const NEXT: Record<string, [string, string][]> = {
  draft: [["internal_qa", "Send to internal QA"]], internal_qa: [["client_review", "Pass QA → client review"], ["draft", "Back to draft"]], failed: [["internal_qa", "Back to QA"]],
};

export default async function MasterPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, ent } = await requireModule("content", "work.view");
  const { id } = await params;
  const staff = isStaffRole(actor.role), make = can(actor.role, "work.execute") || can(actor.role, "work.manage"), tz = ent.timezone;
  const master = await db.cosWorkItem.findFirst({ where: { id, orgId: actor.orgId, type: "content" } });
  if (!master) notFound();
  const payload = JSON.parse(master.payload ?? "{}") as { brief?: string; body?: string; pillar?: string; sourceIds?: string[]; claimIds?: string[] };
  const [campaign, variants, sources, claims, connections, assets, events, approvals, revisions, publications] = await Promise.all([
    master.campaignId ? db.cosCampaign.findFirst({ where: { id: master.campaignId, orgId: actor.orgId } }) : null,
    db.cosContentVariant.findMany({ where: { orgId: actor.orgId, workItemId: master.id }, orderBy: { createdAt: "asc" } }),
    db.cosSource.findMany({ where: { orgId: actor.orgId, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.cosClaim.findMany({ where: { orgId: actor.orgId, status: { not: "retired" } }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.cosConnection.findMany({ where: { orgId: actor.orgId, status: { not: "disconnected" } }, orderBy: { createdAt: "asc" } }),
    db.cosAsset.findMany({ where: { orgId: actor.orgId, status: { not: "archived" }, kind: { in: ["image", "video"] }, ...(staff ? {} : { clientVisible: true }) }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.cosWorkEvent.findMany({ where: { orgId: actor.orgId, workItemId: master.id, variantId: { not: null }, kind: "comment", ...(staff ? {} : { internal: false }) }, orderBy: { createdAt: "asc" } }),
    db.cosApproval.findMany({ where: { orgId: actor.orgId, workItemId: master.id, subject: "variant" }, orderBy: { createdAt: "desc" } }),
    db.cosRevision.findMany({ where: { orgId: actor.orgId, subject: "variant" }, orderBy: { version: "desc" }, take: 200 }),
    db.cosPublication.findMany({ where: { orgId: actor.orgId, variant: { workItemId: master.id } }, include: { attempts: { orderBy: { n: "asc" } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const used = { sources: sources.filter((s) => payload.sourceIds?.includes(s.id)), claims: claims.filter((c) => payload.claimIds?.includes(c.id)) };
  const details = await Promise.all(variants.map(async (v) => ({ v, check: await variantCheck(actor.orgId, v), dupes: await duplicatesOf(actor.orgId, v.id), link: await publishLink(actor.orgId, v) })));
  const channelFormats = Object.entries(CHANNELS).flatMap(([c, spec]) => Object.entries(spec.formats).map(([f, fs]) => ({ key: `${c}:${f}`, label: `${spec.label} — ${fs.label}` })));

  return (
    <div className="max-w-[1180px]">
      <Link href="/app/content" className="text-[13px] text-[var(--los-muted)] hover:underline">← Content</Link>
      <PageHeader title={master.title} sub={campaign ? `Campaign: ${campaign.name}` : "Not linked to a campaign — published links will not carry a campaign tag."}><StateBadge state={master.state} /></PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-2 text-[15px] font-bold">Master message</div>
            {make ? (
              <ActionForm action={saveWorkItem} submit="Save master" hidden={{ id: master.id }} className="space-y-2 text-[13.5px]">
                <div><Label>Title</Label><Input name="title" defaultValue={master.title} /></div>
                <div><Label>Core copy</Label><textarea name="body" rows={8} defaultValue={payload.body ?? ""} className={field} /></div>
                <p className="text-[12px] text-[var(--los-faint)]">Changing this flags every open channel version for review. Their approvals stay as they are.</p>
              </ActionForm>
            ) : <p className="whitespace-pre-wrap text-[13.5px]">{payload.body || "—"}</p>}
            {payload.brief && <p className="mt-3 border-t border-[var(--los-line)] pt-3 text-[13px] text-[var(--los-muted)]"><span className="font-semibold text-[var(--los-fg)]">Brief: </span>{payload.brief}</p>}
          </Card>

          <Card>
            <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Sources and approved claims</div>
            {used.sources.length + used.claims.length === 0 ? <Notice title="Nothing linked yet">Facts in the copy should come from a source or a claim you have approved.</Notice> : (
              <ul className="divide-y divide-[var(--los-line)] text-[13px]">
                {used.sources.map((s) => <li key={s.id} className="px-5 py-2"><span className="font-medium">{s.title}</span>{s.url && <a href={s.url} className="ml-2 text-[var(--los-brand)] hover:underline" rel="noreferrer" target="_blank">open</a>}</li>)}
                {used.claims.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2"><span>“{c.text}”</span><Pill value={c.status === "approved" ? "approved" : "pending"} label={c.status} /></li>)}
              </ul>
            )}
            {make && (
              <details className="border-t border-[var(--los-line)] px-5 py-3 text-[13px]"><summary className="cursor-pointer font-semibold">Add a source or propose a claim</summary>
                <ActionForm action={sourceAdd} submit="Add source" tone="ghost" className="mt-2 grid gap-2"><Input name="title" placeholder="Source title" required /><Input name="url" type="url" placeholder="https://… (optional)" /><textarea name="excerpt" rows={2} className={field} placeholder="The passage we rely on" /></ActionForm>
                <ActionForm action={claimPropose} submit="Propose claim" tone="ghost" className="mt-3 grid gap-2"><Input name="text" placeholder="A claim in the client’s own words" required /><select name="sourceId" className={field}><option value="">No source</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></ActionForm>
                <p className="mt-2 text-[12px] text-[var(--los-faint)]">Only the client can approve a claim. Approve them in Growth Plan → Business profile.</p>
              </details>
            )}
          </Card>

          {make && (
            <Card className="p-5">
              <div className="mb-2 text-[15px] font-bold">Add a channel version</div>
              <ActionForm action={variantCreate} submit="Add version" hidden={{ masterId: master.id }} className="grid gap-2 text-[13.5px]">
                <select name="channelFormat" className={field} aria-label="Channel and format">{channelFormats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                <textarea name="body" rows={3} className={field} placeholder="Copy for this channel (leave empty to write it next)" />
              </ActionForm>
              {aiAvailable() ? (
                <ActionForm action={variantsAiDraft} submit="Draft versions with AI" tone="ghost" hidden={{ masterId: master.id }} className="mt-4 space-y-2 border-t border-[var(--los-line)] pt-3 text-[13px]">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">{channelFormats.map((c) => <label key={c.key} className="flex items-center gap-1"><input type="checkbox" name="targets" value={c.key} />{c.label}</label>)}</div>
                  <Input name="instruction" placeholder="Optional instruction (tone, angle…)" />
                  <p className="text-[12px] text-[var(--los-faint)]">Drafts only. Video versions are scripts for the production team — not videos. Unsupported statements are flagged for the editor.</p>
                </ActionForm>
              ) : <p className="mt-3 text-[12.5px] text-[var(--los-faint)]">AI drafting requires setup — write versions by hand.</p>}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {details.length === 0 && <Card><Notice title="No channel versions yet">Add a version for each place this message will appear. Each gets its own review, approval and schedule.</Notice></Card>}
          {details.map(({ v, check, dupes, link }) => {
            const spec = formatSpec(v.channel, v.format);
            const approval = approvals.find((a) => a.subjectId === v.id && a.version === v.version);
            const revs = revisions.filter((r) => r.subjectId === v.id);
            const prev = revs.find((r) => r.version === v.version - 1);
            const prevBody = prev ? ((JSON.parse(prev.snapshot) as { body?: string; parts?: string[] }).body || (JSON.parse(prev.snapshot) as { parts?: string[] }).parts?.join("\n\n")) : null;
            const pubs = publications.filter((p) => p.variantId === v.id);
            const live = pubs.find((p) => ["scheduled", "claimed", "uncertain", "partial", "published"].includes(p.status));
            const conns = connections.filter((c) => c.provider === CHANNELS[v.channel]?.provider || c.provider === "test");
            const editable = make && !["published", "cancelled"].includes(v.state);
            return (
              <Card key={v.id} className="scroll-mt-4">
                <div id={`v-${v.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--los-line)] px-5 py-3">
                  <div className="text-[15px] font-bold">{CHANNELS[v.channel]?.label} <span className="font-medium text-[var(--los-muted)]">· {spec?.label} · v{v.version}</span></div>
                  <div className="flex items-center gap-2">{v.sourceChanged && <Pill value="needs_review" label="source changed" />}<Pill value={v.state} /></div>
                </div>
                <div className="space-y-3 p-5 text-[13.5px]">
                  {spec?.video && <p className="rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px]">This version needs a <b>finished video file</b> from Assets. The text below is its title/description — a script is not a video.</p>}
                  {check.problems.length > 0 && <ul role="alert" className="list-disc rounded-lg border border-[var(--los-danger)] py-2 pl-7 pr-3 text-[12.5px] text-[var(--los-danger)]">{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                  {(check.warnings.length > 0 || dupes.length > 0) && <ul className="list-disc rounded-lg border border-[var(--los-line)] py-2 pl-7 pr-3 text-[12.5px] text-[var(--los-warn)]">{check.warnings.map((w) => <li key={w}>{w}</li>)}{dupes.map((d) => <li key={d.id}>Same copy already exists on this channel: “{d.title}” ({d.state.replace(/_/g, " ")}).</li>)}</ul>}

                  {/* platform-style preview of exactly what will be sent */}
                  <div className="rounded-xl border border-[var(--los-line)] bg-[var(--los-surface-2)] p-3">
                    <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--los-faint)]">Preview</div>
                    {v.title && <div className="font-bold">{v.title}</div>}
                    {v.format === "thread" ? <ol className="space-y-2">{v.parts.map((p, i) => <li key={i} className="whitespace-pre-wrap rounded-lg bg-[var(--los-surface)] p-2">{p}<span className="ml-2 text-[11px] text-[var(--los-faint)]">{[...p].length}/{spec?.parts?.maxChars}</span></li>)}</ol> : <p className="whitespace-pre-wrap">{v.body || <span className="text-[var(--los-faint)]">No copy yet</span>}</p>}
                    {v.cta && <p className="mt-1 font-medium">{v.cta}</p>}
                    {link && <p className="mt-1 break-all text-[12px] text-[var(--los-brand)]">{link}</p>}
                    {v.mediaAssetIds.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{v.mediaAssetIds.map((a) => { const as = assets.find((x) => x.id === a); return as?.kind === "image" ? <img key={a} src={`/api/os/assets/${a}`} alt={as.name} className="h-20 w-20 rounded-lg object-cover" /> : <span key={a} className="rounded-lg border border-[var(--los-line)] px-2 py-1 text-[12px]">{as?.name ?? "file"}</span>; })}</div>}
                    {!v.format.includes("thread") && spec?.maxChars && <div className="mt-1 text-[11px] text-[var(--los-faint)]">{[...v.body].length} / {spec.maxChars} characters</div>}
                  </div>

                  {editable && (
                    <details><summary className="cursor-pointer font-semibold">Edit this version</summary>
                      <ActionForm action={variantEdit} submit="Save version" hidden={{ id: v.id, mediaSent: "1" }} confirm={["approved", "scheduled", "client_review"].includes(v.state) ? "This version is signed off or in review. Changing the copy, media, call to action or link withdraws that approval and cancels its schedule. Continue?" : undefined} className="mt-2 grid gap-2">
                        {spec?.maxTitle && <div><Label>Title</Label><Input name="title" defaultValue={v.title ?? ""} maxLength={spec.maxTitle} /></div>}
                        {v.format === "thread" ? <div><Label>Posts (leave a blank line between posts)</Label><textarea name="parts" rows={8} defaultValue={v.parts.join("\n\n")} className={field} /></div> : <div><Label>Copy</Label><textarea name="body" rows={v.format === "article" ? 16 : 5} defaultValue={v.body} className={field} /></div>}
                        <div className="grid gap-2 md:grid-cols-2"><div><Label>Call to action</Label><Input name="cta" defaultValue={v.cta ?? ""} /></div><div><Label>Link (https)</Label><Input name="destinationUrl" type="url" defaultValue={v.destinationUrl ?? campaign?.destinationUrl ?? ""} /></div></div>
                        <div><Label>Publish to</Label><select name="connectionId" defaultValue={v.connectionId ?? ""} className={field}><option value="">Choose an account…</option>{conns.map((c) => <option key={c.id} value={c.id}>{c.accountLabel ?? c.provider}{c.accountType ? ` (${c.accountType.replace(/_/g, " ")})` : ""}{c.capabilities.includes("publish") ? "" : " — cannot publish"}</option>)}</select>{conns.length === 0 && <p className="mt-1 text-[12px] text-[var(--los-warn)]">No {CHANNELS[v.channel]?.label} account is connected. <Link className="underline" href="/app/settings/workspace">Connect one</Link>, or publish by hand and record the link.</p>}</div>
                        {spec?.media && <fieldset><legend className="mb-1 text-[12.5px] text-[var(--los-muted)]">Media from Assets ({spec.media.min}–{spec.media.max} {spec.media.kind === "any" ? "files" : spec.media.kind})</legend><div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">{assets.filter((a) => spec.media!.kind === "any" || a.kind === spec.media!.kind).map((a) => <label key={a.id} className="flex items-center gap-1 text-[12.5px]"><input type="checkbox" name="mediaAssetIds" value={a.id} defaultChecked={v.mediaAssetIds.includes(a.id)} />{a.name}</label>)}</div><Link href="/app/assets" className="text-[12px] text-[var(--los-brand)] hover:underline">Upload to Assets</Link></fieldset>}
                      </ActionForm>
                    </details>
                  )}

                  {prevBody !== null && prevBody !== undefined && (
                    <details><summary className="cursor-pointer font-semibold">Compare with v{v.version - 1} ({revs.length} saved revision{revs.length === 1 ? "" : "s"})</summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2"><div className="rounded-lg border border-[var(--los-line)] p-2"><div className="mb-1 text-[11.5px] font-semibold text-[var(--los-faint)]">v{v.version - 1}</div><p className="whitespace-pre-wrap text-[12.5px]">{prevBody}</p></div><div className="rounded-lg border border-[var(--los-brand)] p-2"><div className="mb-1 text-[11.5px] font-semibold text-[var(--los-faint)]">v{v.version} (current)</div><p className="whitespace-pre-wrap text-[12.5px]">{v.body || v.parts.join("\n\n")}</p></div></div>
                    </details>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--los-line)] pt-3">
                    <span className="text-[12.5px] text-[var(--los-muted)]">Approval: {approval ? <b>{approval.status.replace(/_/g, " ")}</b> : v.clientReviewRequired ? "not requested" : "not required"}{approval?.reason ? ` — “${approval.reason}”` : ""}</span>
                    {make && v.sourceChanged && <ActionForm action={variantAckSource} submit="Reviewed against the new source" tone="ghost" hidden={{ id: v.id }} />}
                    {make && (NEXT[v.state] ?? []).map(([to, label]) => <ActionForm key={to} action={variantMove} submit={label} tone={to === "draft" ? "ghost" : "brand"} hidden={{ id: v.id, to }} />)}
                    {!staff && v.state === "client_review" && <Link href="/app/approvals" className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white">Review and decide</Link>}
                  </div>

                  {make && ["approved", "failed"].includes(v.state) && (
                    <div className="grid gap-3 border-t border-[var(--los-line)] pt-3 md:grid-cols-2">
                      <ActionForm action={publicationSchedule} submit="Schedule" hidden={{ variantId: v.id, timezone: tz }} className="space-y-2"><Label>Publish at ({tz})</Label><Input name="localTime" type="datetime-local" required defaultValue={utcToZonedInput(new Date(Date.now() + 3_600_000), tz)} /></ActionForm>
                      <ActionForm action={publicationManual} submit="Record as published by hand" tone="ghost" hidden={{ variantId: v.id }} className="space-y-2"><Label>Link to the live post</Label><Input name="externalUrl" type="url" placeholder="https://…" required /></ActionForm>
                    </div>
                  )}

                  {pubs.length > 0 && (
                    <div className="border-t border-[var(--los-line)] pt-3">
                      <div className="mb-1 text-[12.5px] font-semibold">Publishing</div>
                      {pubs.map((p) => (
                        <div key={p.id} className="mb-2 rounded-lg border border-[var(--los-line)] p-2 text-[12.5px]">
                          <div className="flex flex-wrap items-center justify-between gap-2"><span>{p.status === "published" && p.publishedAt ? `Published ${formatInZone(p.publishedAt, tz)}` : `Planned for ${formatInZone(p.scheduledAt, p.timezone)} (${p.timezone})`} · {p.adapter === "manual" ? "by hand" : p.adapter === "test" ? "TEST account — not a real post" : "through the connected account"}</span><Pill value={p.status} /></div>
                          {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--los-brand)] hover:underline">{p.externalUrl}</a>}
                          {p.lastError && <p className="mt-1 text-[var(--los-danger)]">{p.lastError}</p>}
                          {p.partsTotal > 1 && <p className="text-[var(--los-faint)]">{p.partsDone} of {p.partsTotal} parts posted</p>}
                          {staff && p.attempts.length > 0 && <p className="text-[var(--los-faint)]">Attempts: {p.attempts.map((a) => `#${a.n} ${a.outcome.replace(/_/g, " ")}`).join(" → ")}</p>}
                          {make && p.status === "scheduled" && <ActionForm action={publicationCancel} submit="Cancel" tone="ghost" hidden={{ id: p.id }} className="mt-1" />}
                          {staff && ["uncertain", "partial"].includes(p.status) && (
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <ActionForm action={publicationReconcile} submit="It is live" hidden={{ id: p.id, verdict: "live" }} className="space-y-1"><Input name="externalUrl" type="url" placeholder="Link to the live post" required /></ActionForm>
                              <ActionForm action={publicationReconcile} submit="I checked — it is NOT live" tone="danger" hidden={{ id: p.id, verdict: "not_live" }} confirm="Only confirm after checking the account itself. It can then be scheduled again." />
                            </div>
                          )}
                        </div>
                      ))}
                      {live?.status === "uncertain" && <p className="text-[12px] text-[var(--los-danger)]">Nothing will retry on its own — check the account first, so the post cannot go out twice.</p>}
                    </div>
                  )}

                  <div className="border-t border-[var(--los-line)] pt-3">
                    <div className="mb-1 text-[12.5px] font-semibold">Comments</div>
                    <ul className="mb-2 space-y-1">{events.filter((e) => e.variantId === v.id).map((e) => <li key={e.id} className="text-[12.5px]"><span className="text-[var(--los-faint)]">{formatInZone(e.createdAt, tz)}{e.internal ? " · internal" : ""}: </span><span className="whitespace-pre-wrap">{(JSON.parse(e.data ?? "{}") as { text?: string }).text}</span></li>)}</ul>
                    <ActionForm action={variantComment} submit="Comment" tone="ghost" hidden={{ id: v.id }} className="space-y-1"><textarea name="text" rows={2} className={field} aria-label="Comment" required />{staff && <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" name="internal" /> Internal note (the client does not see it)</label>}</ActionForm>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
