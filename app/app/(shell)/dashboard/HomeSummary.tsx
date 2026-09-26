import Link from "next/link";
import { db } from "@/lib/audit/db";
import { isStaffRole } from "@/lib/leados/rbac";
import { STAGE_LABEL, type EngagementStage } from "@/lib/os/engagement";
import { inboxWhere } from "@/lib/os/notify";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, StateBadge } from "@/components/os/bits";
import { Notice, Pill } from "@/components/os/v2";
import { notificationsRead } from "../_os/v2";

// Home, at a glance: where the engagement stands, what is waiting on YOU, the next milestone,
// and anything that needs attention. Same records the delivery team sees — a client-appropriate view.
export default async function HomeSummary({ orgId, userId, role }: { orgId: string; userId: string; role: string }) {
  const staff = isStaffRole(role);
  const [engagements, requests, approvals, nextMilestone, blocked, inbox] = await Promise.all([
    db.cosEngagement.findMany({ where: { orgId, stage: { notIn: ["declined", "offboarded"] } }, orderBy: { createdAt: "desc" }, take: 4 }),
    db.cosChecklistItem.findMany({ where: { orgId, ownerSide: staff ? undefined : "client", status: { in: ["pending", "insufficient", "disconnected"] }, engagement: { stage: { in: ["accepted", "onboarding", "active", "review"] } } }, include: { dependents: { select: { id: true } } }, orderBy: { dueAt: "asc" }, take: 6 }),
    db.cosApproval.count({ where: { orgId, status: "requested" } }),
    db.cosWorkItem.findFirst({ where: { orgId, type: "milestone", state: { notIn: ["closed", "cancelled", "delivered", "verified"] } }, orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }] }),
    db.cosWorkItem.findMany({ where: { orgId, state: "blocked" }, take: 4, orderBy: { updatedAt: "desc" } }),
    db.cosNotification.findMany({ where: { ...inboxWhere(orgId, userId, staff), readAt: null }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  if (engagements.length === 0 && inbox.length === 0) return null;
  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Where things stand</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {engagements.map((e) => (
            <li key={e.id} className="px-5 py-3 text-[13.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/app/engagement/${e.id}`} className="font-semibold text-[var(--los-brand)] hover:underline">{e.name}</Link><span className="flex items-center gap-2">{e.hold !== "none" && <Pill value={e.hold} />}<Pill value={e.stage} label={STAGE_LABEL[e.stage as EngagementStage]} /></span></div>
              <div className="mt-0.5 text-[13px] text-[var(--los-muted)]">{e.hold !== "none" ? e.holdReason : e.nextAction ?? "Nothing is waiting right now."}{e.nextActionSide && e.hold === "none" ? ` — with ${e.nextActionSide === "client" ? (staff ? "the client" : "you") : "Catalyst"}` : ""}{e.nextActionDueAt ? ` · due ${day(e.nextActionDueAt)}` : ""}</div>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 border-t border-[var(--los-line)] p-5 text-[13px] md:grid-cols-3">
          <div><div className="text-[12px] text-[var(--los-muted)]">Decisions waiting</div>{approvals > 0 ? <Link href="/app/approvals" className="text-[18px] font-extrabold text-[var(--los-brand)] hover:underline">{approvals}</Link> : <div className="text-[14px] font-semibold text-[var(--los-faint)]">None</div>}</div>
          <div><div className="text-[12px] text-[var(--los-muted)]">Next milestone</div>{nextMilestone ? <Link href={`/app/work/${nextMilestone.id}`} className="font-semibold hover:underline">{nextMilestone.title}</Link> : <div className="font-semibold text-[var(--los-faint)]">None in progress</div>}{nextMilestone && <div className="mt-0.5"><StateBadge state={nextMilestone.state} /></div>}</div>
          <div><div className="text-[12px] text-[var(--los-muted)]">Blocked work</div>{blocked.length ? blocked.map((b) => <Link key={b.id} href={`/app/work/${b.id}`} className="block truncate text-[var(--los-danger)] hover:underline">{b.title}</Link>) : <div className="font-semibold text-[var(--los-faint)]">Nothing blocked</div>}</div>
        </div>
      </Card>
      <div className="space-y-5">
        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">{staff ? "Open onboarding requests" : "What we need from you"}</div>
          {requests.length === 0 ? <Notice title="Nothing outstanding" /> : <ul className="divide-y divide-[var(--los-line)]">{requests.map((r) => <li key={r.id} className="px-5 py-2 text-[13px]"><Link href={`/app/engagement/${r.engagementId}`} className="font-medium hover:underline">{r.label}</Link><div className="text-[12px] text-[var(--los-faint)]">{r.dependents.length ? `${r.dependents.length} task(s) are waiting on this` : "No work is held up by this yet"}{r.dueAt ? ` · due ${day(r.dueAt)}` : ""}</div></li>)}</ul>}
        </Card>
        {inbox.length > 0 && (
          <Card>
            <div className="flex items-center justify-between border-b border-[var(--los-line)] px-5 py-3"><span className="text-[15px] font-bold">Updates</span><ActionForm action={notificationsRead} submit="Mark read" tone="ghost" /></div>
            <ul className="divide-y divide-[var(--los-line)]">{inbox.map((n) => <li key={n.id} className="px-5 py-2 text-[13px]"><Link href={n.href ?? "/app/dashboard"} className="font-medium hover:underline">{n.title}</Link></li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
