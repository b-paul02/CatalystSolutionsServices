import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { BLOCKS } from "@/lib/os/automation/catalog";
import type { Definition } from "@/lib/os/automation/definition";
import { Badge, Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { Empty, SectionTitle } from "@/components/os/bits";
import Builder from "./Builder";
import { newHookAddress, runNow, workflowStatus } from "../actions";

export const metadata = { title: "Workflow" };

const SAMPLES: Record<string, string> = {
  "trigger.lead_created": '{"lead":{"firstName":"Asha","lastName":"Rao","city":"Pune"},"source":"form"}',
  "trigger.lead_stage_changed": '{"lead":{"firstName":"Asha"},"from":"new","to":"converted"}',
  "trigger.form_submitted": '{"lead":{"firstName":"Asha"},"message":"I would like a quote"}',
  "trigger.webhook": '{"body":{"status":"paid","amount":"$2,500","customer_name":"Acme"}}',
  "trigger.work_item_state": '{"title":"Homepage design","from":"internal_qa","to":"client_review"}',
  "trigger.approval_decided": '{"title":"Homepage design","decision":"approved"}',
  "trigger.schedule": '{"date":"2026-09-21"}',
};
const RUN_TONE = { succeeded: "success", failed: "danger", blocked: "warn", waiting: "brand", running: "brand", queued: "neutral" } as const;

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireModule("automations", "work.view");
  const { id } = await params;
  const wf = await db.cosWorkflow.findFirst({ where: { id, orgId: actor.orgId, status: { not: "archived" } } });
  if (!wf) notFound();
  const runs = await db.cosWorkflowRun.findMany({ where: { workflowId: wf.id, orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 12, include: { steps: { orderBy: { createdAt: "asc" } } } });
  const def = JSON.parse(wf.definition) as Definition;
  const manage = can(actor.role, "automations.manage"), activate = can(actor.role, "automations.activate");
  const external = def.nodes.filter((n) => BLOCKS[n.type]?.external).length, contacts = def.nodes.filter((n) => BLOCKS[n.type]?.contacts).length;

  return (
    <div className="max-w-[1320px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link href="/app/workflows" className="text-[12.5px] text-[var(--los-muted)] hover:underline">← Workflows</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={wf.status === "active" ? "success" : wf.status === "draft" ? "warn" : "neutral"}>{wf.status === "active" ? `Active · v${wf.version}` : wf.status === "draft" ? "Draft · not active" : "Paused"}</Badge>
          {wf.status === "active" && manage && (wf.triggerType === "trigger.manual" || wf.triggerType === "trigger.schedule") && <ActionForm action={runNow} submit="Run now" tone="ghost" hidden={{ id }} />}
          {wf.status !== "active" && activate && <ActionForm action={workflowStatus} submit="Activate" hidden={{ id, op: "activate" }} confirm={`Turn this workflow on?${contacts ? ` It can message leads (${contacts} step${contacts > 1 ? "s" : ""}) — consent is checked on every send.` : ""}${external ? ` It sends data to outside tools (${external} step${external > 1 ? "s" : ""}).` : ""}`} />}
          {wf.status !== "active" && !activate && manage && <span className="text-[12px] text-[var(--los-faint)]">A workspace owner or admin activates it.</span>}
          {wf.status === "active" && manage && <ActionForm action={workflowStatus} submit="Pause" tone="ghost" hidden={{ id, op: "pause" }} />}
          {manage && <ActionForm action={workflowStatus} submit="Delete" tone="danger" hidden={{ id, op: "archive" }} confirm="Delete this workflow? Its run history is kept for audit." />}
        </div>
      </div>

      <Builder id={wf.id} initialName={wf.name} initial={def} canEdit={manage} sampleHint={SAMPLES[wf.triggerType ?? ""] ?? "{}"} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {wf.triggerType === "trigger.webhook" && manage && (
          <Card className="p-4 text-[13px]">
            <div className="mb-1 text-[15px] font-bold">Webhook address</div>
            <p className="mb-2 text-[12.5px] text-[var(--los-muted)]">{wf.hookTokenHash ? "An address exists. For security it is shown only once — generating a new one retires the old one." : "Generate the address outside tools should send data to (POST, JSON)."}</p>
            <ActionForm action={newHookAddress} submit={wf.hookTokenHash ? "Generate a new address" : "Generate address"} tone="ghost" hidden={{ id }} confirm={wf.hookTokenHash ? "The current address will stop working. Continue?" : undefined} />
          </Card>
        )}
        <Card className={wf.triggerType === "trigger.webhook" && manage ? "lg:col-span-2" : "lg:col-span-3"}>
          <SectionTitle>Run log</SectionTitle>
          <ul className="divide-y divide-[var(--los-line)]">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-2.5 text-[13px]">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · v{r.workflowVersion} · {r.steps.length} steps{r.resumeAt ? ` · resumes ${r.resumeAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}</span>
                    <Badge tone={RUN_TONE[r.status as keyof typeof RUN_TONE] ?? "neutral"}>{r.status}</Badge>
                  </summary>
                  <ol className="ml-4 mt-2 list-decimal space-y-0.5 text-[12.5px] text-[var(--los-muted)]">
                    {r.steps.map((s) => (
                      <li key={s.id}><b className="text-[var(--los-fg)]">{BLOCKS[s.blockType]?.label ?? s.blockType}</b> — {s.status}{s.summary ? `: ${s.summary}` : ""}{s.ms ? ` (${s.ms} ms)` : ""}
                        {(s.input || s.output) && <details className="mt-0.5"><summary className="cursor-pointer text-[11.5px]">input / output</summary>{s.input && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--los-surface-2)] p-1.5 font-mono text-[11px]">in: {s.input}</pre>}{s.output && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--los-surface-2)] p-1.5 font-mono text-[11px]">out: {s.output}</pre>}</details>}
                      </li>
                    ))}
                  </ol>
                  {r.error && <p className="mt-1 text-[12.5px] text-[var(--los-danger)]">{r.error}</p>}
                </details>
              </li>
            ))}
            {runs.length === 0 && <Empty>No runs yet.</Empty>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
