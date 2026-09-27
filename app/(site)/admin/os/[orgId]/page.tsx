import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { isStaffRole, STAFF_ROLES } from "@/lib/leados/rbac";
import { PROGRAM_OPTIONS, SERVICES, TIERS } from "@/lib/os/catalog";
import { entitlements } from "@/lib/os/entitlements";
import { TOOLS } from "@/lib/os/studio";
import AdminForm from "../AdminForm";
import { addStaff, attachAudit, endContract, proposeContract, removeStaff, newEngagement } from "../actions";

export const metadata = { title: "Workspace" };

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";

export default async function OsWorkspaceAdminPage({ params }: { params: Promise<{ orgId: string }> }) {
  await requirePlatform();
  const { orgId } = await params;
  const [org, ws, ent, members, contracts, runs, work, minutes, ai, approvals, audits] = await Promise.all([
    db.losOrg.findUnique({ where: { id: orgId } }),
    db.cosWorkspace.findUnique({ where: { orgId } }),
    entitlements(orgId),
    db.losMembership.findMany({ where: { orgId }, include: { user: { select: { email: true, name: true } } } }),
    db.cosContract.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    db.cosAuditRun.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    db.cosWorkItem.groupBy({ by: ["state"], where: { orgId }, _count: true }),
    db.cosWorkEvent.aggregate({ where: { orgId, kind: "time" }, _sum: { minutes: true } }),
    db.cosWorkEvent.aggregate({ where: { orgId, kind: "ai" }, _count: true, _sum: { aiCostMicros: true } }),
    db.cosApproval.count({ where: { orgId, status: "requested" } }),
    db.lead.findMany({ where: { report: { isNot: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, url: true, email: true } }),
  ]);
  if (!org) notFound();
  const engagements = await db.cosEngagement.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  const staff = members.filter((m) => isStaffRole(m.role));
  const clients = members.filter((m) => !isStaffRole(m.role));

  return (
    <div className="shell py-8">
      <Link href="/admin/os" className="text-[13px] text-[var(--color-muted)] hover:text-white">← Command center</Link>
      <h1 className="mb-1 mt-1 text-2xl font-extrabold text-white">{org.name}</h1>
      <p className="mb-6 text-[13.5px] text-[var(--color-muted)]">{ws?.kind ?? "legacy"} · {org.market} · {org.industry ?? "—"} · {org.website ?? "no site"}{org.demo ? " · demo" : ""}{ws?.killSwitch ? " · KILL SWITCH ON" : ""}</p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ["Modules", [...ent.modules].length], ["Open approvals", approvals],
          ["Work items", work.reduce((a, r) => a + r._count, 0)], ["Hours logged", Math.round((minutes._sum.minutes ?? 0) / 6) / 10],
          ["AI calls", ai._count],
        ].map(([l, v]) => <div key={String(l)} className="card !p-4"><div className="text-[12.5px] text-[var(--color-muted)]">{l}</div><div className="text-[24px] font-extrabold text-white">{v}</div></div>)}
      </div>

      <div className="card mb-6 !p-4 text-[13.5px]">
        <div className="mb-2 text-[15px] font-bold text-white">Engagements</div>
        {engagements.length === 0 ? <p className="text-[var(--color-muted)]">No engagement yet — create one, then propose scope against it.</p> : (
          <ul className="mb-3 divide-y divide-[var(--color-line)]">{engagements.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="text-white">{e.name}<span className="ml-2 text-[12px] text-[var(--color-faint)]">{e.entrySource}{e.partnerDealId ? " · partner deal linked" : ""}</span></span><span className="text-[var(--color-muted)]">{e.stage.replace(/_/g, " ")}{e.hold !== "none" ? ` · ${e.hold.replace(/_/g, " ")}` : ""} · payment {e.paymentStatus.replace(/_/g, " ")}</span></li>)}</ul>
        )}
        <AdminForm action={newEngagement} submit="Add engagement" title="New engagement for this organisation">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Name<input name="name" required className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" /></label>
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Partner deal id (optional)<input name="partnerDealId" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" /></label>
          </div>
          <fieldset className="flex flex-wrap gap-3 text-[12.5px] text-[var(--color-muted)]"><legend className="mb-1">Business goals</legend>{["visibility", "acquisition", "retention", "operations", "product"].map((g) => <label key={g} className="flex items-center gap-1 capitalize"><input type="checkbox" name="goalFocus" value={g} />{g}</label>)}</fieldset>
        </AdminForm>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="card !p-4 text-[13.5px]">
            <div className="mb-2 text-[15px] font-bold text-white">Contracts</div>
            {contracts.map((c) => (
              <div key={c.id} className="flex items-start justify-between border-t border-[var(--color-line)] py-2">
                <div>
                  <div className="text-white">{c.kind}{c.programSlug ? ` · ${c.programSlug}` : ""}{c.tier ? ` · ${c.tier}` : ""} <span className="text-[12px] text-[var(--color-faint)]">· {c.status}</span></div>
                  <div className="text-[12px] text-[var(--color-muted)]">{(JSON.parse(c.services) as string[]).join(", ")}</div>
                </div>
                {(c.status === "active" || c.status === "proposed") && <AdminForm action={endContract} submit={c.status === "active" ? "End" : "Withdraw"} hidden={{ contractId: c.id, orgId }} confirm="End this contract?" />}
              </div>
            ))}
            {contracts.length === 0 && <p className="text-[var(--color-muted)]">None yet — propose scope below.</p>}
          </div>

          <AdminForm action={proposeContract} submit="Propose to client" title="Propose scope" hidden={{ orgId }}>
            <div className="flex flex-wrap gap-3">
              <label className={label}>Kind<select name="kind" className={input}><option value="program" className="text-black">Program</option><option value="project" className="text-black">Project</option><option value="change" className="text-black">Scope change</option><option value="addon" className="text-black">Add-on</option></select></label>
              <label className={label}>Program<select name="programSlug" className={input}><option value="">—</option>{PROGRAM_OPTIONS.map((p) => <option key={p.slug} value={p.slug} className="text-black">{p.name}</option>)}</select></label>
              <label className={label}>Tier<select name="tier" className={input}>{TIERS.map((t) => <option key={t} value={t} className="text-black">{t}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--color-muted)]">
              {SERVICES.map((s) => <label key={s.slug} className="flex items-center gap-1"><input type="checkbox" name="services" value={s.slug} />{s.title}</label>)}
            </div>
            <div className="flex gap-4 text-[12.5px] text-[var(--color-muted)]">
              <label className="flex items-center gap-1"><input type="checkbox" name="crm" defaultChecked /> CRM module</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="lead_supply" /> Lead supply (tokens)</label>
            </div>
            <fieldset className="text-[12.5px] text-[var(--color-muted)]">
              <legend className="mb-1 text-white">AI Studio tools the client may run themselves (separate from services and from credits)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{TOOLS.map((t) => <label key={t.key} className="flex items-center gap-1"><input type="checkbox" name="aiTools" value={t.key} />{t.label}</label>)}</div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>Included AI credits (granted once, when the client signs)<input name="includedAiCredits" inputMode="numeric" placeholder="0" className={input} /></label>
              <label className={label}>…which expire after (days; blank = never)<input name="includedAiCreditsExpireDays" inputMode="numeric" className={input} /></label>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]"><input type="checkbox" name="includedAiCreditsAdditional" /> These are ADDITIONAL credits — this workspace already has a scope that includes some</label>
            <label className={label}>Scope (what&apos;s included; defaults to the program tier deliverables)<textarea name="scopeDoc" rows={3} className={input} /></label>
            <label className={label}>Exclusions<input name="exclusions" className={input} /></label>
            <label className={label}>Pricing note (placeholder until the price book is set)<input name="pricing" className={input} /></label>
          </AdminForm>
        </div>

        <div className="space-y-6">
          <div className="card !p-4 text-[13.5px]">
            <div className="mb-2 text-[15px] font-bold text-white">People</div>
            <div className="text-[12px] uppercase text-[var(--color-faint)]">Client</div>
            {clients.map((m) => <div key={m.id} className="py-1 text-white">{m.user.name ?? m.user.email} <span className="text-[12px] text-[var(--color-muted)]">· {m.role}</span></div>)}
            {clients.length === 0 && <p className="text-[var(--color-muted)]">No client users yet.</p>}
            <div className="mt-3 text-[12px] uppercase text-[var(--color-faint)]">Catalyst staff</div>
            {staff.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1 text-white">
                <span>{m.user.name ?? m.user.email} <span className="text-[12px] text-[var(--color-muted)]">· {m.role.replace(/_/g, " ")}</span></span>
                <AdminForm action={removeStaff} submit="Remove" hidden={{ membershipId: m.id, orgId }} />
              </div>
            ))}
            <AdminForm action={addStaff} submit="Add staff" hidden={{ orgId }}>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className={label}>Email<input name="email" type="email" required className={input} /></label>
                <label className={label}>Role<select name="role" className={input}>{STAFF_ROLES.map((r) => <option key={r} value={r} className="text-black">{r.replace(/_/g, " ")}</option>)}</select></label>
              </div>
            </AdminForm>
          </div>

          <div className="card !p-4 text-[13.5px]">
            <div className="mb-2 text-[15px] font-bold text-white">Audits</div>
            {runs.map((r) => <div key={r.id} className="border-t border-[var(--color-line)] py-1.5 text-white">{r.kind} · {r.url} <span className="text-[12px] text-[var(--color-muted)]">· {r.createdAt.toISOString().slice(0, 10)}</span></div>)}
            <AdminForm action={attachAudit} submit="Attach" hidden={{ orgId }}>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className={label}>Delivered audit<select name="leadId" className={input}>{audits.map((l) => <option key={l.id} value={l.id} className="text-black">{l.url} · {l.email}</option>)}</select></label>
                <label className={label}>Kind<select name="kind" className={input}><option value="initial" className="text-black">initial</option><option value="quarterly" className="text-black">quarterly re-audit</option><option value="service" className="text-black">service-specific</option></select></label>
              </div>
            </AdminForm>
          </div>

          <div className="card !p-4 text-[13.5px]">
            <div className="mb-2 text-[15px] font-bold text-white">Work by state</div>
            <div className="flex flex-wrap gap-2">{work.map((w) => <span key={w.state} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[12px] text-[var(--color-muted)]">{w.state.replace(/_/g, " ")} {w._count}</span>)}{work.length === 0 && <span className="text-[var(--color-muted)]">none</span>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
