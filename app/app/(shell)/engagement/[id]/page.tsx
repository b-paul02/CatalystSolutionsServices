import Link from "next/link";
import { paymentProviderFor } from "@/lib/os/razorpay";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { ENGAGEMENT_STAGES, GOAL_FOCUS, nextStages, OPEN_STAGES, STAGE_LABEL, type EngagementStage } from "@/lib/os/engagement";
import { serviceBySlug } from "@/lib/os/catalog";
import { HANDOVER_STEPS, templateFor } from "@/lib/os/templates";
import { formatInZone } from "@/lib/os/time";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field, PageHeader, StateBadge } from "@/components/os/bits";
import { money, Notice, Pill } from "@/components/os/v2";
import { checklistAdd, checklistResolve, cycleGenerate, engagementHold, engagementMove, engagementUpdate, handover, kickoffBuild, recordCreate, recordIssue, recordPay, recordPayment, roadmapStart } from "../../_os/v2";

export const metadata = { title: "Engagement" };

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, ent } = await requireModule("engagement", "work.view");
  const { id } = await params;
  const e = await db.cosEngagement.findFirst({ where: { id, orgId: actor.orgId } });
  if (!e) notFound();
  const staff = isStaffRole(actor.role), manage = staff && can(actor.role, "work.manage"), open = OPEN_STAGES.includes(e.stage as EngagementStage);
  const [contracts, checklist, projects, cycles, records, events, goals, changes] = await Promise.all([
    db.cosContract.findMany({ where: { orgId: actor.orgId, engagementId: e.id }, orderBy: { createdAt: "desc" } }),
    db.cosChecklistItem.findMany({ where: { orgId: actor.orgId, engagementId: e.id }, include: { dependents: { select: { id: true } } }, orderBy: [{ status: "desc" }, { createdAt: "asc" }] }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, engagementId: e.id, type: "project" }, orderBy: { createdAt: "asc" } }),
    db.cosCycle.findMany({ where: { orgId: actor.orgId, engagementId: e.id }, orderBy: { periodStart: "desc" }, take: 6 }),
    db.cosCommercialRecord.findMany({ where: { orgId: actor.orgId, engagementId: e.id }, orderBy: { createdAt: "desc" } }),
    db.cosEngagementEvent.findMany({ where: { orgId: actor.orgId, engagementId: e.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null, OR: [{ engagementId: e.id }, { engagementId: null }] } }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, engagementId: e.id, type: "change_request" }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const milestones = projects.length ? await db.cosWorkItem.findMany({ where: { orgId: actor.orgId, parentId: { in: projects.map((p) => p.id) } }, orderBy: { createdAt: "asc" } }) : [];
  const active = contracts.filter((c) => c.status === "active");
  const services = [...new Set(active.flatMap((c) => JSON.parse(c.services) as string[]))];
  const proposed = contracts.find((c) => c.status === "proposed");
  const openItems = checklist.filter((c) => !["available", "not_needed"].includes(c.status));
  const stageIdx = ENGAGEMENT_STAGES.indexOf(e.stage as EngagementStage);

  return (
    <div className="max-w-[1100px]">
      <PageHeader title={e.name} sub={`${e.entrySource === "partner" ? "Introduced by a partner" : e.entrySource === "audit" ? "Started from your Growth Audit" : "Direct engagement"} · focus: ${e.goalFocus.join(", ") || "not set"}`}>
        <div className="flex items-center gap-2">{e.hold !== "none" && <Pill value={e.hold} />}<Pill value={e.stage} label={STAGE_LABEL[e.stage as EngagementStage]} /></div>
      </PageHeader>

      <ol className="mb-5 flex flex-wrap gap-1 text-[12px]" aria-label="Engagement stages">
        {ENGAGEMENT_STAGES.filter((s) => s !== "declined").map((s, i) => <li key={s} aria-current={s === e.stage ? "step" : undefined} className={`rounded-full px-2.5 py-1 ${s === e.stage ? "bg-[var(--los-brand)] font-semibold text-white" : i < stageIdx && e.stage !== "declined" ? "bg-[var(--los-surface-2)] text-[var(--los-fg)]" : "border border-[var(--los-line)] text-[var(--los-faint)]"}`}>{STAGE_LABEL[s]}</li>)}
      </ol>

      {e.hold !== "none" && <div role="status" className="mb-5 rounded-lg border border-[var(--los-warn)] px-4 py-3 text-[13.5px]"><b className="capitalize">{e.hold.replace(/_/g, " ")}</b>{e.holdSince ? ` since ${day(e.holdSince)}` : ""}: {e.holdReason}</div>}
      {proposed && <div role="status" className="mb-5 rounded-lg border border-[var(--los-brand)] px-4 py-3 text-[13.5px]">A scope proposal is waiting for the workspace owner. <Link className="font-semibold underline" href="/app/dashboard">Review and sign on Home</Link>.</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 text-[15px] font-bold">What happens next</div>
          <p className="text-[14px]">{e.nextAction ?? "Nothing is waiting right now."}</p>
          <p className="mt-1 text-[12.5px] text-[var(--los-muted)]">{e.nextActionSide ? `With: ${e.nextActionSide === "client" ? "you (the client team)" : "Catalyst"}` : ""}{e.nextActionDueAt ? ` · due ${day(e.nextActionDueAt)}` : ""}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div><dt className="text-[12px] text-[var(--los-muted)]">Payment status</dt><dd><Pill value={e.paymentStatus} /></dd></div>
            <div><dt className="text-[12px] text-[var(--los-muted)]">Readiness</dt><dd className="capitalize">{e.readiness.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-[12px] text-[var(--los-muted)]">Review cycles per deliverable</dt><dd>{e.reviewCycles ?? "Not set"}</dd></div>
            <div><dt className="text-[12px] text-[var(--los-muted)]">Response time</dt><dd>{e.responseHours ? `${e.responseHours} working hours` : "Not set"}</dd></div>
            <div><dt className="text-[12px] text-[var(--los-muted)]">Term</dt><dd>{e.startsAt ? day(e.startsAt) : "—"} → {e.endsAt ? day(e.endsAt) : "open"}</dd></div>
            <div><dt className="text-[12px] text-[var(--los-muted)]">Renewal</dt><dd>{e.renewalAt ? `${day(e.renewalAt)} (${e.renewalMode})` : "Not set"}</dd></div>
          </dl>
          {manage && open && (
            <details className="mt-4 border-t border-[var(--los-line)] pt-3 text-[13px]"><summary className="cursor-pointer font-semibold">Manage stage, hold and terms</summary>
              <div className="mt-3 flex flex-wrap gap-2">{nextStages(e.stage).map((s) => <ActionForm key={s} action={engagementMove} submit={`Move to ${STAGE_LABEL[s]}`} tone={s === "declined" ? "danger" : "brand"} hidden={{ id: e.id, to: s }} className="flex items-end gap-2"><Input name="reason" placeholder={s === "declined" || s === "active" ? "Reason / note" : "Note (optional)"} aria-label="Reason" /></ActionForm>)}</div>
              <ActionForm action={engagementHold} submit="Set" tone="ghost" hidden={{ id: e.id }} className="mt-3 grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-end"><div><Label>Hold</Label><select name="hold" defaultValue={e.hold} className={field}><option value="none">None</option><option value="awaiting_client">Awaiting client</option><option value="blocked">Blocked</option><option value="paused">Paused</option></select></div><div><Label>Why, and what unblocks it</Label><Input name="reason" defaultValue={e.holdReason ?? ""} /></div></ActionForm>
              <ActionForm action={engagementUpdate} submit="Save terms" tone="ghost" hidden={{ id: e.id, goalFocusSent: "1" }} className="mt-3 grid gap-2 md:grid-cols-3">
                <div className="md:col-span-3"><Label>Next action</Label><Input name="nextAction" defaultValue={e.nextAction ?? ""} /></div>
                <div><Label>With</Label><select name="nextActionSide" defaultValue={e.nextActionSide ?? ""} className={field}><option value="catalyst">Catalyst</option><option value="client">Client</option></select></div>
                <div><Label>Due</Label><Input name="nextActionDueAt" type="date" defaultValue={e.nextActionDueAt ? day(e.nextActionDueAt) : ""} /></div>
                <div><Label>Readiness</Label><select name="readiness" defaultValue={e.readiness} className={field}><option value="unknown">Unknown</option><option value="assets_ready">Assets ready</option><option value="foundation_needed">Foundation work needed</option></select></div>
                <fieldset className="flex flex-wrap gap-2 md:col-span-3"><legend className="mb-1 text-[12.5px] text-[var(--los-muted)]">Goal focus</legend>{GOAL_FOCUS.map((g) => <label key={g} className="flex items-center gap-1 capitalize"><input type="checkbox" name="goalFocus" value={g} defaultChecked={e.goalFocus.includes(g)} />{g}</label>)}</fieldset>
                <div><Label>Currency</Label><Input name="currency" defaultValue={e.currency ?? ent.currency} maxLength={3} /></div>
                <div><Label>Setup fee</Label><Input name="setupFee" inputMode="decimal" defaultValue={e.setupFeeMinor != null ? (Number(e.setupFeeMinor) / 100).toFixed(2) : ""} /></div>
                <div><Label>Recurring fee</Label><Input name="recurringFee" inputMode="decimal" defaultValue={e.recurringFeeMinor != null ? (Number(e.recurringFeeMinor) / 100).toFixed(2) : ""} /></div>
                <div><Label>Recurring cycle</Label><select name="billingInterval" defaultValue={e.billingInterval} className={field}><option value="none">None (project)</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></div>
                <div><Label>Review cycles</Label><Input name="reviewCycles" inputMode="numeric" defaultValue={e.reviewCycles ?? ""} /></div>
                <div><Label>Response (working hours)</Label><Input name="responseHours" inputMode="numeric" defaultValue={e.responseHours ?? ""} /></div>
                <div><Label>Starts</Label><Input name="startsAt" type="date" defaultValue={e.startsAt ? day(e.startsAt) : ""} /></div>
                <div><Label>Ends</Label><Input name="endsAt" type="date" defaultValue={e.endsAt ? day(e.endsAt) : ""} /></div>
                <div><Label>Renewal date</Label><Input name="renewalAt" type="date" defaultValue={e.renewalAt ? day(e.renewalAt) : ""} /></div>
                <p className="text-[12px] text-[var(--los-faint)] md:col-span-3">Fees and service expectations are whatever was agreed for this engagement — nothing is pre-filled.</p>
              </ActionForm>
            </details>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-[var(--los-line)] px-5 py-3"><span className="text-[15px] font-bold">Access, assets and inputs</span><span className="text-[12.5px] text-[var(--los-muted)]">{openItems.length} open</span></div>
          {checklist.length === 0 ? <Notice title="Nothing requested yet">Requests appear here once scope is signed — one list for everything we need from each other.</Notice> : (
            <ul className="max-h-[430px] divide-y divide-[var(--los-line)] overflow-y-auto text-[13px]">
              {checklist.map((c) => {
                const mine = staff || c.ownerSide === "client";
                return (
                  <li key={c.id} className="px-5 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium">{c.label}</div><div className="text-[12px] text-[var(--los-faint)]">{c.ownerSide === "client" ? "From you" : "From Catalyst"}{c.serviceSlug ? ` · ${serviceBySlug[c.serviceSlug]?.title ?? c.serviceSlug}` : ""}{c.dueAt ? ` · due ${day(c.dueAt)}` : ""}{c.dependents.length ? ` · ${c.dependents.length} task(s) wait on this` : ""}</div>{c.note && <div className="text-[12px] text-[var(--los-muted)]">{c.note}</div>}</div><Pill value={c.status} /></div>
                    {mine && open && !["available", "not_needed"].includes(c.status) && (
                      c.kind === "access" && c.provider ? <Link href="/app/settings/connections" className="mt-1 inline-block text-[12.5px] font-semibold text-[var(--los-brand)] hover:underline">Connect the account → this completes itself</Link> : (
                        <ActionForm action={checklistResolve} submit="Mark as provided" tone="ghost" hidden={{ id: c.id, status: "available" }} className="mt-1 flex items-end gap-2"><Input name="note" placeholder={c.kind === "access" ? "How access was granted (never a password)" : "Where it is / note"} aria-label="Note" /></ActionForm>
                      )
                    )}
                    {manage && open && !["available", "not_needed"].includes(c.status) && <ActionForm action={checklistResolve} submit="Not needed" tone="ghost" hidden={{ id: c.id, status: "not_needed" }} className="mt-1" />}
                  </li>
                );
              })}
            </ul>
          )}
          {manage && open && <ActionForm action={checklistAdd} submit="Add request" tone="ghost" hidden={{ engagementId: e.id }} className="grid gap-2 border-t border-[var(--los-line)] p-3 text-[13px] md:grid-cols-[auto_1fr_auto_auto] md:items-end"><select name="kind" className={field} aria-label="Kind"><option value="access">Access</option><option value="asset">Asset</option><option value="input">Input</option></select><Input name="label" placeholder="What is needed" required aria-label="What is needed" /><select name="ownerSide" className={field} aria-label="From"><option value="client">From client</option><option value="catalyst">From Catalyst</option></select><Input name="dueAt" type="date" aria-label="Due" /></ActionForm>}
        </Card>

        <Card className="lg:col-span-2">
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Scope and delivery roadmap</div>
          {services.length === 0 ? <Notice kind={proposed ? "blocked" : "empty"} title={proposed ? "Waiting for the scope to be signed" : "No signed scope yet"}>{proposed ? "Delivery planning starts once the workspace owner signs the proposal." : "Your account lead will propose scope after discovery."}</Notice> : (
            <div className="divide-y divide-[var(--los-line)]">
              {services.map((slug) => {
                const svc = serviceBySlug[slug], tpl = templateFor(slug), project = projects.find((p) => p.serviceSlug === slug);
                const ms = project ? milestones.filter((m) => m.parentId === project.id) : [];
                return (
                  <details key={slug} className="px-5 py-3 text-[13.5px]" open={Boolean(project)}>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="font-semibold">{svc?.title ?? slug}</span><span className="text-[12px] text-[var(--los-faint)]">{project ? `${ms.filter((m) => ["delivered", "verified", "closed"].includes(m.state)).length}/${ms.length} milestones delivered` : "not started"}</span></summary>
                    {tpl && <p className="mt-2 text-[12.5px] text-[var(--los-muted)]"><b>You receive:</b> {tpl.deliverables.join(" · ")}<br /><b>Your decisions:</b> {tpl.clientDecisions.join(" · ")}<br /><b>How we measure it:</b> {tpl.measures.map((m) => m.label).join(" · ")}{tpl.manualExecution ? <><br /><b>Note:</b> this work is carried out in your own tools and accounts; progress and evidence are recorded here.</> : null}</p>}
                    {ms.length > 0 && <ol className="mt-2 space-y-1">{ms.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--los-surface-2)] px-3 py-1.5"><Link href={`/app/work/${m.id}`} className="min-w-0 truncate text-[var(--los-brand)] hover:underline">{m.title}</Link><span className="flex items-center gap-2 text-[12px] text-[var(--los-faint)]">{m.assignRole}{m.responsibility !== "catalyst" ? ` · ${m.responsibility}` : ""}{m.clientReviewRequired ? " · your approval" : ""}<StateBadge state={m.state} /></span></li>)}</ol>}
                    {!project && manage && open && <ActionForm action={roadmapStart} submit="Create the delivery plan" hidden={{ id: e.id, serviceSlug: slug, title: svc?.title ?? slug }} className="mt-2 flex flex-wrap items-end gap-2"><select name="goalId" className={`${field} !w-auto`} aria-label="Goal this serves"><option value="">Goal it serves…</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.metric}</option>)}</select></ActionForm>}
                  </details>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Commercial record</div>
          {records.length === 0 ? <Notice title="No fees recorded">Invoices are issued from Catalyst’s invoicing system. Their references and status are recorded here.</Notice> : (
            <ul className="divide-y divide-[var(--los-line)] text-[13px]">
              {records.map((r) => (
                <li key={r.id} className="px-5 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.description}</span><span className="flex items-center gap-2">{money(r.amountMinor, r.currency)}<Pill value={r.status} /></span></div>
                  <div className="text-[12px] text-[var(--los-faint)]">{r.invoiceRef ? `Invoice ${r.invoiceRef}` : "Not invoiced yet"}{r.dueAt ? ` · due ${day(r.dueAt)}` : ""}{r.paidBasis ? ` · ${r.paidBasis === "webhook" ? "payment confirmed by the payment provider" : "payment recorded by Catalyst"}` : ""}{r.invoiceUrl ? <> · <a className="text-[var(--los-brand)] hover:underline" href={r.invoiceUrl} target="_blank" rel="noreferrer">view invoice</a></> : null}</div>
                  {manage && r.status === "draft" && <ActionForm action={recordIssue} submit="Mark invoiced" tone="ghost" hidden={{ id: r.id }} className="mt-1 flex flex-wrap items-end gap-2"><Input name="invoiceRef" placeholder="Invoice number" required aria-label="Invoice number" /><Input name="dueAt" type="date" aria-label="Due date" /></ActionForm>}
                  {manage && ["issued", "part_paid", "overdue"].includes(r.status) && <ActionForm action={recordPayment} submit="Record payment received" tone="ghost" hidden={{ id: r.id }} className="mt-1 flex flex-wrap items-end gap-2"><Input name="amount" inputMode="decimal" placeholder="Amount" required aria-label="Amount" /><Input name="reference" placeholder="Bank / gateway reference" required aria-label="Reference" /></ActionForm>}
                  {!staff && can(actor.role, "org.billing") && ["issued", "part_paid", "overdue"].includes(r.status) && paymentProviderFor(r.currency) && <ActionForm action={recordPay} submit={paymentProviderFor(r.currency) === "razorpay" ? "Pay online (Razorpay)" : "Pay by card"} hidden={{ id: r.id }} className="mt-1" />}
                </li>
              ))}
            </ul>
          )}
          {manage && open && <ActionForm action={recordCreate} submit="Add fee" tone="ghost" hidden={{ engagementId: e.id }} className="grid gap-2 border-t border-[var(--los-line)] p-3 text-[13px] md:grid-cols-4 md:items-end"><select name="kind" className={field} aria-label="Kind"><option value="setup">Setup</option><option value="recurring">Recurring</option><option value="other">Other</option></select><Input name="description" placeholder="Description" required aria-label="Description" /><Input name="amount" inputMode="decimal" placeholder="Amount" required aria-label="Amount" /><Input name="currency" defaultValue={e.currency ?? ent.currency} maxLength={3} aria-label="Currency" /></ActionForm>}
          {changes.length > 0 && <div className="border-t border-[var(--los-line)] px-5 py-3 text-[13px]"><div className="mb-1 font-semibold">Scope changes</div><ul className="space-y-1">{changes.map((c) => <li key={c.id} className="flex items-center justify-between gap-2"><Link href={`/app/work/${c.id}`} className="truncate text-[var(--los-brand)] hover:underline">{c.title}</Link><StateBadge state={c.state} /></li>)}</ul></div>}
        </Card>

        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Recurring delivery</div>
          {e.billingInterval === "none" ? <Notice title="This is a one-off engagement">No recurring cycle is configured.</Notice> : cycles.length === 0 ? <Notice title="No cycle yet">The first {e.billingInterval} cycle is created when delivery is active.</Notice> : <ul className="divide-y divide-[var(--los-line)] text-[13px]">{cycles.map((c) => <li key={c.id} className="flex items-center justify-between px-5 py-2"><span>{day(c.periodStart)} → {day(c.periodEnd)}</span><span className="text-[12px] text-[var(--los-faint)]">{c.status === "skipped" ? "skipped (paused)" : `${c.itemsCreated} item(s)`}</span></li>)}</ul>}
          {manage && e.stage === "active" && e.billingInterval !== "none" && <div className="border-t border-[var(--los-line)] p-3"><ActionForm action={cycleGenerate} submit="Create this period’s work now" tone="ghost" hidden={{ id: e.id }} /></div>}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between"><span className="text-[15px] font-bold">Kickoff summary</span>{manage && <ActionForm action={kickoffBuild} submit="Refresh from records" tone="ghost" hidden={{ id: e.id }} />}</div>
          {e.kickoffSummary ? <pre className="whitespace-pre-wrap font-sans text-[13px]">{e.kickoffSummary}</pre> : <p className="text-[13px] text-[var(--los-muted)]">Built from your discovery profile, goals, signed scope and open requests once onboarding starts.</p>}
        </Card>

        <Card className="p-5">
          <div className="mb-2 text-[15px] font-bold">Handover and export</div>
          <p className="text-[13px] text-[var(--los-muted)]">Everything here is yours: work history, approvals, content, reports and assets. You can export it at any time, and it stays readable after the engagement ends.</p>
          {can(actor.role, "org.export") ? <a href="/api/os/export" className="mt-2 inline-block rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--los-surface-2)]">Download export</a> : <p className="mt-2 text-[13px] text-[var(--los-muted)]">The workspace owner or an admin can download the export.</p>}
          {["completed", "offboarded"].includes(e.stage) && <ul className="mt-3 space-y-1 text-[13px]">{HANDOVER_STEPS.map((s) => <li key={s.key} className="flex gap-2"><span className="text-[var(--los-faint)]">{s.side === "client" ? "You:" : "Catalyst:"}</span>{s.label}</li>)}</ul>}
          {manage && e.stage === "completed" && <ActionForm action={handover} submit="Complete handover" tone="danger" hidden={{ id: e.id }} confirm="This ends the engagement’s scope. If no other engagement is open the workspace becomes read-only. Nothing is deleted. Continue?" className="mt-3" />}
        </Card>

        <Card className="lg:col-span-2">
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">History</div>
          <ul className="divide-y divide-[var(--los-line)] text-[12.5px]">{events.map((ev) => <li key={ev.id} className="flex flex-wrap justify-between gap-2 px-5 py-1.5"><span><b className="capitalize">{ev.kind}</b>: {ev.fromValue ? `${ev.fromValue.replace(/_/g, " ")} → ` : ""}{(ev.toValue ?? "").replace(/_/g, " ")}{ev.reason ? ` — ${ev.reason}` : ""}</span><span className="text-[var(--los-faint)]">{formatInZone(ev.createdAt, ent.timezone)}</span></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
