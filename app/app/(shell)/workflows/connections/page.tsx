import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { KEY_PROVIDERS } from "@/lib/os/automation/catalog";
import { Badge, Card, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field, PageHeader } from "@/components/os/bits";
import { connectKey, disconnectKey } from "../actions";

export const metadata = { title: "Workflow connections" };

// Key-based connections for workflow steps. The key is encrypted at rest, never
// shown again, and a connection counts only after its live test passes.
export default async function ConnectionsPage() {
  const { actor } = await requireModule("automations", "work.view");
  const rows = await db.cosConnection.findMany({ where: { orgId: actor.orgId, provider: { in: Object.keys(KEY_PROVIDERS) } } });
  const manage = can(actor.role, "automations.manage");
  return (
    <div className="max-w-[820px]">
      <Link href="/app/workflows" className="text-[12.5px] text-[var(--los-muted)] hover:underline">← Workflows</Link>
      <PageHeader title="Connections" sub="Tools your workflows can post to. Google, LinkedIn and X sign-ins live in Settings → Workspace." />
      <div className="space-y-3">
        {Object.entries(KEY_PROVIDERS).map(([provider, p]) => {
          const c = rows.find((r) => r.provider === provider);
          const live = c && c.status !== "disconnected";
          return (
            <Card key={provider} className="p-4 text-[13.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{p.label} {live && <Badge tone={c.status === "verified" ? "success" : "danger"}>{c.status}</Badge>}</div>
                {live && <span className="text-[12px] text-[var(--los-faint)]">{c.accountLabel ? `${c.accountLabel} · ` : ""}checked {day(c.lastCheckedAt)}</span>}
              </div>
              {live && c.lastError && <p className="mt-1 text-[12.5px] text-[var(--los-danger)]">{c.lastError}</p>}
              {manage && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <ActionForm action={connectKey} submit={live ? "Replace" : "Connect"} tone={live ? "ghost" : "brand"} hidden={{ provider }} className="flex min-w-[280px] flex-1 flex-wrap items-end gap-2">
                    <div className="min-w-[240px] flex-1"><Label>{p.secretLabel}</Label><input name="secret" type="password" autoComplete="off" required className={field} /></div>
                  </ActionForm>
                  {live && <ActionForm action={disconnectKey} submit="Disconnect" tone="danger" hidden={{ provider }} confirm={`Disconnect ${p.label}? Workflows using it will fail until it is reconnected.`} />}
                </div>
              )}
              <p className="mt-2 text-[12px] text-[var(--los-faint)]">{p.help}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
