// Growth Work Item + approval engine (blueprint §9). Every function takes an
// already-authorized actor (orgId from requireOrg membership rows — never from
// client input) and re-checks the specific capability itself. Events are
// append-only; approvals bind to a content hash so stale sign-off can't ship.
import { db } from "@/lib/audit/db";
import { can, isStaffRole, type Permission } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { canDecideApproval, canTransition, contentHash, type Capability } from "./workflow";
import { gateWithFlags } from "./flags";
import { serviceBySlug } from "./catalog";
import { entitlements } from "./entitlements";
import { templateFor } from "./templates";
import { notify } from "./notify";

export type WorkActor = { orgId: string; userId: string; role: string };

export class WorkError extends Error {}

const CAP_PERMISSION: Record<Exclude<Capability, "approval" | "system">, Permission> = {
  manage: "work.manage",
  execute: "work.execute",
  review: "work.review",
};

const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

const approvableText = (payload: string | null): string => {
  const p = parse<Record<string, unknown>>(payload, {});
  delete p.checklist;
  return JSON.stringify(p);
};

/** Handover / revoked workspaces keep their history but accept no new work, decisions or publishing. */
export async function assertWritable(orgId: string) {
  const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { accessMode: true } });
  if (ws && ws.accessMode !== "active") throw new WorkError("This workspace is in handover (read-only). History and exports remain available.");
}

/** Persistent snapshot of an approvable version — what "compare revisions" and approval evidence read. */
export async function snapshotRevision(orgId: string, subject: "work_item" | "variant" | "campaign", subjectId: string, version: number, hash: string, snapshot: unknown, userId: string | null) {
  await db.cosRevision.upsert({
    where: { subject_subjectId_version: { subject, subjectId, version } }, update: {},
    create: { orgId, subject, subjectId, version, contentHash: hash, snapshot: JSON.stringify(snapshot), createdById: userId },
  });
}

/** Hash excludes the QA checklist so ticking boxes never voids a sign-off. */
export const itemHash = (title: string, payload: string | null) => contentHash(title, approvableText(payload));

/** Load an item inside the actor's tenant; freelancers only reach assigned items. */
export async function getWorkItem(actor: WorkActor, id: string) {
  const item = await db.cosWorkItem.findFirst({ where: { id, orgId: actor.orgId } });
  if (!item) throw new WorkError("Work item not found.");
  if (!can(actor.role, "work.view") && item.assigneeId !== actor.userId) throw new WorkError("Work item not found.");
  return item;
}

export type NewWorkItem = {
  title: string;
  type?: string;
  serviceSlug?: string | null;
  parentId?: string | null;
  findingId?: string | null;
  planId?: string | null;
  templateKey?: string | null;
  priority?: number;
  riskTier?: number;
  clientReviewRequired?: boolean;
  assigneeId?: string | null;
  dueAt?: Date | null;
  scheduledAt?: Date | null;
  decision?: unknown;
  commercial?: Record<string, unknown>;
  payload?: unknown;
  demo?: boolean;
  // v2 chain links — each is verified to belong to the actor's org
  engagementId?: string | null;
  goalId?: string | null;
  campaignId?: string | null;
  cycleId?: string | null;
  responsibility?: "catalyst" | "client" | "shared";
  assignRole?: string | null;
  acceptanceCriteria?: string | null;
  measure?: string | null;
  /** A client saving their own AI Studio output as a content DRAFT (needs ai.use, never work.manage). Must be in scope — no silent change request. */
  studioDraft?: boolean;
};

/**
 * Create a work item. Scope rule (E04): a service outside the active contracts
 * becomes a change_request with inScope=false — it cannot reach "ready" until
 * the client approves the change. Recommendations never silently become billable.
 */
export async function createWorkItem(actor: WorkActor, input: NewWorkItem) {
  const isRequest = input.type === "change_request";
  const studioDraft = input.studioDraft === true && input.type === "content";
  if (!can(actor.role, isRequest ? "work.request" : studioDraft ? "ai.use" : "work.manage")) throw new WorkError("Forbidden.");
  const title = input.title.trim();
  if (!title) throw new WorkError("Title is required.");
  const ent = await entitlements(actor.orgId);
  if (ent.accessMode !== "active") throw new WorkError("This workspace is in handover (read-only). History and exports remain available.");
  const inScope = !isRequest && (!input.serviceSlug || ent.services.has(input.serviceSlug));
  if (studioDraft && !inScope) throw new WorkError("Content is not part of this workspace's scope, so the draft stays in your AI Studio history. Ask Catalyst about adding it.");
  const type = inScope ? input.type ?? "task" : "change_request";
  const payload = json(input.payload);
  // chain links must live in THIS org (ids come from forms)
  const [eng, goal, camp] = await Promise.all([
    input.engagementId ? db.cosEngagement.findFirst({ where: { id: input.engagementId, orgId: actor.orgId }, select: { id: true } }) : null,
    input.goalId ? db.cosGoal.findFirst({ where: { id: input.goalId, orgId: actor.orgId }, select: { id: true, engagementId: true } }) : null,
    input.campaignId ? db.cosCampaign.findFirst({ where: { id: input.campaignId, orgId: actor.orgId }, select: { id: true, engagementId: true, goalId: true } }) : null,
  ]);
  if ((input.engagementId && !eng) || (input.goalId && !goal) || (input.campaignId && !camp)) throw new WorkError("Linked engagement, goal or campaign not found.");
  const contractId = inScope ? ent.contractForService(input.serviceSlug ?? null) : null;
  const engagementId = eng?.id ?? camp?.engagementId ?? goal?.engagementId ?? (contractId ? (await db.cosContract.findUnique({ where: { id: contractId }, select: { engagementId: true } }))?.engagementId ?? null : null) ?? ent.defaultEngagementId;
  const item = await db.cosWorkItem.create({
    data: {
      orgId: actor.orgId,
      title,
      type,
      serviceSlug: input.serviceSlug ?? null,
      studio: input.serviceSlug ? serviceBySlug[input.serviceSlug]?.studio ?? null : null,
      parentId: input.parentId ?? null,
      findingId: input.findingId ?? null,
      planId: input.planId ?? null,
      templateKey: input.templateKey ?? null,
      contractId,
      engagementId, goalId: goal?.id ?? camp?.goalId ?? null, campaignId: camp?.id ?? null, cycleId: input.cycleId ?? null,
      responsibility: input.responsibility ?? "catalyst", assignRole: input.assignRole ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null, measure: input.measure ?? null,
      priority: input.priority ?? 2,
      riskTier: input.riskTier ?? 1,
      clientReviewRequired: input.clientReviewRequired ?? true,
      ownerId: isStaffRole(actor.role) ? actor.userId : null,
      assigneeId: input.assigneeId ?? null,
      dueAt: input.dueAt ?? null,
      scheduledAt: input.scheduledAt ?? null,
      decision: json(input.decision),
      commercial: json({ ...(input.commercial ?? {}), inScope }),
      payload,
      contentHash: itemHash(title, payload),
      createdById: actor.userId,
      demo: input.demo ?? ent.demo,
    },
  });
  await Promise.all([
    db.cosWorkEvent.create({
      data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "transition", toState: "backlog", data: json({ created: true, type, inScope }) },
    }),
    logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "work.created", entity: "CosWorkItem", entityId: item.id, data: { type, inScope, serviceSlug: item.serviceSlug } }),
    snapshotRevision(actor.orgId, "work_item", item.id, 1, item.contentHash ?? "", { title, payload: parse(payload, null) }, actor.userId),
  ]);
  return item;
}

/** Instantiate a service's delivery template: one project + a milestone per gate. */
export async function instantiateProject(actor: WorkActor, serviceSlug: string, title: string, demo = false, links: { engagementId?: string | null; goalId?: string | null; campaignId?: string | null } = {}) {
  const svc = serviceBySlug[serviceSlug];
  if (!svc) throw new WorkError("Unknown service.");
  const tpl = templateFor(serviceSlug);
  const project = await createWorkItem(actor, {
    title, type: "project", serviceSlug, templateKey: serviceSlug, clientReviewRequired: false, demo, ...links,
    acceptanceCriteria: tpl ? `Deliverables: ${tpl.deliverables.join("; ")}` : null, measure: tpl?.measures.map((x) => x.label).join("; ") ?? null,
    payload: { checklist: svc.qa.map((c) => ({ ...c, done: false })) },
  });
  // out of scope → it is a change request; milestones are created once it is approved
  if (project.type !== "project") return project;
  // batched (Neon RTT): one insert for the milestones, one for their creation events
  const milestones = await db.cosWorkItem.createManyAndReturn({
    data: svc.milestones.map((ms) => ({
      orgId: actor.orgId, title: ms.title, type: "milestone", serviceSlug, studio: svc.studio, parentId: project.id,
      templateKey: `${serviceSlug}.${ms.key}`, contractId: project.contractId, riskTier: ms.riskTier, clientReviewRequired: ms.clientReview,
      ownerId: actor.userId, commercial: JSON.stringify({ inScope: true }), contentHash: itemHash(ms.title, null), createdById: actor.userId, demo,
      engagementId: project.engagementId, goalId: project.goalId, campaignId: project.campaignId,
      assignRole: tpl?.milestones[ms.key]?.role ?? null, acceptanceCriteria: tpl?.milestones[ms.key]?.acceptance ?? null,
      responsibility: tpl?.milestones[ms.key]?.responsibility ?? "catalyst",
    })),
    select: { id: true, templateKey: true },
  });
  // explicit dependencies: milestone → earlier milestones, and → the engagement's intake items
  if (tpl) {
    const byKey = new Map(milestones.map((x) => [x.templateKey!.slice(serviceSlug.length + 1), x.id]));
    const checklist = project.engagementId ? await db.cosChecklistItem.findMany({ where: { orgId: actor.orgId, engagementId: project.engagementId }, select: { id: true, key: true } }) : [];
    const ck = new Map(checklist.map((c) => [c.key, c.id]));
    const deps = Object.entries(tpl.milestones).flatMap(([key, spec]) => {
      const workItemId = byKey.get(key);
      if (!workItemId) return [];
      return [
        ...(spec.after ?? []).map((a) => ({ orgId: actor.orgId, workItemId, onWorkItemId: byKey.get(a) ?? null, onChecklistId: null as string | null })).filter((d) => d.onWorkItemId),
        ...(spec.needs ?? []).map((n) => ({ orgId: actor.orgId, workItemId, onWorkItemId: null as string | null, onChecklistId: ck.get(n) ?? ck.get(`${serviceSlug}.${n}`) ?? null })).filter((d) => d.onChecklistId),
      ];
    });
    if (deps.length) await db.cosDependency.createMany({ data: deps });
  }
  await db.cosWorkEvent.createMany({
    data: milestones.map((ms) => ({ orgId: actor.orgId, workItemId: ms.id, actorId: actor.userId, actorType: "user", kind: "transition", toState: "backlog", data: json({ created: true, type: "milestone", inScope: true }) })),
  });
  return project;
}

/** Latest approval for the item's CURRENT version, if any. */
async function currentApproval(itemId: string, version: number) {
  return db.cosApproval.findFirst({ where: { workItemId: itemId, subject: "work_item", version }, orderBy: { createdAt: "desc" } });
}

export async function transitionWorkItem(actor: WorkActor, id: string, to: string, note?: string) {
  const item = await getWorkItem(actor, id);
  const check = canTransition(item.state, to, item);
  if (!check.ok) throw new WorkError(check.reason);
  if (check.capability === "approval" || check.capability === "system") throw new WorkError("This step happens through the approval queue.");
  if (!can(actor.role, CAP_PERMISSION[check.capability])) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);

  // Prerequisites: missing access or an unfinished predecessor blocks THIS item only.
  if (to === "in_progress" && item.state !== "blocked") {
    const { unmetDependencies } = await import("./engagement");
    const unmet = await unmetDependencies(actor.orgId, item.id);
    if (unmet.length) throw new WorkError(`Waiting on: ${unmet.map((u) => u.label).join("; ")}.`);
  }

  const commercial = parse<{ inScope?: boolean }>(item.commercial, {});
  if (item.state === "scoped" && to === "ready" && commercial.inScope === false) {
    throw new WorkError("Out of contracted scope — the client must approve this change request first.");
  }
  if (item.state === "in_progress" && to === "internal_qa" && item.type === "project") {
    const open = await db.cosWorkItem.count({ where: { parentId: item.id, state: { notIn: ["closed", "cancelled", "verified", "delivered"] } } });
    if (open > 0) throw new WorkError(`${open} milestone(s) are still open.`);
  }
  if (item.state === "internal_qa" && (to === "client_review" || to === "approved")) {
    const checklist = parse<{ checklist?: { done: boolean }[] }>(item.payload, {}).checklist ?? [];
    if (checklist.some((c) => !c.done)) throw new WorkError("Complete the QA checklist before passing review.");
    // WP-41: a failed automated QA run blocks the hand-off until it is re-run green
    const qa = parse<{ qa?: { passed: boolean; ranAt: string } }>(item.payload, {}).qa;
    if (qa && !qa.passed) throw new WorkError(`Automated QA failed on ${qa.ranAt.slice(0, 10)} — fix the issues and run it again.`);
  }
  // External action gate — checked immediately before scheduling / delivering (§9.2).
  if (item.state === "approved" || (item.state === "failed" && to === "scheduled")) {
    const [ws, approval] = await Promise.all([
      db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } }),
      currentApproval(item.id, item.version),
    ]);
    const gate = await gateWithFlags({
      feature: "publish", orgId: actor.orgId,
      tier: item.riskTier,
      killSwitch: ws?.killSwitch ?? false,
      currentHash: item.contentHash ?? "",
      approval,
      autonomyEnabled: item.riskTier === 2 && !item.clientReviewRequired,
    });
    if (!gate.allowed) {
      await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "execution", internal: true, data: json({ blocked: gate.reason, attempted: to }) } });
      throw new WorkError(gate.reason);
    }
  }

  const closing = to === "closed" || to === "cancelled";
  await db.$transaction([
    db.cosWorkItem.update({
      where: { id: item.id },
      // deliveredAt is stamped once — reports count it, never updatedAt
      data: { state: to, stateBefore: to === "blocked" ? item.state : null, closedAt: closing ? new Date() : null, ...(to === "delivered" && !item.deliveredAt ? { deliveredAt: new Date() } : {}) },
    }),
    db.cosWorkEvent.create({
      data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "transition", fromState: item.state, toState: to, data: json(note ? { note } : undefined) },
    }),
  ]);
  if (to === "client_review") await requestApproval(actor, item.id);
  if (to === "delivered" || to === "verified" || to === "closed") await import("./engagement").then(({ releaseDependents }) => releaseDependents(actor.orgId, { workItemId: item.id }));
  if (to === "blocked") await notify({ orgId: actor.orgId, audience: "staff", kind: "blocked", title: `Blocked: ${item.title}`, body: note ?? null, href: `/app/work/${item.id}`, dedupeKey: `blocked:${item.id}:${Date.now()}` });
  if (closing && item.findingId && to === "closed") {
    await db.cosFinding.updateMany({ where: { id: item.findingId, orgId: actor.orgId }, data: { statusNote: "Work delivered and closed." } });
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "work.transition", entity: "CosWorkItem", entityId: item.id, data: { from: item.state, to } });
  await import("./automation/engine").then(({ dispatchEvent }) => dispatchEvent(actor.orgId, "trigger.work_item_state", { workItemId: item.id, title: item.title, from: item.state, to })).catch(() => {});
}

/**
 * Edit title/payload. A material change bumps the version and re-hashes; any
 * live approval is revoked and an approved/scheduled item drops back to QA.
 */
export async function editWorkItem(actor: WorkActor, id: string, patch: { title?: string; payload?: unknown; dueAt?: Date | null; scheduledAt?: Date | null; assigneeId?: string | null; reviewerId?: string | null; priority?: number; commercial?: Record<string, unknown> }) {
  const item = await getWorkItem(actor, id);
  if (!can(actor.role, "work.execute") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  if (item.state === "closed" || item.state === "cancelled") throw new WorkError("Item is closed.");
  await assertWritable(actor.orgId);
  const title = patch.title?.trim() || item.title;
  const payload = patch.payload === undefined ? item.payload : json(patch.payload);
  const hash = itemHash(title, payload);
  const material = hash !== item.contentHash;
  const wasApproved = ["client_review", "approved", "scheduled"].includes(item.state);
  const managerOnly = patch.assigneeId !== undefined || patch.reviewerId !== undefined || patch.priority !== undefined || patch.commercial !== undefined;
  if (managerOnly && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  const commercial = patch.commercial
    ? json({ ...parse<Record<string, unknown>>(item.commercial, {}), ...patch.commercial, inScope: parse<{ inScope?: boolean }>(item.commercial, {}).inScope })
    : item.commercial;

  await db.$transaction(async (tx) => {
    await tx.cosWorkItem.update({
      where: { id: item.id },
      data: {
        title, payload, contentHash: hash, commercial,
        version: material ? item.version + 1 : item.version,
        state: material && wasApproved ? "internal_qa" : item.state,
        dueAt: patch.dueAt === undefined ? item.dueAt : patch.dueAt,
        scheduledAt: patch.scheduledAt === undefined ? item.scheduledAt : patch.scheduledAt,
        assigneeId: patch.assigneeId === undefined ? item.assigneeId : patch.assigneeId,
        reviewerId: patch.reviewerId === undefined ? item.reviewerId : patch.reviewerId,
        priority: patch.priority ?? item.priority,
      },
    });
    if (material) {
      await tx.cosApproval.updateMany({
        where: { workItemId: item.id, status: { in: ["requested", "approved", "approved_with_edits"] } },
        data: { status: "revoked", reason: "Content changed after request.", decidedAt: new Date() },
      });
      await tx.cosWorkEvent.create({
        data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "edit", fromState: item.state, toState: material && wasApproved ? "internal_qa" : item.state, data: json({ version: item.version + 1, approvalsRevoked: wasApproved }) },
      });
    }
  });
  if (material) {
    await snapshotRevision(actor.orgId, "work_item", item.id, item.version + 1, hash, { title, payload: parse(payload, null) }, actor.userId);
    // shared source changed → flag the channel variants for review; their own approvals stay valid
    await db.cosContentVariant.updateMany({ where: { orgId: actor.orgId, workItemId: item.id, state: { notIn: ["published", "cancelled"] } }, data: { sourceChanged: true } });
  }
}

export async function addWorkEvent(actor: WorkActor, id: string, ev: { kind: "comment" | "time" | "ai"; text?: string; minutes?: number; aiCostMicros?: number; model?: string; internal?: boolean }) {
  const item = await getWorkItem(actor, id);
  const staff = isStaffRole(actor.role);
  if (ev.kind !== "comment" && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  if (ev.kind === "time" && (!ev.minutes || ev.minutes <= 0 || ev.minutes > 24 * 60)) throw new WorkError("Minutes must be between 1 and 1440.");
  await db.cosWorkEvent.create({
    data: {
      orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: ev.kind === "ai" ? "ai" : "user", kind: ev.kind,
      minutes: ev.minutes ?? null, aiCostMicros: ev.aiCostMicros ?? null, model: ev.model ?? null,
      // time and AI cost are private staffing economics (§11.3); clients can never post internal notes
      internal: ev.kind !== "comment" ? true : staff && (ev.internal ?? false),
      data: json(ev.text ? { text: ev.text.slice(0, 4000) } : undefined),
    },
  });
}

export async function addDeliverable(actor: WorkActor, id: string, d: { title: string; url?: string; note?: string }) {
  const item = await getWorkItem(actor, id);
  if (!can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  if (!d.title.trim()) throw new WorkError("Title is required.");
  if (d.url && !/^https:\/\//i.test(d.url)) throw new WorkError("Deliverable links must be https.");
  const n = await db.cosDeliverable.count({ where: { workItemId: item.id } });
  return db.cosDeliverable.create({
    data: { orgId: actor.orgId, workItemId: item.id, title: d.title.trim(), url: d.url || null, note: d.note || null, version: n + 1, createdById: actor.userId },
  });
}

export async function toggleChecklist(actor: WorkActor, id: string, key: string, done: boolean) {
  const item = await getWorkItem(actor, id);
  if (!can(actor.role, "work.review") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  const payload = parse<{ checklist?: { key: string; label: string; done: boolean }[] }>(item.payload, {});
  const checklist = (payload.checklist ?? []).map((c) => (c.key === key ? { ...c, done } : c));
  // checklist ticks are process state, not approvable content → no version bump
  await db.cosWorkItem.update({ where: { id: item.id }, data: { payload: JSON.stringify({ ...payload, checklist }) } });
  await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "edit", internal: true, data: json({ checklist: key, done }) } });
}

// ── approvals ────────────────────────────────────────────────────────────────

export async function requestApproval(actor: WorkActor, id: string, summary?: string) {
  const item = await db.cosWorkItem.findFirst({ where: { id, orgId: actor.orgId } });
  if (!item) throw new WorkError("Work item not found.");
  if (!isStaffRole(actor.role)) throw new WorkError("Forbidden.");
  const open = await db.cosApproval.findFirst({ where: { workItemId: id, version: item.version, status: "requested" } });
  if (open) return open;
  const commercial = parse<{ incrementalCharge?: number; inScope?: boolean }>(item.commercial, {});
  const approval = await db.cosApproval.create({
    data: {
      orgId: actor.orgId, workItemId: id, subject: "work_item", subjectId: id, version: item.version,
      contentHash: item.contentHash ?? itemHash(item.title, item.payload),
      summary: summary ?? item.title,
      diff: json({ type: item.type, riskTier: item.riskTier, inScope: commercial.inScope ?? true, incrementalCharge: commercial.incrementalCharge ?? 0 }),
      requestedById: actor.userId,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    },
  });
  await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: id, actorId: actor.userId, actorType: "user", kind: "approval", data: json({ approvalId: approval.id, status: "requested", version: item.version }) } });
  await notify({ orgId: actor.orgId, audience: "client", kind: "approval_requested", title: `Your decision is needed: ${item.title}`, href: "/app/approvals", dedupeKey: `approval:${approval.id}` });
  return approval;
}

/**
 * Client decision. Tier-3 items (and unpaid scope changes) need spend.approve;
 * everything else approvals.decide. Staff hold neither — Catalyst can never
 * approve its own work. Reject requires a reason. Approve-with-edits stores the
 * reviewed final version and binds the approval to ITS hash, keeping the delta.
 */
export async function decideApproval(actor: WorkActor, approvalId: string, decision: "approved" | "approved_with_edits" | "rejected", opts: { reason?: string; editedPayload?: unknown } = {}) {
  const approval = await db.cosApproval.findFirst({ where: { id: approvalId, orgId: actor.orgId } });
  if (!approval || !approval.workItemId || approval.subject !== "work_item") throw new WorkError("Approval not found.");
  const item = await db.cosWorkItem.findFirst({ where: { id: approval.workItemId, orgId: actor.orgId } });
  if (!item) throw new WorkError("Work item not found.");
  await assertWritable(actor.orgId);
  const commercial = parse<{ inScope?: boolean; incrementalCharge?: number }>(item.commercial, {});
  const needsSpend = item.riskTier >= 3 || (commercial.inScope === false && (commercial.incrementalCharge ?? 0) > 0);
  if (!can(actor.role, needsSpend ? "spend.approve" : "approvals.decide")) throw new WorkError(needsSpend ? "Only a workspace owner can approve spend, releases or paid scope changes." : "Forbidden.");
  if (!canDecideApproval(approval.status, decision)) throw new WorkError(`This request is already ${approval.status}.`);
  if (approval.expiresAt && approval.expiresAt < new Date()) {
    await db.cosApproval.update({ where: { id: approval.id }, data: { status: "expired", decidedAt: new Date() } });
    throw new WorkError("This approval request expired — ask for a fresh one.");
  }
  if (approval.version !== item.version || approval.contentHash !== item.contentHash) throw new WorkError("The item changed after this request — a fresh approval is needed.");
  if (decision === "rejected" && !opts.reason?.trim()) throw new WorkError("A reason is required to reject.");
  if (decision === "approved_with_edits" && opts.editedPayload === undefined) throw new WorkError("Provide the edited version.");

  await db.$transaction(async (tx) => {
    let hash = approval.contentHash;
    let version = item.version;
    let diff = approval.diff;
    if (decision === "approved_with_edits") {
      const before = parse<Record<string, unknown>>(item.payload, {});
      const after = { ...before, ...(opts.editedPayload as Record<string, unknown>) };
      const payload = JSON.stringify(after);
      hash = itemHash(item.title, payload);
      version = item.version + 1;
      diff = json({ ...parse<Record<string, unknown>>(approval.diff, {}), before, after });
      await tx.cosWorkItem.update({ where: { id: item.id }, data: { payload, contentHash: hash, version } });
    }
    await tx.cosApproval.update({
      where: { id: approval.id },
      data: { status: decision, decidedById: actor.userId, decidedAt: new Date(), reason: opts.reason?.trim() || null, contentHash: hash, version, diff },
    });
    const scopeApproved = decision !== "rejected" && commercial.inScope === false;
    // change requests are approved while still being scoped; content/milestones from client_review
    const nextState = item.state === "client_review" ? (decision === "rejected" ? "revision_requested" : "approved") : item.state;
    await tx.cosWorkItem.update({
      where: { id: item.id },
      data: { state: nextState, commercial: scopeApproved ? JSON.stringify({ ...commercial, inScope: true, changeApprovedBy: actor.userId }) : item.commercial },
    });
    await tx.cosWorkEvent.create({
      data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "approval", fromState: item.state, toState: nextState, data: json({ approvalId: approval.id, status: decision, version, reason: opts.reason?.trim() }) },
    });
  });
  await db.cosNotification.updateMany({ where: { dedupeKey: `approval:${approval.id}`, readAt: null }, data: { readAt: new Date() } });
  if (decision === "approved_with_edits") {
    const fresh = await db.cosWorkItem.findUniqueOrThrow({ where: { id: item.id } });
    await snapshotRevision(actor.orgId, "work_item", item.id, fresh.version, fresh.contentHash ?? "", { title: fresh.title, payload: parse(fresh.payload, null), editedByClient: true }, actor.userId);
  }
  // WP-42: open pins ride along with the revision request
  const pinText = decision === "rejected" ? await import("./pins").then((m) => m.pinsSummary(actor.orgId, "work_item", item.id)).catch(() => "") : "";
  if (decision === "rejected") await notify({ orgId: actor.orgId, userId: item.assigneeId ?? item.ownerId, audience: "staff", kind: "revision_requested", title: `Revision requested: ${item.title}`, body: [opts.reason, pinText].filter(Boolean).join("\n") || null, href: `/app/work/${item.id}`, dedupeKey: `revision:${approval.id}` });
  // An approved PAID scope change becomes a commercial record — once (unique per change request).
  if (decision !== "rejected" && commercial.inScope === false && (commercial.incrementalCharge ?? 0) > 0 && item.engagementId) {
    await import("./commercial").then(({ recordApprovedChange }) => recordApprovedChange(actor.orgId, item.engagementId!, item.id, item.title, commercial.incrementalCharge!, actor.userId));
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `approval.${decision}`, entity: "CosApproval", entityId: approval.id, data: { workItemId: item.id, version: item.version, tier: item.riskTier } });
  await import("./automation/engine").then(({ dispatchEvent }) => dispatchEvent(actor.orgId, "trigger.approval_decided", { workItemId: item.id, title: item.title, decision, to: decision }, `approval:${approval.id}`)).catch(() => {});
}

/** A client can pull an approval back before the work ships. */
export async function revokeApproval(actor: WorkActor, approvalId: string, reason: string) {
  if (!can(actor.role, "approvals.decide")) throw new WorkError("Forbidden.");
  if (!reason.trim()) throw new WorkError("A reason is required.");
  const approval = await db.cosApproval.findFirst({ where: { id: approvalId, orgId: actor.orgId } });
  if (!approval || !canDecideApproval(approval.status, "revoked")) throw new WorkError("Nothing to revoke.");
  await db.cosApproval.update({ where: { id: approval.id }, data: { status: "revoked", reason: reason.trim(), decidedAt: new Date(), decidedById: actor.userId } });
  if (approval.subject === "variant") {
    // only THAT channel version loses its sign-off: back to draft, anything still scheduled is cancelled
    await db.cosContentVariant.updateMany({ where: { id: approval.subjectId, orgId: actor.orgId, state: { in: ["approved", "scheduled"] } }, data: { state: "draft", scheduledAt: null } });
    await db.cosPublication.updateMany({ where: { orgId: actor.orgId, variantId: approval.subjectId, status: "scheduled" }, data: { status: "cancelled", lastError: "Approval revoked by the client." } });
    if (approval.workItemId) await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: approval.workItemId, variantId: approval.subjectId, actorId: actor.userId, actorType: "user", kind: "approval", data: json({ approvalId, status: "revoked", reason: reason.trim() }) } });
  } else if (approval.workItemId) {
    const item = await db.cosWorkItem.findFirst({ where: { id: approval.workItemId, orgId: actor.orgId } });
    if (item && ["approved", "scheduled"].includes(item.state)) {
      await db.cosWorkItem.update({ where: { id: item.id }, data: { state: "revision_requested" } });
    }
    await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: approval.workItemId, actorId: actor.userId, actorType: "user", kind: "approval", data: json({ approvalId, status: "revoked", reason: reason.trim() }) } });
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "approval.revoked", entity: "CosApproval", entityId: approvalId });
}

// ── publishing ───────────────────────────────────────────────────────────────

/**
 * Publish an approved content item through a verified connection. The gate is
 * re-checked immediately before the call (§9.2); an atomic claim on `outcome`
 * makes a double click or retry unable to publish twice (§15.1).
 */
export async function publishWorkItem(actor: WorkActor, id: string) {
  const item = await getWorkItem(actor, id);
  if (!can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  if (item.type !== "content") throw new WorkError("Only content items can be published.");
  if (!["approved", "scheduled"].includes(item.state)) throw new WorkError("Only approved content can be published.");
  const payload = parse<{ channel?: string; body?: string }>(item.payload, {});
  const { PUBLISHABLE, publishText, isProvider } = await import("./connectors");
  const channel = payload.channel ?? "";
  if (!isProvider(channel) || !PUBLISHABLE.includes(channel)) throw new WorkError(`No publishing connector for "${channel}" — deliver manually and record the link.`);
  if (!payload.body?.trim()) throw new WorkError("Nothing to publish — the body is empty.");

  const [ws, approval] = await Promise.all([db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } }), currentApproval(item.id, item.version)]);
  const gate = await gateWithFlags({ feature: "publish", orgId: actor.orgId, tier: Math.max(2, item.riskTier), killSwitch: ws?.killSwitch ?? false, currentHash: item.contentHash ?? "", approval });
  const log = (data: unknown, toState?: string) => db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "execution", fromState: item.state, toState: toState ?? null, data: json(data) } });
  if (!gate.allowed) { await log({ blocked: gate.reason, attempted: "publish" }); throw new WorkError(gate.reason); }

  const claim = await db.cosWorkItem.updateMany({ where: { id: item.id, orgId: actor.orgId, state: item.state, outcome: null }, data: { outcome: JSON.stringify({ publishing: true }) } });
  if (claim.count !== 1) throw new WorkError("This item is already being published or was published.");
  try {
    const externalId = await publishText(actor.orgId, channel, payload.body);
    await db.cosWorkItem.update({ where: { id: item.id }, data: { state: "delivered", deliveredAt: item.deliveredAt ?? new Date(), outcome: JSON.stringify({ externalId, channel, publishedAt: new Date().toISOString() }) } });
    await log({ published: channel, externalId }, "delivered");
    await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "work.published", entity: "CosWorkItem", entityId: item.id, data: { channel, version: item.version } });
    return externalId;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Publish failed.";
    // The provider answering "no" (HTTP status in the message) is safe to retry. A timeout or
    // network drop is NOT: the post may exist. Keep the claim so nothing re-publishes blindly.
    const definite = /failed \(\d{3}\)|characters|not connected|expired|unknown|not supported/.test(message);
    await db.cosWorkItem.update({ where: { id: item.id }, data: { state: "failed", outcome: definite ? null : JSON.stringify({ uncertain: true, channel, at: new Date().toISOString() }) } });
    await log({ failed: message.slice(0, 300), channel, uncertain: !definite }, "failed");
    throw new WorkError(definite ? message : `${message} — outcome uncertain: check ${channel} before doing anything else. This item will not auto-retry.`);
  }
}
