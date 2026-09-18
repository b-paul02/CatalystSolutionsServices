import Link from "next/link";
import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { PROGRAM_OPTIONS } from "@/lib/os/catalog";
import AdminForm from "./AdminForm";
import { provisionWorkspace } from "./actions";

export const metadata = { title: "GrowthOS command center" };

// Agency command center (blueprint §4.3): exception-only across clients —
// approvals stuck, blocked / overdue / failed work, kill switches, proposals
// waiting, workspaces without a baseline. Drill into a tenant from here.
export default async function OsAdminPage() {
  await requirePlatform();
  const now = new Date();
  const staleApprovals = new Date(now.getTime() - 3 * 86_400_000);
  const [workspaces, orgs, approvals, blocked, overdue, failed, proposed, killed, recentLeads] = await Promise.all([
    db.cosWorkspace.findMany({ orderBy: { createdAt: "desc" } }),
    db.losOrg.findMany({ select: { id: true, name: true, industry: true, market: true, demo: true } }),
    db.cosApproval.groupBy({ by: ["orgId"], where: { status: "requested", createdAt: { lt: staleApprovals } }, _count: true }),
    db.cosWorkItem.groupBy({ by: ["orgId"], where: { state: "blocked" }, _count: true }),
    db.cosWorkItem.groupBy({ by: ["orgId"], where: { dueAt: { lt: now }, state: { notIn: ["closed", "cancelled", "delivered", "verified"] } }, _count: true }),
    db.cosWorkItem.groupBy({ by: ["orgId"], where: { state: "failed" }, _count: true }),
    db.cosContract.groupBy({ by: ["orgId"], where: { status: "proposed" }, _count: true }),
    db.cosWorkspace.count({ where: { killSwitch: true } }),
    db.lead.findMany({ where: { report: { isNot: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, url: true, email: true, createdAt: true, report: { select: { status: true } } } }),
  ]);
  const count = (rows: { orgId: string; _count: number }[], orgId: string) => rows.find((r) => r.orgId === orgId)?._count ?? 0;
  const orgName = (id: string) => orgs.find((o) => o.id === id);
  const claimed = new Set(workspaces.map((w) => w.sourceLeadId).filter(Boolean));
  const rows = workspaces.map((w) => ({
    w, org: orgName(w.orgId),
    stale: count(approvals, w.orgId), blocked: count(blocked, w.orgId), overdue: count(overdue, w.orgId), failed: count(failed, w.orgId), proposed: count(proposed, w.orgId),
  }));
  const exceptions = rows.filter((r) => r.stale + r.blocked + r.overdue + r.failed > 0 || r.w.killSwitch);

  return (
    <div className="shell py-8">
      <h1 className="mb-1 text-2xl font-extrabold text-white">CatalystGrowthOS</h1>
      <p className="mb-6 text-[13.5px] text-[var(--color-muted)]">{workspaces.length} workspaces · {exceptions.length} with exceptions · {killed} kill switch{killed === 1 ? "" : "es"} on</p>

      <div className="card mb-6 !p-0">
        <div className="border-b border-[var(--color-line)] px-4 py-3 text-[15px] font-bold text-white">Exceptions</div>
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-[var(--color-line)] text-[12px] uppercase text-[var(--color-muted)]"><th className="px-4 py-2">Workspace</th><th className="px-4 py-2">Approvals &gt;3d</th><th className="px-4 py-2">Blocked</th><th className="px-4 py-2">Overdue</th><th className="px-4 py-2">Failed</th><th className="px-4 py-2">Kill switch</th></tr></thead>
          <tbody>
            {exceptions.map((r) => (
              <tr key={r.w.orgId} className="border-b border-[var(--color-line)]">
                <td className="px-4 py-2"><Link className="text-[var(--color-brand-soft)] hover:text-white" href={`/admin/os/${r.w.orgId}`}>{r.org?.name ?? r.w.orgId}</Link></td>
                <td className="px-4 py-2">{r.stale || ""}</td><td className="px-4 py-2">{r.blocked || ""}</td><td className="px-4 py-2">{r.overdue || ""}</td><td className="px-4 py-2">{r.failed || ""}</td>
                <td className="px-4 py-2 text-red-400">{r.w.killSwitch ? "ON" : ""}</td>
              </tr>
            ))}
            {exceptions.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted)]">No exceptions. Quiet is good.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card !p-0">
          <div className="border-b border-[var(--color-line)] px-4 py-3 text-[15px] font-bold text-white">All workspaces</div>
          <ul>
            {rows.map((r) => (
              <li key={r.w.orgId} className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2 text-[13px]">
                <div><Link className="text-[var(--color-brand-soft)] hover:text-white" href={`/admin/os/${r.w.orgId}`}>{r.org?.name ?? r.w.orgId}</Link><span className="ml-2 text-[12px] text-[var(--color-faint)]">{r.w.kind}{r.org?.demo ? " · demo" : ""}</span></div>
                <span className="text-[12px] text-[var(--color-muted)]">{r.proposed ? `${r.proposed} proposal waiting` : ""}</span>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[var(--color-muted)]">No workspaces yet.</li>}
          </ul>
        </div>

        <div className="space-y-6">
          <AdminForm action={provisionWorkspace} submit="Create workspace" title="New workspace">
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">From a delivered Growth Audit (optional)
              <select name="leadId" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white">
                <option value="">— blank workspace —</option>
                {recentLeads.filter((l) => !claimed.has(l.id)).map((l) => <option key={l.id} value={l.id} className="text-black">{l.url} · {l.email} · {l.report?.status}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Name<input name="name" placeholder="from audit if blank" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" /></label>
              <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Website<input name="website" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" /></label>
              <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Market<select name="market" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white"><option value="IN" className="text-black">India</option><option value="US" className="text-black">US</option></select></label>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Industry<select name="industry" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white"><option value="">—</option>{PROGRAM_OPTIONS.map((p) => <option key={p.slug} value={p.industry} className="text-black">{p.industry}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Client owner email (invited as owner)<input name="ownerEmail" type="email" className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white" /></label>
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]"><input type="checkbox" name="demo" /> Demo workspace (wipeable)</label>
          </AdminForm>
        </div>
      </div>
    </div>
  );
}
