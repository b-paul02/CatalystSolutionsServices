"use server";

// Workflows server actions. Tenant from requireOrg(); lib/os/automation/manage
// re-checks the permission and the paid-plan entitlement for every mutation.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrg, requireOrgAction } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { WorkError } from "@/lib/os/work";
import { activateWorkflow, createWorkflow, rotateHookToken, saveKeyConnection, saveWorkflow, setWorkflowStatus } from "@/lib/os/automation/manage";
import { emitEvent } from "@/lib/os/automation/engine";
import { BLOCKS } from "@/lib/os/automation/catalog";
import { simulate, testStep, validateDefinition, type Definition, type PreviewStep, type StepTest } from "@/lib/os/automation/definition";

type State = { error?: string; ok?: string };
const fail = (e: unknown): State => { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return { error: e.message }; throw e; };
const str = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

export async function newWorkflow(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  let id: string;
  try { id = (await createWorkflow(actor, { name: str(form, "name", 120), templateKey: str(form, "templateKey", 10) || undefined })).id; } catch (e) { return fail(e); }
  redirect(`/app/workflows/${id}`);
}

/** Called by the builder (not a form): returns validation problems so the canvas can show them. */
export async function saveCanvas(id: string, name: string, definition: Definition): Promise<{ error?: string; problems?: string[]; deactivated?: boolean }> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  try {
    const r = await saveWorkflow(actor, id, { name, definition });
    revalidatePath(`/app/workflows/${id}`);
    return { problems: r.problems, deactivated: r.deactivated };
  } catch (e) { return fail(e); }
}

/** Path preview: evaluates the SAVED-or-unsaved canvas against sample data. Runs nothing. */
export async function previewCanvas(definition: Definition, sampleJson: string): Promise<{ error?: string; steps?: PreviewStep[]; skipped?: string[]; problems?: string[] }> {
  const actor = await requireOrgAction("work.view"); if ("error" in actor) return actor;
  let sample: unknown = {};
  try { sample = sampleJson.trim() ? JSON.parse(sampleJson) : {}; } catch { return { error: "Sample data must be valid JSON." }; }
  const problems = validateDefinition(definition, BLOCKS);
  return { ...simulate(definition, BLOCKS, sample), problems };
}

/** WP-18 · "Test this step": simulate mode — conditions evaluate, everything else returns its output shape. Runs nothing. */
export async function testStepAction(node: Definition["nodes"][number], sampleJson: string): Promise<{ error?: string; test?: StepTest }> {
  const actor = await requireOrgAction("work.view"); if ("error" in actor) return actor;
  let sample: { trigger?: unknown; steps?: Record<string, unknown> } = {};
  try { const raw = sampleJson.trim() ? JSON.parse(sampleJson) : {}; sample = raw && typeof raw === "object" && ("trigger" in raw || "steps" in raw) ? raw : { trigger: raw }; } catch { return { error: "Sample data must be valid JSON." }; }
  try { return { test: testStep(node, BLOCKS, sample) }; } catch (e) { return { error: e instanceof Error ? e.message : "Could not test this step." }; }
}

export async function workflowStatus(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  const id = str(form, "id", 60), op = str(form, "op", 12);
  try {
    if (op === "activate") await activateWorkflow(actor, id);
    else if (op === "pause" || op === "archive") await setWorkflowStatus(actor, id, op === "pause" ? "paused" : "archived");
    else return { error: "Unknown action." };
  } catch (e) { return fail(e); }
  revalidatePath("/app/workflows", "layout");
  if (op === "archive") redirect("/app/workflows");
  return { ok: op === "activate" ? "Workflow is live." : "Paused — it will not run until activated again." };
}

export async function runNow(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  const id = str(form, "id", 60);
  const wf = await db.cosWorkflow.findFirst({ where: { id, orgId: actor.orgId, status: "active" } });
  if (!wf) return { error: "Activate the workflow first." };
  if (wf.triggerType !== "trigger.manual" && wf.triggerType !== "trigger.schedule") return { error: "Run now works for manual and scheduled workflows. Others start from their trigger." };
  const runs = await emitEvent(actor.orgId, wf.triggerType, { date: new Date().toISOString().slice(0, 10), startedBy: actor.userId }, { onlyWorkflowId: id });
  revalidatePath(`/app/workflows/${id}`);
  return runs.length ? { ok: "Run finished — see the run log." } : { error: "The run did not start (kill switch on, or daily limit reached)." };
}

export async function newHookAddress(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  try {
    const token = await rotateHookToken(actor, str(form, "id", 60));
    const origin = (process.env.LEADOS_APP_URL ?? "http://localhost:3000/app").replace(/\/app$/, "");
    return { ok: `${origin}/api/os/hooks/${token}` }; // shown once — only a hash is stored
  } catch (e) { return fail(e); }
}

export async function connectKey(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  try {
    const conn = await saveKeyConnection(actor, str(form, "provider", 20), String(form.get("secret") ?? ""));
    revalidatePath("/app/settings/connections");
    return { ok: `Connected${conn.accountLabel ? ` — ${conn.accountLabel}` : ""}.` };
  } catch (e) { revalidatePath("/app/settings/connections"); return fail(e); }
}

export async function disconnectKey(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  if (!can(actor.role, "automations.manage")) return { error: "Forbidden." };
  await db.cosConnection.updateMany({ where: { orgId: actor.orgId, provider: str(form, "provider", 20) }, data: { status: "disconnected", accessTokenEnc: null, lastError: null, lastCheckedAt: new Date() } });
  revalidatePath("/app/settings/connections");
  return { ok: "Disconnected — the stored key was destroyed." };
}
