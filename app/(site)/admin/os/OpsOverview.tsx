import Link from "next/link";
import { db } from "@/lib/audit/db";
import { OPEN_STAGES, STAGE_LABEL, type EngagementStage } from "@/lib/os/engagement";
import { schedulerHealth } from "@/lib/os/tick";

// Cross-client delivery overview for Catalyst: engagement stages and readiness, production queues,
// capacity, things that failed and need a person, renewals, commercial status and AI usage.
// Internal only — none of this is shown to clients.
export default async function OpsOverview() {
  const now = new Date(), week = new Date(now.getTime() - 7 * 86_400_000), month = new Date(now.getTime() - 30 * 86_400_000);
  const [engagements, orgs, checklist, qa, variantsQa, approvals, pubs, conns, deadJobs, renewals, records, ai, time, assigned, staff, health, unmatched] = await Promise.all([
    db.cosEngagement.findMany({ where: { stage: { in: OPEN_STAGES } }, orderBy: { updatedAt: "desc" } }),
    db.losOrg.findMany({ select: { id: true, name: true, demo: true } }),
    db.cosChecklistItem.groupBy({ by: ["engagementId"], where: { status: { in: ["pending", "insufficient", "disconnected"] } }, _count: true }),
    db.cosWorkItem.groupBy({ by: ["orgId"], where: { state: "internal_qa" }, _count: true }),
    db.cosContentVariant.groupBy({ by: ["orgId"], where: { state: "internal_qa" }, _count: true }),
    db.cosApproval.groupBy({ by: ["orgId"], where: { status: "requested" }, _count: true, _min: { createdAt: true } }),
    db.cosPublication.findMany({ where: { status: { in: ["failed", "uncertain", "partial"] }, adapter: { not: "test" } }, orderBy: { updatedAt: "desc" }, take: 15, include: { variant: { select: { workItem: { select: { title: true } } } } } }),
    db.cosConnection.findMany({ where: { status: "failed" }, orderBy: { lastCheckedAt: "desc" }, take: 15 }),
    db.losJob.findMany({ where: { status: "dead" }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, type: true, lastError: true, updatedAt: true } }).catch(() => []),
    db.cosEngagement.findMany({ where: { renewalAt: { gte: now, lte: new Date(now.getTime() + 60 * 86_400_000) }, stage: { in: ["active", "review"] } }, orderBy: { renewalAt: "asc" } }),
    db.cosCommercialRecord.findMany({ where: { status: { in: ["draft", "issued", "part_paid", "overdue"] }, demo: false }, orderBy: { dueAt: "asc" }, take: 20 }),
    db.cosAiUsage.groupBy({ by: ["orgId"], where: { createdAt: { gte: month } }, _count: { _all: true, costMicros: true }, _sum: { costMicros: true, inputTokens: true, outputTokens: true } }),
    db.cosWorkEvent.groupBy({ by: ["actorId"], where: { kind: "time", createdAt: { gte: week } }, _sum: { minutes: true } }),
    db.cosWorkItem.groupBy({ by: ["assigneeId"], where: { assigneeId: { not: null }, state: { notIn: ["closed", "cancelled", "delivered", "verified"] } }, _count: true }),
    db.losMembership.findMany({ where: { role: { startsWith: "cgo_" } }, select: { userId: true, role: true, user: { select: { name: true, email: true } } }, distinct: ["userId"] }),
    schedulerHealth(now),
    db.cosPaymentEvent.count({ where: { appliedTo: "unmatched", type: { not: "credit_claim" } } }),
  ]);
  const org = (id: string) => orgs.find((o) => o.id === id);
  const n = (rows: { orgId: string; _count: number }[], id: string) => rows.find((r) => r.orgId === id)?._count ?? 0;
  const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
  const th = "px-4 py-2", td = "px-4 py-2";
  const Section = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => <div className="card mb-6 !p-0"><div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3"><span className="text-[15px] font-bold text-white">{title}</span>{note && <span className="text-[12px] text-[var(--color-muted)]">{note}</span>}</div>{children}</div>;
  const none = (text: string) => <div className="px-4 py-5 text-center text-[13px] text-[var(--color-muted)]">{text}</div>;

  return (
    <>
      <div role="status" className={`mb-6 rounded-xl border px-4 py-3 text-[13px] ${health.stale ? "border-red-500/60 text-red-300" : "border-[var(--color-line)] text-[var(--color-muted)]"}`}>
        Scheduler: {health.lastRun ? `last ran ${Math.round((now.getTime() - health.lastRun.getTime()) / 60_000)} min ago` : "has never run"}{health.stale ? " — scheduled posts, waits and recurring work are NOT running. Check the scheduler that calls /api/os/tick." : "."}
        {unmatched > 0 && <span className="ml-3 text-amber-300">{unmatched} payment event(s) could not be matched — review them.</span>}
        {(health.deadJobs > 0 || health.stuckJobs > 0) && <div className="mt-1 text-amber-300">Background jobs need attention: {health.deadJobs} gave up after all retries, {health.stuckJobs} stuck for over 30 minutes.{health.recentFailures.length > 0 && <> Latest: {health.recentFailures.map((f) => `${f.type} — ${(f.lastError ?? "no error text").slice(0, 80)}`).join(" · ")}</>}</div>}
      </div>

      <Section title="Engagements" note={`${engagements.length} open`}>
        {engagements.length === 0 ? none("No open engagements.") : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[13px]">
            <thead><tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]"><th className={th}>Client</th><th className={th}>Engagement</th><th className={th}>Stage</th><th className={th}>Hold</th><th className={th}>Readiness</th><th className={th}>Open requests</th><th className={th}>In QA</th><th className={th}>With client</th><th className={th}>Payment</th><th className={th}>Next action</th></tr></thead>
            <tbody>{engagements.map((e) => { const a = approvals.find((x) => x.orgId === e.orgId); return (
              <tr key={e.id} className="border-b border-[var(--color-line)]">
                <td className={td}><Link className="text-[var(--color-brand-soft)] hover:text-white" href={`/admin/os/${e.orgId}`}>{org(e.orgId)?.name ?? e.orgId}</Link>{org(e.orgId)?.demo ? <span className="ml-1 text-[11px] text-[var(--color-faint)]">demo</span> : null}</td>
                <td className={td}>{e.name}<span className="ml-1 text-[11px] text-[var(--color-faint)]">{e.entrySource}</span></td>
                <td className={td}>{STAGE_LABEL[e.stage as EngagementStage]}</td>
                <td className={`${td} ${e.hold !== "none" ? "text-amber-300" : ""}`}>{e.hold === "none" ? "" : e.hold.replace(/_/g, " ")}</td>
                <td className={td}>{e.readiness.replace(/_/g, " ")}</td>
                <td className={td}>{checklist.find((c) => c.engagementId === e.id)?._count || ""}</td>
                <td className={td}>{n(qa, e.orgId) + n(variantsQa, e.orgId) || ""}</td>
                <td className={td}>{a ? `${a._count} · oldest ${day(a._min.createdAt)}` : ""}</td>
                <td className={`${td} ${e.paymentStatus === "overdue" ? "text-red-400" : ""}`}>{e.paymentStatus.replace(/_/g, " ")}</td>
                <td className={td}>{e.nextAction ? `${e.nextAction}${e.nextActionSide ? ` (${e.nextActionSide})` : ""}` : ""}</td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Publishing and connection issues" note="needs a person">
          {pubs.length + conns.length + deadJobs.length === 0 ? none("Nothing has failed.") : (
            <ul className="text-[13px]">
              {pubs.map((p) => <li key={p.id} className="border-b border-[var(--color-line)] px-4 py-2"><span className={p.status === "failed" ? "text-red-400" : "text-amber-300"}>{p.status}</span> · {org(p.orgId)?.name} · {p.channel} · {p.variant.workItem.title}<div className="text-[12px] text-[var(--color-muted)]">{p.lastError}</div></li>)}
              {conns.map((c) => <li key={c.id} className="border-b border-[var(--color-line)] px-4 py-2"><span className="text-red-400">connection failed</span> · {org(c.orgId)?.name} · {c.accountLabel ?? c.provider}<div className="text-[12px] text-[var(--color-muted)]">{c.lastError}</div></li>)}
              {deadJobs.map((j) => <li key={j.id} className="border-b border-[var(--color-line)] px-4 py-2"><span className="text-red-400">job gave up</span> · {j.type} · {day(j.updatedAt)}<div className="text-[12px] text-[var(--color-muted)]">{j.lastError?.slice(0, 160)}</div></li>)}
            </ul>
          )}
        </Section>

        <Section title="Capacity" note="last 7 days · open assignments now">
          {staff.length === 0 ? none("No delivery staff yet.") : (
            <table className="w-full text-left text-[13px]"><thead><tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]"><th className={th}>Person</th><th className={th}>Role</th><th className={th}>Hours logged</th><th className={th}>Open items</th></tr></thead>
              <tbody>{staff.map((s) => <tr key={s.userId} className="border-b border-[var(--color-line)]"><td className={td}>{s.user.name ?? s.user.email}</td><td className={td}>{s.role.replace("cgo_", "")}</td><td className={td}>{Math.round(((time.find((t) => t.actorId === s.userId)?._sum.minutes ?? 0) / 60) * 10) / 10}</td><td className={td}>{assigned.find((a) => a.assigneeId === s.userId)?._count ?? 0}</td></tr>)}</tbody></table>
          )}
          <p className="px-4 py-2 text-[12px] text-[var(--color-faint)]">Hours are what people logged, not availability. Use it to spot overload, not to bill.</p>
        </Section>

        <Section title="Renewals in the next 60 days">
          {renewals.length === 0 ? none("No renewals coming up.") : <ul className="text-[13px]">{renewals.map((e) => <li key={e.id} className="flex justify-between border-b border-[var(--color-line)] px-4 py-2"><Link className="text-[var(--color-brand-soft)] hover:text-white" href={`/admin/os/${e.orgId}`}>{org(e.orgId)?.name} — {e.name}</Link><span>{day(e.renewalAt)} · {e.renewalMode}</span></li>)}</ul>}
        </Section>

        <Section title="Commercial — open items" note="real clients only">
          {records.length === 0 ? none("Nothing to invoice or collect.") : <ul className="text-[13px]">{records.map((r) => <li key={r.id} className="flex justify-between gap-2 border-b border-[var(--color-line)] px-4 py-2"><span>{org(r.orgId)?.name} · {r.description}</span><span className={r.status === "overdue" ? "text-red-400" : ""}>{new Intl.NumberFormat("en", { style: "currency", currency: r.currency }).format(Number(r.amountMinor) / 100)} · {r.status}{r.dueAt ? ` · due ${day(r.dueAt)}` : ""}</span></li>)}</ul>}
        </Section>

        <Section title="AI usage — last 30 days" note="internal">
          {ai.length === 0 ? none("No AI calls recorded.") : (
            <table className="w-full text-left text-[13px]"><thead><tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]"><th className={th}>Client</th><th className={th}>Calls</th><th className={th}>Tokens in / out</th><th className={th}>Cost</th></tr></thead>
              <tbody>{ai.map((a) => <tr key={a.orgId} className="border-b border-[var(--color-line)]"><td className={td}>{org(a.orgId)?.name}</td><td className={td}>{a._count._all}</td><td className={td}>{a._sum.inputTokens ?? "n/a"} / {a._sum.outputTokens ?? "n/a"}</td><td className={td}>{a._count.costMicros === a._count._all && a._count._all > 0 ? `$${((a._sum.costMicros ?? 0) / 1_000_000).toFixed(4)}` : <span className="text-[var(--color-muted)]">unknown — prices not configured</span>}</td></tr>)}</tbody></table>
          )}
        </Section>
      </div>
    </>
  );
}
