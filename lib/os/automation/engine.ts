// Workflow engine. emitEvent() → one run per (workflow, event) → steps execute
// in order, each logged append-only. Only the ACTIVATED definition runs (hash
// match), the kill switch stops everything, waits suspend the run and resume
// through the job queue, and workflow-caused events stop cascading at MAX_DEPTH.
import { createHash } from "node:crypto";
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { BLOCKS } from "./catalog";
import { BlockedError, RUNNERS, type RunEnv } from "./blocks";
import {
  evaluateCondition, MAX_DEPTH, MAX_STEPS_PER_RUN, nextNode, redact, render, triggerOf, waitMs,
  type Definition, type Node,
} from "./definition";
import { definitionHash } from "./hash";

const DAILY_RUN_CAP = 2000; // per workspace — ponytail: make it a tier allowance when pricing lands
export const RESUME_JOB = "os.workflow_resume";

type Ctx = { trigger: Record<string, unknown>; steps: Record<string, unknown>; leadId?: string | null };

const parseDef = (s: string): Definition => { try { return JSON.parse(s) as Definition; } catch { return { nodes: [], edges: [] }; } };

/** Trigger-level filter, e.g. "only when moved to converted". */
function triggerMatches(node: Node, payload: Record<string, unknown>): boolean {
  const want = (node.config?.toStage ?? node.config?.toState ?? "").trim().toLowerCase();
  if (!want) return true;
  return String(payload.to ?? "").toLowerCase() === want;
}

/**
 * Fire an event for a workspace. Safe to call from any write path: it never
 * throws into the caller, and the same eventKey never produces a second run.
 */
export async function emitEvent(
  orgId: string,
  triggerType: string,
  payload: Record<string, unknown>,
  opts: { eventKey?: string; depth?: number; onlyWorkflowId?: string } = {},
): Promise<string[]> {
  try {
    const depth = opts.depth ?? 0;
    if (depth >= MAX_DEPTH) return []; // loop guard
    const workflows = await db.cosWorkflow.findMany({
      where: { orgId, status: "active", triggerType, ...(opts.onlyWorkflowId ? { id: opts.onlyWorkflowId } : {}) },
    });
    if (workflows.length === 0) return [];
    const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { killSwitch: true } });
    if (ws?.killSwitch) return [];
    const since = new Date(Date.now() - 86_400_000);
    if ((await db.cosWorkflowRun.count({ where: { orgId, createdAt: { gt: since } } })) >= DAILY_RUN_CAP) return [];
    const eventKey = opts.eventKey ?? createHash("sha256").update(`${triggerType}:${JSON.stringify(payload)}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32);
    const started: string[] = [];
    for (const wf of workflows) {
      const def = parseDef(wf.definition);
      // an edited-but-not-reactivated workflow must never run
      if (!wf.activeHash || definitionHash(def) !== wf.activeHash) continue;
      const trigger = triggerOf(def, BLOCKS);
      if (!trigger || !triggerMatches(trigger, payload)) continue;
      const leadId = typeof payload.leadId === "string" ? payload.leadId : null;
      const lead = leadId ? await db.losLead.findFirst({ where: { id: leadId, orgId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, city: true, status: true, source: true, leadType: true } }) : null;
      const ctx: Ctx = { trigger: { ...payload, lead }, steps: {}, leadId: lead?.id ?? null };
      let run;
      try {
        run = await db.cosWorkflowRun.create({ data: { orgId, workflowId: wf.id, workflowVersion: wf.version, eventKey, trigger: triggerType, depth, status: "queued", context: JSON.stringify(ctx), cursor: trigger.id } });
      } catch { continue; } // unique (workflowId, eventKey) → this event already ran
      started.push(run.id);
      await executeRun(run.id).catch(() => {});
    }
    return started;
  } catch {
    return []; // an automation problem must never break the write that caused it
  }
}

const clip = (v: unknown): string | null => { if (v === undefined) return null; try { return redact(JSON.stringify(v)).slice(0, 2000); } catch { return null; } };
async function logStep(orgId: string, runId: string, node: Node, status: string, summary: string, ms?: number, io: { input?: unknown; output?: unknown } = {}) {
  await db.cosWorkflowStepLog.create({ data: { orgId, runId, nodeId: node.id, blockType: node.type, status, summary: redact(summary), ms: ms ?? null, input: clip(io.input), output: clip(io.output) } });
}

/** Execute (or resume) a run from its cursor until it finishes, waits or is stopped. */
export async function executeRun(runId: string): Promise<void> {
  // claim: only one executor may hold a run (queued → running, or a due wait → running)
  const claimed = await db.cosWorkflowRun.updateMany({ where: { id: runId, OR: [{ status: "queued" }, { status: "waiting", resumeAt: { lte: new Date() } }] }, data: { status: "running", resumeAt: null } });
  if (claimed.count !== 1) return;
  const run = await db.cosWorkflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
  const wf = run.workflow;
  const def = parseDef(wf.definition);
  const finish = (status: string, error?: string) => db.cosWorkflowRun.update({ where: { id: runId }, data: { status, error: error ? redact(error) : null, finishedAt: new Date(), cursor: null } });

  // the workflow may have been edited or paused while this run was waiting
  if (wf.status !== "active" || definitionHash(def) !== wf.activeHash) { await finish("blocked", "Workflow was paused or edited before this run finished."); return; }

  const ctx = JSON.parse(run.context) as Ctx;
  let state: Record<string, unknown> = wf.state ? (JSON.parse(wf.state) as Record<string, unknown>) : {};
  const env: RunEnv = {
    orgId: run.orgId, workflowId: wf.id, actorId: wf.activatedById ?? wf.createdById ?? "system", depth: run.depth, demo: wf.demo,
    get leadId() { return ctx.leadId ?? null; },
    setLeadId: (id) => { ctx.leadId = id; },
    getState: () => state,
    setState: async (patch) => { state = { ...state, ...patch }; await db.cosWorkflow.update({ where: { id: wf.id }, data: { state: JSON.stringify(state) } }); },
  };

  let node: Node | undefined = def.nodes.find((n) => n.id === run.cursor);
  let steps = run.stepCount;
  // a fresh run starts ON the trigger: log it and move past it
  if (node && BLOCKS[node.type]?.kind === "trigger") { await logStep(run.orgId, runId, node, "ok", BLOCKS[node.type].describe(node.config ?? {})); node = nextNode(def, node.id); }

  while (node) {
    if (++steps > MAX_STEPS_PER_RUN) { await finish("failed", "Step limit reached."); return; }
    const ws = await db.cosWorkspace.findUnique({ where: { orgId: run.orgId }, select: { killSwitch: true } });
    if (ws?.killSwitch) { await logStep(run.orgId, runId, node, "blocked", "Kill switch is on."); await finish("blocked", "Kill switch is on."); return; }
    const meta = BLOCKS[node.type];
    if (!meta) { await finish("failed", `Unknown step ${node.type}.`); return; }
    const cfg = Object.fromEntries(Object.entries(node.config ?? {}).map(([k, v]) => [k, render(v, ctx)]));

    if (meta.kind === "condition") {
      const yes = evaluateCondition(node.config ?? {}, ctx);
      await logStep(run.orgId, runId, node, "ok", `${meta.describe(cfg)} → ${yes ? "Yes" : "No"}`, undefined, { input: cfg, output: { result: yes } });
      node = nextNode(def, node.id, yes ? "true" : "false");
      continue;
    }
    if (meta.kind === "wait") {
      const next = nextNode(def, node.id);
      const resumeAt = new Date(Date.now() + waitMs(cfg));
      await logStep(run.orgId, runId, node, "waiting", `${meta.describe(cfg)} (until ${resumeAt.toISOString().slice(0, 16)}Z)`);
      if (!next) { await finish("succeeded"); return; }
      await db.cosWorkflowRun.update({ where: { id: runId }, data: { status: "waiting", cursor: next.id, resumeAt, stepCount: steps, context: JSON.stringify(ctx) } });
      await enqueueJob({ type: RESUME_JOB, payload: { runId }, runAt: resumeAt, idempotencyKey: `${RESUME_JOB}:${runId}:${next.id}` });
      return;
    }

    const runner = RUNNERS[node.type];
    const t0 = Date.now();
    try {
      if (!runner) throw new Error(`No runner for ${node.type}.`);
      const output = await runner(cfg, env);
      ctx.steps[node.id] = output;
      await logStep(run.orgId, runId, node, "ok", meta.describe(cfg), Date.now() - t0, { input: cfg, output });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Step failed.";
      const blocked = e instanceof BlockedError;
      await logStep(run.orgId, runId, node, blocked ? "blocked" : "failed", message, Date.now() - t0, { input: cfg });
      // a policy block (no consent, suppressed…) stops this path; it is not an error to retry
      await finish(blocked ? "blocked" : "failed", message);
      return;
    }
    node = nextNode(def, node.id);
    await db.cosWorkflowRun.update({ where: { id: runId }, data: { stepCount: steps, context: JSON.stringify(ctx), cursor: node?.id ?? null } });
  }
  await finish("succeeded");
}

/**
 * Fire-and-continue for request paths: runs after the response is sent (Next's
 * after()), so a slow workflow never delays a form submission. Outside a
 * request (tests, jobs) it simply awaits.
 */
export async function dispatchEvent(orgId: string, triggerType: string, payload: Record<string, unknown>, eventKey?: string): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(() => emitEvent(orgId, triggerType, payload, { eventKey }).then(() => undefined));
  } catch {
    await emitEvent(orgId, triggerType, payload, { eventKey });
  }
}

registerJobHandler(RESUME_JOB, async (payload) => { await executeRun((payload as { runId: string }).runId); });

/** Cron tick: fire schedule triggers (idempotent per day) and resume any overdue waits. */
export async function tickWorkflows(now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const scheduled = await db.cosWorkflow.findMany({ where: { status: "active", triggerType: "trigger.schedule" }, select: { id: true, orgId: true, definition: true } });
  for (const wf of scheduled) {
    const trigger = triggerOf(parseDef(wf.definition), BLOCKS);
    if (trigger?.config?.frequency === "weekly" && now.getUTCDay() !== 1) continue;
    await emitEvent(wf.orgId, "trigger.schedule", { date: day }, { eventKey: `schedule:${day}`, onlyWorkflowId: wf.id });
  }
  const overdue = await db.cosWorkflowRun.findMany({ where: { status: "waiting", resumeAt: { lte: now } }, select: { id: true }, take: 100 });
  for (const r of overdue) await executeRun(r.id).catch(() => {});
}
