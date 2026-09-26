import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { isStaffRole } from "@/lib/leados/rbac";
import { CHANNELS } from "@/lib/os/channels";
import { inboxWhere } from "@/lib/os/notify";
import { entitlements } from "@/lib/os/entitlements";
import { formatInZone } from "@/lib/os/time";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, PageHeader, StateBadge } from "@/components/os/bits";
import { Notice, Pill } from "@/components/os/v2";
import { notificationsRead } from "../_os/v2";

export const metadata = { title: "My queue" };

// Staff-only production queue for THIS workspace: what is mine, what waits on QA, what waits on
// the client, what is blocked, and anything that failed and needs a person.
export default async function OpsPage() {
  const actor = await requireOrgPage("work.execute");
  if (!isStaffRole(actor.role)) redirect("/app/dashboard");
  const ent = await entitlements(actor.orgId), tz = ent.timezone;
  const open = { notIn: ["closed", "cancelled", "delivered", "verified"] };
  const [mine, qa, client, blocked, variantsQa, pubs, conns, inbox, hours] = await Promise.all([
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, assigneeId: actor.userId, state: open }, orderBy: [{ dueAt: "asc" }, { priority: "asc" }], take: 30 }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, state: "internal_qa" }, orderBy: { updatedAt: "asc" }, take: 20 }),
    db.cosApproval.findMany({ where: { orgId: actor.orgId, status: "requested" }, orderBy: { createdAt: "asc" }, take: 20 }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, state: { in: ["blocked", "failed", "revision_requested"] } }, orderBy: { updatedAt: "asc" }, take: 20 }),
    db.cosContentVariant.findMany({ where: { orgId: actor.orgId, state: { in: ["internal_qa", "failed", "needs_review"] } }, include: { workItem: { select: { title: true } } }, orderBy: { updatedAt: "asc" }, take: 20 }),
    db.cosPublication.findMany({ where: { orgId: actor.orgId, status: { in: ["failed", "uncertain", "partial", "scheduled"] } }, include: { variant: { select: { workItemId: true, workItem: { select: { title: true } } } } }, orderBy: { scheduledAt: "asc" }, take: 20 }),
    db.cosConnection.findMany({ where: { orgId: actor.orgId, status: { in: ["failed", "disconnected", "pending"] } } }),
    db.cosNotification.findMany({ where: { ...inboxWhere(actor.orgId, actor.userId, true), readAt: null }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.cosWorkEvent.aggregate({ where: { orgId: actor.orgId, actorId: actor.userId, kind: "time", createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _sum: { minutes: true } }),
  ]);
  const Row = ({ href, title, right }: { href: string; title: string; right: React.ReactNode }) => <li className="flex items-center justify-between gap-2 px-5 py-2 text-[13px]"><Link href={href} className="min-w-0 truncate font-medium text-[var(--los-brand)] hover:underline">{title}</Link><span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--los-faint)]">{right}</span></li>;
  const Box = ({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) => <Card><div className="flex items-center justify-between border-b border-[var(--los-line)] px-5 py-3"><span className="text-[15px] font-bold">{title}</span><span className="text-[12.5px] text-[var(--los-muted)]">{count}</span></div>{count === 0 ? <Notice title={empty} /> : <ul className="divide-y divide-[var(--los-line)]">{children}</ul>}</Card>;

  return (
    <div className="max-w-[1180px]">
      <PageHeader title="My queue" sub={`${Math.round(((hours._sum.minutes ?? 0) / 60) * 10) / 10} h logged by you in the last 7 days in this workspace`} />
      {inbox.length > 0 && (
        <Card className="mb-5">
          <div className="flex items-center justify-between border-b border-[var(--los-line)] px-5 py-3"><span className="text-[15px] font-bold">Needs attention</span><ActionForm action={notificationsRead} submit="Mark all read" tone="ghost" /></div>
          <ul className="divide-y divide-[var(--los-line)]">{inbox.map((n) => <li key={n.id} className="px-5 py-2 text-[13px]"><Link href={n.href ?? "/app/ops"} className="font-medium hover:underline">{n.title}</Link>{n.body && <div className="text-[12.5px] text-[var(--los-muted)]">{n.body}</div>}</li>)}</ul>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Box title="Assigned to me" count={mine.length} empty="Nothing assigned to you here">{mine.map((w) => <Row key={w.id} href={`/app/work/${w.id}`} title={w.title} right={<>{w.assignRole}{w.dueAt ? ` · due ${day(w.dueAt)}` : ""}<StateBadge state={w.state} /></>} />)}</Box>
        <Box title="Internal QA" count={qa.length + variantsQa.filter((v) => v.state === "internal_qa").length} empty="Nothing waiting for QA">{qa.map((w) => <Row key={w.id} href={`/app/work/${w.id}`} title={w.title} right={<StateBadge state={w.state} />} />)}{variantsQa.filter((v) => v.state === "internal_qa").map((v) => <Row key={v.id} href={`/app/content/${v.workItemId}#v-${v.id}`} title={`${v.workItem.title} — ${CHANNELS[v.channel]?.label}`} right={<Pill value={v.state} />} />)}</Box>
        <Box title="Waiting for the client" count={client.length} empty="No decisions outstanding">{client.map((a) => <Row key={a.id} href="/app/approvals" title={a.summary} right={<>since {day(a.createdAt)} · expires {day(a.expiresAt)}</>} />)}</Box>
        <Box title="Blocked, failed or sent back" count={blocked.length + variantsQa.filter((v) => v.state !== "internal_qa").length} empty="Nothing is stuck">{blocked.map((w) => <Row key={w.id} href={`/app/work/${w.id}`} title={w.title} right={<StateBadge state={w.state} />} />)}{variantsQa.filter((v) => v.state !== "internal_qa").map((v) => <Row key={v.id} href={`/app/content/${v.workItemId}#v-${v.id}`} title={`${v.workItem.title} — ${CHANNELS[v.channel]?.label}`} right={<Pill value={v.state} />} />)}</Box>
        <Box title="Publishing" count={pubs.length} empty="Nothing scheduled or failed">{pubs.map((p) => <Row key={p.id} href={`/app/content/${p.variant.workItemId}`} title={`${p.variant.workItem.title} — ${CHANNELS[p.channel]?.label}`} right={<>{formatInZone(p.scheduledAt, tz)}<Pill value={p.status} /></>} />)}</Box>
        <Box title="Connection issues" count={conns.length} empty="All connected accounts are healthy">{conns.map((c) => <Row key={c.id} href="/app/settings/workspace" title={c.accountLabel ?? c.provider} right={<>{c.lastError?.slice(0, 60)}<Pill value={c.status} /></>} />)}</Box>
      </div>
    </div>
  );
}
