import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { FAILURES_BEFORE_ALERT } from "@/lib/os/monitors";
import { Badge, Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { field } from "@/components/os/bits";
import { monitorAdd, monitorCheck, monitorRemove } from "./actions";

export const metadata = { title: "Monitoring" };

// WP-29 · Settings → Monitoring: add a URL, see its status, check now. Alerts arrive as notifications (site_down / site_up).
export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const actor = await requireOrgPage();
  const sp = await searchParams;
  const [ent, monitors, org] = await Promise.all([entitlements(actor.orgId), db.cosMonitor.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "asc" } }), db.losOrg.findUnique({ where: { id: actor.orgId }, select: { website: true } })]);
  const edit = (can(actor.role, "os.settings") || can(actor.role, "work.manage")) && ent.accessMode === "active";
  return (
    <div className="space-y-5">
      {sp.added && <GrowthStep done="Monitor added." step={{ pillar: "digital_presence", metric: "sessions", metricLabel: "Website sessions", action: { kind: "goal", label: "Set an uptime goal", title: "Website answers every check this quarter", unit: "checks passed", horizon: "90 days" } }} />}
      <Card className="p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Uptime monitors</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">Pinged from the scheduler (HEAD, 10 s timeout). {FAILURES_BEFORE_ALERT} failures in a row raise a “site down” notification for you and the Catalyst team, once per outage, and “back up” on recovery. The care-plan work item gets a note.</p>
        <ul className="divide-y divide-[var(--los-line)]">
          {monitors.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0"><span className="break-all font-medium">{m.url}</span> <Badge tone={m.lastStatus === "ok" ? "success" : m.lastStatus === "down" ? "danger" : "neutral"}>{m.lastStatus === "ok" ? "up" : m.lastStatus === "down" ? "DOWN" : "not checked yet"}</Badge><div className="text-[12px] text-[var(--los-faint)]">every {m.everyMin} min{m.lastAt ? ` · last check ${m.lastAt.toISOString().slice(0, 16).replace("T", " ")}Z` : ""}{m.failures ? ` · ${m.failures} failure(s) in a row` : ""}</div></div>
              {edit && <div className="flex gap-2"><ActionForm action={monitorCheck} submit="Check now" tone="ghost" hidden={{ id: m.id }} /><ActionForm action={monitorRemove} submit="Remove" tone="danger" hidden={{ id: m.id }} /></div>}
            </li>
          ))}
          {monitors.length === 0 && <li className="py-3 text-[var(--los-faint)]">No monitors yet. Add your website below.</li>}
        </ul>
        {edit && <ActionForm action={monitorAdd} submit="Add monitor" className="mt-3 flex flex-wrap items-end gap-2"><div className="min-w-[240px] flex-1"><Label>URL</Label><Input name="url" defaultValue={monitors.length ? "" : org?.website ?? ""} placeholder="https://www.yoursite.com" required /></div><div><Label>Every (min)</Label><select name="everyMin" className={field} defaultValue="5">{[5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></ActionForm>}
      </Card>
    </div>
  );
}
