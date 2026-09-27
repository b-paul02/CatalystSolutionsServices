import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { BLOCKS } from "@/lib/os/automation/catalog";
import { TEMPLATES } from "@/lib/os/automation/templates";
import type { Definition } from "@/lib/os/automation/definition";
import { Badge, Card, Input } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, PageHeader } from "@/components/os/bits";
import { newWorkflow } from "./actions";

export const metadata = { title: "Workflows" };

const TONE = { active: "success", draft: "warn", paused: "neutral" } as const;
const STATUS_LABEL: Record<string, string> = { active: "Active", draft: "Draft · not active", paused: "Paused" };

export default async function WorkflowsPage() {
  const { actor } = await requireModule("automations", "work.view");
  const [workflows, runs] = await Promise.all([
    db.cosWorkflow.findMany({ where: { orgId: actor.orgId, status: { not: "archived" } }, orderBy: { updatedAt: "desc" } }),
    db.cosWorkflowRun.groupBy({ by: ["workflowId", "status"], where: { orgId: actor.orgId, createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }, _count: true }),
  ]);
  const manage = can(actor.role, "automations.manage");
  const count = (id: string, status?: string) => runs.filter((r) => r.workflowId === id && (!status || r.status === status)).reduce((a, r) => a + r._count, 0);
  const categories = [...new Set(TEMPLATES.map((t) => t.category))];

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Workflows" sub="When this happens → check that → do this. Build your own or start from a template.">
        <Link href="/app/settings/connections" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--los-surface-2)]">Connections</Link>
      </PageHeader>

      <Card className="mb-6">
        <ul className="divide-y divide-[var(--los-line)]">
          {workflows.map((w) => {
            const def = JSON.parse(w.definition) as Definition;
            const path = def.nodes.slice(0, 5).map((n) => BLOCKS[n.type]?.label ?? n.type);
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                <div className="min-w-0">
                  <Link href={`/app/workflows/${w.id}`} className="font-semibold text-[var(--los-brand)] hover:underline">{w.name}</Link>
                  <div className="truncate text-[12px] text-[var(--los-faint)]">{path.join(" → ")}{def.nodes.length > 5 ? " → …" : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[12px] text-[var(--los-faint)]">
                  <span>{count(w.id)} runs · 7d{count(w.id, "failed") ? ` · ${count(w.id, "failed")} failed` : ""}</span>
                  <span>edited {day(w.updatedAt)}</span>
                  <Badge tone={TONE[w.status as keyof typeof TONE] ?? "neutral"}>{STATUS_LABEL[w.status] ?? w.status}</Badge>
                </div>
              </li>
            );
          })}
          {workflows.length === 0 && <Empty>No workflows yet — start from a template below.</Empty>}
        </ul>
        {manage && (
          <ActionForm action={newWorkflow} submit="New blank workflow" tone="ghost" className="flex items-end gap-2 border-t border-[var(--los-line)] px-5 py-3">
            <Input name="name" placeholder="Workflow name" className="max-w-[280px]" />
          </ActionForm>
        )}
      </Card>

      {categories.map((c) => (
        <div key={c} className="mb-6">
          <div className="mb-2 text-[13px] font-semibold text-[var(--los-muted)]">{c}</div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.filter((t) => t.category === c).map((t) => {
              const external = t.definition.nodes.some((n) => BLOCKS[n.type]?.external), contacts = t.definition.nodes.some((n) => BLOCKS[n.type]?.contacts);
              return (
                <Card key={t.key} className="flex flex-col p-4">
                  <div className="text-[14px] font-semibold">{t.name}</div>
                  <p className="mt-1 flex-1 text-[12.5px] text-[var(--los-muted)]">{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <Badge>{t.definition.nodes.length} steps</Badge>
                    {contacts && <Badge tone="warn">messages leads</Badge>}
                    {external && <Badge tone="brand">outside tools</Badge>}
                  </div>
                  {manage && <ActionForm action={newWorkflow} submit="Use template" tone="ghost" hidden={{ templateKey: t.key }} className="mt-3" />}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11.5px] text-[var(--los-faint)]">Template ideas adapted from enescingoz/awesome-n8n-templates (CC BY 4.0), rebuilt for CatalystGrowthOS.</p>
    </div>
  );
}
