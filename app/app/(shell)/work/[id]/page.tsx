import Link from "next/link";
import { WorkContext } from "@/components/os/panels";
import { notFound } from "next/navigation";
import { requireOrgPage } from "@/lib/os/guard";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { getWorkItem, WorkError } from "@/lib/os/work";
import { nextStates, type Capability } from "@/lib/os/workflow";
import { aiAvailable } from "@/lib/os/ai";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, field, human, SectionTitle, StateBadge, TierBadge } from "@/components/os/bits";
import { PUBLISHABLE } from "@/lib/os/connectors";
import { aiDraft, logWorkEvent, moveWorkItem, newDeliverable, publishNow, requestChangeApproval, saveWorkItem, tickChecklist } from "../../_os/actions";

export const metadata = { title: "Work item" };

type Payload = { body?: string; channel?: string; hook?: string; cta?: string; persona?: string; keyword?: string; expertiseFlags?: string[]; checklist?: { key: string; label: string; done: boolean }[]; brief?: { intent?: string; outline?: string[]; questions?: string[] } };
type Decision = { problem?: string; objective?: string; successMeasure?: string; evidence?: { findingId: string; label: string }[] };

export default async function WorkItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOrgPage();
  const { id } = await params;
  let item;
  try { item = await getWorkItem(actor, id); } catch (e) { if (e instanceof WorkError) notFound(); throw e; }
  const staff = isStaffRole(actor.role);
  const [events, approvals, deliverables, children, members] = await Promise.all([
    db.cosWorkEvent.findMany({ where: { workItemId: id, ...(staff ? {} : { internal: false }) }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.cosApproval.findMany({ where: { workItemId: id }, orderBy: { createdAt: "desc" } }),
    db.cosDeliverable.findMany({ where: { workItemId: id }, orderBy: { version: "asc" } }),
    db.cosWorkItem.findMany({ where: { parentId: id, orgId: actor.orgId }, orderBy: { createdAt: "asc" } }),
    db.losMembership.findMany({ where: { orgId: actor.orgId }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const payload: Payload = item.payload ? JSON.parse(item.payload) : {};
  const decision: Decision = item.decision ? JSON.parse(item.decision) : {};
  const commercial: { inScope?: boolean; estMinutes?: number; incrementalCharge?: number } = item.commercial ? JSON.parse(item.commercial) : {};
  const caps: Capability[] = (["manage", "execute", "review"] as const).filter((c) => can(actor.role, `work.${c}`));
  const moves = nextStates(item.state, item, caps);
  const canEdit = caps.includes("execute") || caps.includes("manage");
  const name = (uid: string | null) => { const m = members.find((x) => x.userId === uid); return m ? m.user.name ?? m.user.email : uid ? "—" : "Unassigned"; };
  const minutes = events.reduce((a, e) => a + (e.minutes ?? 0), 0);
  const open = !["closed", "cancelled"].includes(item.state);

  return (
    <div className="max-w-[1100px]">
      <Link href={item.parentId ? `/app/work/${item.parentId}` : "/app/work"} className="text-[12.5px] text-[var(--los-muted)] hover:underline">← {item.parentId ? "Project" : "Work"}</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">{item.title}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--los-muted)]">{human(item.type)}{item.studio ? ` · ${item.studio} Studio` : ""} · v{item.version} · due {day(item.dueAt)} · {name(item.assigneeId)}</p>
        </div>
        <div className="flex items-center gap-2"><TierBadge tier={item.riskTier} /><StateBadge state={item.state} /></div>
      </div>

      <WorkContext orgId={actor.orgId} itemId={item.id} role={actor.role} />
      {commercial.inScope === false && (
        <div className="mb-4 rounded-lg border border-[var(--los-warn)] px-4 py-2.5 text-[13px]">
          Outside the contracted scope — this is a change request. Work cannot start until the client approves it{commercial.incrementalCharge ? ` (incremental charge: ${commercial.incrementalCharge.toLocaleString()})` : ""}.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {(decision.problem || decision.objective || decision.successMeasure) && (
            <Card className="p-5 text-[13.5px]">
              <div className="mb-2 text-[15px] font-bold">Why this work exists</div>
              {decision.problem && <p className="mb-1"><span className="text-[var(--los-muted)]">Problem: </span>{decision.problem}</p>}
              {decision.objective && <p className="mb-1"><span className="text-[var(--los-muted)]">Objective: </span>{decision.objective}</p>}
              {decision.successMeasure && <p className="mb-1"><span className="text-[var(--los-muted)]">Success measure: </span>{decision.successMeasure}</p>}
              {decision.evidence?.map((e) => (
                <p key={e.findingId} className="mt-2 flex items-center gap-2 text-[12.5px]"><EvidenceBadge label={e.label} /><Link className="text-[var(--los-brand)] hover:underline" href="/app/audit">Audit finding</Link></p>
              ))}
            </Card>
          )}

          {(item.type === "content" || payload.body !== undefined || canEdit) && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[15px] font-bold">{item.type === "content" ? `Content${payload.channel ? ` · ${payload.channel}` : ""}` : "Details"}</div>
                {payload.keyword && <span className="text-[12.5px] text-[var(--los-faint)]">keyword: {payload.keyword}</span>}
              </div>
              {payload.brief && (
                <div className="mb-3 rounded-lg bg-[var(--los-surface-2)] p-3 text-[13px]">
                  <div className="font-semibold">Brief — {payload.brief.intent}</div>
                  <ol className="ml-4 mt-1 list-decimal">{payload.brief.outline?.map((o) => <li key={o}>{o}</li>)}</ol>
                </div>
              )}
              {payload.expertiseFlags && payload.expertiseFlags.length > 0 && (
                <div className="mb-3 rounded-lg border border-[var(--los-warn)] p-3 text-[13px]">
                  <div className="font-semibold">Needs human expertise before QA</div>
                  <ul className="ml-4 list-disc">{payload.expertiseFlags.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              {canEdit && open ? (
                <ActionForm action={saveWorkItem} submit="Save" hidden={{ id }} className="grid gap-3 text-[13.5px]">
                  <div><Label>Title</Label><Input name="title" defaultValue={item.title} maxLength={160} /></div>
                  <div><Label>Body</Label><textarea name="body" rows={10} defaultValue={payload.body ?? ""} className={field} /></div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>Due</Label><Input name="dueAt" type="date" defaultValue={item.dueAt ? day(item.dueAt) : ""} /></div>
                    <div><Label>Scheduled</Label><Input name="scheduledAt" type="date" defaultValue={item.scheduledAt ? day(item.scheduledAt) : ""} /></div>
                    {caps.includes("manage") && (
                      <div><Label>Assignee</Label>
                        <select name="assigneeId" defaultValue={item.assigneeId ?? ""} className={field}><option value="">Unassigned</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name ?? m.user.email} ({human(m.role)})</option>)}</select>
                      </div>
                    )}
                  </div>
                  {caps.includes("manage") && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><Label>Estimated minutes (internal)</Label><Input name="estMinutes" type="number" min={0} defaultValue={commercial.estMinutes ?? ""} /></div>
                      <div><Label>Incremental charge (shown to client)</Label><Input name="incrementalCharge" type="number" min={0} defaultValue={commercial.incrementalCharge ?? ""} /></div>
                    </div>
                  )}
                  {["client_review", "approved", "scheduled"].includes(item.state) && <p className="text-[12px] text-[var(--los-warn)]">Changing the title or body now voids the current approval and sends this back to internal QA.</p>}
                </ActionForm>
              ) : (
                <p className="whitespace-pre-wrap text-[13.5px]">{payload.body || <span className="text-[var(--los-faint)]">No content yet.</span>}</p>
              )}
              {canEdit && open && item.type === "content" && aiAvailable() && (
                <ActionForm action={aiDraft} submit="Draft with AI" tone="ghost" hidden={{ id }} className="mt-3 flex items-end gap-2 border-t border-[var(--los-line)] pt-3 text-[13.5px]">
                  <div className="flex-1"><Label>Notes for the draft (optional)</Label><Input name="notes" placeholder="Angle, proof points to use, things to avoid" /></div>
                </ActionForm>
              )}
            </Card>
          )}

          {payload.checklist && payload.checklist.length > 0 && (
            <Card>
              <SectionTitle>QA gate</SectionTitle>
              <ul className="divide-y divide-[var(--los-line)]">
                {payload.checklist.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-2 text-[13.5px]">
                    <span className={c.done ? "text-[var(--los-muted)] line-through" : ""}>{c.label}</span>
                    {staff && open ? <ActionForm action={tickChecklist} submit={c.done ? "Undo" : "Done"} tone="ghost" hidden={{ id, key: c.key, done: String(!c.done) }} /> : <span>{c.done ? "✓" : "—"}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {children.length > 0 && (
            <Card>
              <SectionTitle>Milestones</SectionTitle>
              <ul className="divide-y divide-[var(--los-line)]">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]">
                    <Link href={`/app/work/${c.id}`} className="font-medium text-[var(--los-brand)] hover:underline">{c.title}</Link>
                    <div className="flex items-center gap-2">{c.clientReviewRequired && <span className="text-[12px] text-[var(--los-faint)]">client sign-off</span>}<StateBadge state={c.state} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <SectionTitle>Deliverables</SectionTitle>
            <ul className="divide-y divide-[var(--los-line)]">
              {deliverables.map((d) => (
                <li key={d.id} className="px-5 py-2.5 text-[13.5px]">
                  <span className="text-[var(--los-faint)]">v{d.version} · </span>
                  {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--los-brand)] hover:underline">{d.title}</a> : <span className="font-medium">{d.title}</span>}
                  {d.note && <span className="text-[var(--los-muted)]"> — {d.note}</span>}
                </li>
              ))}
              {deliverables.length === 0 && <Empty>No deliverables yet.</Empty>}
            </ul>
            {caps.includes("execute") && open && (
              <ActionForm action={newDeliverable} submit="Add" hidden={{ id }} className="flex flex-wrap items-end gap-2 border-t border-[var(--los-line)] px-5 py-3 text-[13.5px]">
                <div className="min-w-[160px] flex-1"><Label>Title</Label><Input name="title" required /></div>
                <div className="min-w-[200px] flex-1"><Label>Link (https)</Label><Input name="url" type="url" placeholder="https://…" /></div>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {moves.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-[15px] font-bold">Move</div>
              <div className="flex flex-wrap gap-2">
                {moves.map((to) => (
                  <ActionForm key={to} action={moveWorkItem} submit={`→ ${human(to)}`} tone={to === "cancelled" || to === "blocked" || to === "failed" ? "danger" : "ghost"} hidden={{ id, to }} confirm={to === "cancelled" ? "Cancel this work item?" : undefined} />
                ))}
              </div>
              {item.type === "content" && ["approved", "scheduled"].includes(item.state) && caps.includes("execute") && PUBLISHABLE.includes(payload.channel ?? "") && (
                <div className="mt-3 border-t border-[var(--los-line)] pt-3">
                  <ActionForm action={publishNow} submit={`Publish to ${payload.channel} now`} hidden={{ id }} confirm={`Publish this approved post to ${payload.channel}? This is public and cannot be undone here.`} />
                  <p className="mt-1 text-[12px] text-[var(--los-faint)]">Re-checks the approval and kill switch, then posts once. Other channels: deliver manually and add the link.</p>
                </div>
              )}
              {item.type === "change_request" && item.state === "scoped" && can(actor.role, "work.manage") && !approvals.some((a) => a.status === "requested") && (
                <div className="mt-3 border-t border-[var(--los-line)] pt-3">
                  <ActionForm action={requestChangeApproval} submit="Send to the client for approval" hidden={{ id }} />
                  <p className="mt-1 text-[12px] text-[var(--los-faint)]">Outside the signed scope: it cannot start until the client approves. A fee needs the workspace owner.</p>
                </div>
              )}
              {item.state === "client_review" && <p className="mt-2 text-[12px] text-[var(--los-faint)]">Waiting on the client — approval happens in their Approvals inbox, not here.</p>}
            </Card>
          )}

          <Card>
            <SectionTitle>Approvals</SectionTitle>
            <ul className="divide-y divide-[var(--los-line)]">
              {approvals.map((a) => (
                <li key={a.id} className="px-5 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between"><span>v{a.version} · {human(a.status)}</span><span className="text-[var(--los-faint)]">{day(a.decidedAt ?? a.createdAt)}</span></div>
                  {a.decidedById && <div className="text-[12px] text-[var(--los-faint)]">by {name(a.decidedById)}</div>}
                  {a.reason && <div className="text-[12.5px] text-[var(--los-muted)]">“{a.reason}”</div>}
                </li>
              ))}
              {approvals.length === 0 && <Empty>None requested.</Empty>}
            </ul>
          </Card>

          <Card>
            <SectionTitle>Activity{staff && minutes > 0 ? ` · ${Math.round(minutes / 6) / 10}h logged` : ""}</SectionTitle>
            <ActionForm action={logWorkEvent} submit="Post" hidden={{ id, kind: "comment" }} className="space-y-2 px-5 py-3 text-[13.5px]">
              <textarea name="text" rows={2} placeholder="Comment…" className={field} />
              {staff && <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="internal" /> Internal note (hidden from client)</label>}
            </ActionForm>
            {caps.includes("execute") && (
              <ActionForm action={logWorkEvent} submit="Log time" tone="ghost" hidden={{ id, kind: "time" }} className="flex items-end gap-2 border-t border-[var(--los-line)] px-5 py-3 text-[13.5px]">
                <div className="w-24"><Label>Minutes</Label><Input name="minutes" type="number" min={1} max={1440} required /></div>
              </ActionForm>
            )}
            <ul className="divide-y divide-[var(--los-line)] border-t border-[var(--los-line)]">
              {events.map((e) => {
                const data: { text?: string; note?: string; status?: string; blocked?: string } = e.data ? JSON.parse(e.data) : {};
                return (
                  <li key={e.id} className="px-5 py-2 text-[12.5px]">
                    <div className="flex justify-between text-[var(--los-faint)]"><span>{name(e.actorId)}{e.internal ? " · internal" : ""}</span><span>{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span></div>
                    <div>
                      {e.kind === "transition" && <>{e.fromState ? `${human(e.fromState)} → ` : "created → "}{human(e.toState ?? "")}</>}
                      {e.kind === "approval" && <>approval {human(data.status ?? "")}</>}
                      {e.kind === "time" && <>{e.minutes} min logged</>}
                      {e.kind === "edit" && <>edited{e.toState && e.toState !== e.fromState ? ` → ${human(e.toState)}` : ""}</>}
                      {e.kind === "execution" && <span className="text-[var(--los-danger)]">blocked: {data.blocked}</span>}
                      {(e.kind === "comment" || e.kind === "ai") && <span className="whitespace-pre-wrap">{e.kind === "ai" ? "AI · " : ""}{data.text}</span>}
                      {data.note && <span className="text-[var(--los-muted)]"> — {data.note}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
