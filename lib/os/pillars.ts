// The five growth pillars. Every flow ends with a measurable step toward one of them (growth rule, 2026-09-27):
// the last screen names the pillar, the metric that will show it on Results, and ONE real button that creates or
// advances a CosGoal or a CosWorkItem in that pillar. Nothing here predicts an outcome — it says what will be measured.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { createWorkItem, WorkError, type WorkActor } from "./work";

export const PILLARS5 = ["market_intelligence", "client_acquisition", "digital_visibility", "digital_presence", "business_operations"] as const;
export type Pillar = (typeof PILLARS5)[number];
export const isPillar = (p: string): p is Pillar => (PILLARS5 as readonly string[]).includes(p);

export const PILLAR_LABEL: Record<Pillar, string> = {
  market_intelligence: "Market intelligence",
  client_acquisition: "Client acquisition",
  digital_visibility: "Digital visibility",
  digital_presence: "Digital presence",
  business_operations: "Business operations",
};

/** Audit / scorecard categories (lib/os/audit.ts PILLARS) → growth pillar. */
export const AUDIT_CATEGORY_PILLAR: Record<string, Pillar> = {
  visibility: "digital_visibility", content: "digital_visibility", ai: "digital_visibility",
  conversion: "client_acquisition", analytics: "business_operations", speed: "digital_presence", narrative: "market_intelligence",
};

/** What the button does. Exactly one of goal / work. Validated server-side: the browser cannot invent a pillar or a metric. */
export type GrowthStep = {
  pillar: Pillar;
  /** metric key on Results (METRICS or scorecard.* / audit.* / booking.* …) */
  metric: string;
  metricLabel: string;
  /** what the client sees as the one next action */
  action: { label: string } & ({ kind: "goal"; title: string; unit?: string; target?: number; horizon?: string } | { kind: "work_item"; title: string; type?: "task" | "content" | "experiment"; serviceSlug?: string | null; payload?: Record<string, unknown>; workItemId?: string; to?: string });
};

const MAX = { title: 140, metric: 80, label: 80 };

/** Shape check on a step that arrived from a form. Throws on anything the enum / limits do not allow. */
export function parseGrowthStep(raw: string): GrowthStep {
  let o: GrowthStep;
  try { o = JSON.parse(raw) as GrowthStep; } catch { throw new WorkError("Growth step is malformed."); }
  if (!o || !isPillar(o.pillar) || typeof o.metric !== "string" || !o.metric || o.metric.length > MAX.metric) throw new WorkError("Growth step is malformed.");
  if (!o.action || typeof o.action.label !== "string" || typeof o.action.title !== "string" || !o.action.title.trim() || o.action.title.length > MAX.title) throw new WorkError("Growth step is malformed.");
  if (o.action.kind !== "goal" && o.action.kind !== "work_item") throw new WorkError("Growth step is malformed.");
  return { pillar: o.pillar, metric: o.metric, metricLabel: String(o.metricLabel ?? o.metric).slice(0, MAX.label), action: o.action };
}

export type Advanced = { kind: "goal" | "work_item"; id: string; href: string; created: boolean };

/**
 * Run the step. A goal lands as a DRAFT (agreedAt null) unless the actor may manage strategy; a work item goes through
 * createWorkItem (scope rule, change requests, read-only workspaces all apply). Idempotent per (org, pillar, metric, title):
 * pressing the button twice advances the same record.
 */
export async function advancePillar(actor: WorkActor, step: GrowthStep): Promise<Advanced> {
  const a = step.action;
  if (a.kind === "goal") {
    if (!can(actor.role, "strategy.manage") && !can(actor.role, "approvals.decide") && !can(actor.role, "work.request")) throw new WorkError("Forbidden.");
    const ws = await db.cosWorkspace.findUnique({ where: { orgId: actor.orgId }, select: { accessMode: true, demo: true } });
    if (ws && ws.accessMode !== "active") throw new WorkError("This workspace is in handover (read-only). History and exports remain available.");
    const existing = await db.cosGoal.findFirst({ where: { orgId: actor.orgId, pillar: step.pillar, metric: step.metric, archivedAt: null } });
    if (existing) return { kind: "goal", id: existing.id, href: "/app/strategy", created: false };
    const agreed = can(actor.role, "approvals.decide") || can(actor.role, "strategy.manage");
    const goal = await db.cosGoal.create({ data: { orgId: actor.orgId, pillar: step.pillar, metric: step.metric, target: a.target ?? 1, unit: a.unit ?? "count", horizon: a.horizon ?? "90 days", definition: a.title.slice(0, 500), agreedAt: agreed ? new Date() : null, agreedById: agreed ? actor.userId : null } });
    await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "goal.created", entity: "CosGoal", entityId: goal.id, data: { pillar: step.pillar, viaGrowthStep: true } });
    return { kind: "goal", id: goal.id, href: "/app/strategy", created: true };
  }
  if (a.workItemId) {
    // advance an existing item: only its state, through the engine
    const { transitionWorkItem } = await import("./work");
    await transitionWorkItem(actor, a.workItemId, a.to ?? "ready");
    return { kind: "work_item", id: a.workItemId, href: `/app/work/${a.workItemId}`, created: false };
  }
  const title = a.title.trim();
  const existing = await db.cosWorkItem.findFirst({ where: { orgId: actor.orgId, title, state: { notIn: ["closed", "cancelled"] }, payload: { contains: `"pillar":"${step.pillar}"` } }, select: { id: true } });
  if (existing) return { kind: "work_item", id: existing.id, href: `/app/work/${existing.id}`, created: false };
  const isRequest = !can(actor.role, "work.manage");
  const item = await createWorkItem(actor, { title, type: isRequest ? "change_request" : a.type ?? "task", serviceSlug: a.serviceSlug ?? null, payload: { ...(a.payload ?? {}), pillar: step.pillar, metric: step.metric }, measure: step.metricLabel });
  return { kind: "work_item", id: item.id, href: `/app/work/${item.id}`, created: true };
}

/** Pillar tiles for the dashboard: current goal, latest metric value with its date, next action. Absent stays absent. */
export async function pillarTiles(orgId: string, includeDemo: boolean) {
  const [goals, snaps, open] = await Promise.all([
    db.cosGoal.findMany({ where: { orgId, archivedAt: null, pillar: { not: null } }, orderBy: { createdAt: "desc" } }),
    db.cosMetricSnapshot.findMany({ where: { orgId, ...(includeDemo ? {} : { demo: false }) }, orderBy: { periodStart: "desc" }, take: 400, select: { metric: true, value: true, periodStart: true, kind: true } }),
    db.cosWorkItem.findMany({ where: { orgId, state: { notIn: ["closed", "cancelled"] }, payload: { contains: '"pillar":"' } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, payload: true, state: true } }),
  ]);
  const { METRICS } = await import("./metrics");
  return PILLARS5.map((pillar) => {
    const goal = goals.find((g) => g.pillar === pillar) ?? null;
    const metricKeys = goal ? [goal.metric] : Object.entries(METRICS).filter(([, d]) => d.pillar === pillar).map(([k]) => k);
    const latest = snaps.find((s) => metricKeys.includes(s.metric)) ?? null;
    const next = open.find((w) => { try { return (JSON.parse(w.payload ?? "{}") as { pillar?: string }).pillar === pillar; } catch { return false; } }) ?? null;
    return { pillar, label: PILLAR_LABEL[pillar], goal, latest: latest ? { metric: latest.metric, value: latest.value, at: latest.periodStart } : null, next };
  });
}
