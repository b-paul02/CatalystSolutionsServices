import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { tokenBalance } from "@/lib/leados/tokens";
import { entitlements, monthlyUsage } from "@/lib/os/entitlements";
import { programs } from "@/lib/programs";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, PageHeader, SectionTitle, StateBadge } from "@/components/os/bits";
import { signContract } from "../_os/actions";

export const metadata = { title: "Overview" };

// Executive command (blueprint §4.2): goals, decisions waiting, delivery, usage.
// Missing data reads "Not connected" — never a fake zero.
export default async function OverviewPage() {
  const actor = await requireOrg();
  const orgId = actor.orgId;
  const viewAll = can(actor.role, "work.view");
  const mine = viewAll ? {} : { assigneeId: actor.userId };
  const now = new Date();
  const [org, ent, goals, proposed, approvals, active, blocked, overdue, usage, baseline] = await Promise.all([
    db.losOrg.findUnique({ where: { id: orgId } }),
    entitlements(orgId),
    db.cosGoal.findMany({ where: { orgId, archivedAt: null }, take: 4 }),
    db.cosContract.findMany({ where: { orgId, status: "proposed" } }),
    db.cosApproval.count({ where: { orgId, status: "requested" } }),
    db.cosWorkItem.findMany({ where: { orgId, ...mine, parentId: null, state: { notIn: ["closed", "cancelled", "backlog"] } }, orderBy: [{ priority: "asc" }, { dueAt: "asc" }], take: 8 }),
    db.cosWorkItem.count({ where: { orgId, ...mine, state: "blocked" } }),
    db.cosWorkItem.count({ where: { orgId, ...mine, dueAt: { lt: now }, state: { notIn: ["closed", "cancelled", "delivered", "verified"] } } }),
    monthlyUsage(orgId),
    db.cosBaseline.findFirst({ where: { orgId }, orderBy: { version: "desc" } }),
  ]);
  const crm = ent.modules.has("crm") && can(actor.role, "leads.view");
  const [leads, balance] = crm ? await Promise.all([db.losLead.count({ where: { orgId, deletedAt: null } }), tokenBalance(orgId)]) : [0, 0];

  const attention = [
    { label: "Approvals waiting", value: approvals, href: "/app/approvals", show: viewAll },
    { label: "Blocked", value: blocked, href: "/app/work?state=blocked", show: true },
    { label: "Overdue", value: overdue, href: "/app/work", show: true },
  ].filter((a) => a.show);

  return (
    <div className="max-w-[1100px]">
      <PageHeader
        title={`Welcome${actor.name ? `, ${actor.name.split(" ")[0]}` : ""}`}
        sub={`${org?.name} · ${ent.kind === "prospect" ? "Prospect workspace — audit and routes" : ent.kind === "legacy" ? "Lead workspace" : "Client workspace"}${isStaffRole(actor.role) ? " · you are Catalyst staff here" : ""}`}
      />

      {proposed.map((c) => {
        const program = programs.find((p) => p.slug === c.programSlug);
        const services = JSON.parse(c.services) as string[];
        return (
          <Card key={c.id} className="mb-5 border-[var(--los-brand)] p-5">
            <div className="text-[15px] font-bold">Proposed scope: {program?.name ?? c.kind}{c.tier ? ` · ${c.tier}` : ""}</div>
            <p className="mt-1 text-[13.5px] text-[var(--los-muted)]">Services: {services.join(", ") || "—"}</p>
            {c.scopeDoc && <p className="mt-2 whitespace-pre-wrap text-[13.5px]">{c.scopeDoc}</p>}
            {c.exclusions && <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">Not included: {c.exclusions}</p>}
            {can(actor.role, "contract.sign") ? (
              <div className="mt-3 flex gap-2">
                <ActionForm action={signContract} submit="Sign & activate" hidden={{ contractId: c.id, decision: "sign" }} />
                <ActionForm action={signContract} submit="Decline" tone="ghost" hidden={{ contractId: c.id, decision: "decline" }} />
              </div>
            ) : <p className="mt-3 text-[12.5px] text-[var(--los-faint)]">Only a workspace owner can sign.</p>}
          </Card>
        );
      })}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {goals.map((g) => (
          <Card key={g.id} className="p-4">
            <div className="text-[12.5px] font-medium text-[var(--los-muted)]">{g.metric} · {g.horizon}</div>
            <div className="mt-1 text-[24px] font-extrabold tracking-tight">
              {g.currentValue === null ? <span className="text-[15px] font-semibold text-[var(--los-faint)]">Not connected</span> : g.currentValue.toLocaleString()}
              <span className="text-[13px] font-medium text-[var(--los-faint)]"> / {g.target.toLocaleString()} {g.unit}</span>
            </div>
            <div className="mt-1"><EvidenceBadge label={g.currentLabel} /></div>
          </Card>
        ))}
        {goals.length === 0 && (
          <Card className="col-span-2 p-4 text-[13.5px] text-[var(--los-muted)] lg:col-span-4">
            No goals agreed yet. {ent.modules.has("strategy") ? <Link className="text-[var(--los-brand)] hover:underline" href="/app/strategy">Set them in Strategy →</Link> : <Link className="text-[var(--los-brand)] hover:underline" href="/app/audit">Start with your Growth Audit →</Link>}
          </Card>
        )}
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {attention.map((a) => (
          <Link key={a.label} href={a.href}>
            <Card className="p-4 hover:border-[var(--los-brand)]">
              <div className="text-[12.5px] font-medium text-[var(--los-muted)]">{a.label}</div>
              <div className={`mt-1 text-[26px] font-extrabold ${a.value > 0 ? "text-[var(--los-warn)]" : ""}`}>{a.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Delivery</SectionTitle>
          <ul className="divide-y divide-[var(--los-line)]">
            {active.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]">
                <Link href={`/app/work/${w.id}`} className="min-w-0 truncate font-medium text-[var(--los-brand)] hover:underline">{w.title}</Link>
                <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-[var(--los-faint)]">
                  {w.studio && <span>{w.studio}</span>}<span>due {day(w.dueAt)}</span><StateBadge state={w.state} />
                </div>
              </li>
            ))}
            {active.length === 0 && <Empty>No active work yet.</Empty>}
          </ul>
        </Card>
        <div className="space-y-5">
          {ent.kind === "client" && (
            <Card className="p-4 text-[13.5px]">
              <div className="mb-2 text-[15px] font-bold">This month</div>
              <div className="flex justify-between"><span className="text-[var(--los-muted)]">Deliverables</span><span>{usage.delivered} / {ent.allowances.deliverablesPerMonth || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--los-muted)]">Review cycles</span><span>{ent.allowances.reviewCycles || "—"} per item</span></div>
              <div className="flex justify-between"><span className="text-[var(--los-muted)]">Response window</span><span>{ent.allowances.responseHours ? `${ent.allowances.responseHours}h` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--los-muted)]">Baseline</span><span>{baseline ? `v${baseline.version} · ${day(baseline.createdAt)}` : "not recorded"}</span></div>
            </Card>
          )}
          {crm && (
            <Card className="p-4 text-[13.5px]">
              <div className="mb-2 text-[15px] font-bold">CRM</div>
              <div className="flex justify-between"><span className="text-[var(--los-muted)]">Leads</span><Link className="text-[var(--los-brand)] hover:underline" href="/app/leads">{leads.toLocaleString()}</Link></div>
              {ent.modules.has("lead_supply") && <div className="flex justify-between"><span className="text-[var(--los-muted)]">Token balance</span><span>{balance.toLocaleString()}</span></div>}
            </Card>
          )}
          {can(actor.role, "work.request") && (
            <Card className="p-4 text-[13.5px]">
              <div className="mb-1 text-[15px] font-bold">Need something else?</div>
              <p className="mb-2 text-[var(--los-muted)]">Request a service outside your current scope — we&apos;ll scope it and ask for approval before any work or charge.</p>
              <Link href="/app/work?request=1" className="font-medium text-[var(--los-brand)] hover:underline">Request a service →</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
