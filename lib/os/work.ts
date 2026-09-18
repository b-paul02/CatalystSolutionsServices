// Growth Work Item + approval engine (blueprint §9). Every function takes an
// already-authorized actor (orgId from requireOrg membership rows — never from
// client input) and re-checks the specific capability itself. Events are
// append-only; approvals bind to a content hash so stale sign-off can't ship.
import { db } from "@/lib/audit/db";
import { can, isStaffRole, type Permission } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { canDecideApproval, canTransition, contentHash, gateAction, type Capability } from "./workflow";
import { serviceBySlug } from "./catalog";
import { entitlements } from "./entitlements";

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
};

/**
 * Create a work item. Scope rule (E04): a service outside the active contracts
 * becomes a change_request with inScope=false — it cannot reach "ready" until
 * the client approves the change. Recommendations never silently become billable.
 */
export async function createWorkItem(actor: WorkActor, input: NewWorkItem) {
  const isRequest = input.type === "change_request";
  if (!can(actor.role, isRequest ? "work.request" : "work.manage")) throw new WorkError("Forbidden.");
  const title = input.title.trim();
  if (!title) throw new WorkError("Title is required.");
  const ent = await entitlements(actor.orgId);
  const inScope = !isRequest && (!input.serviceSlug || ent.services.has(input.serviceSlug));
  const type = inScope ? input.type ?? "task" : "change_request";
  const payload = json(input.payload);
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
      contractId: inScope ? ent.contractForService(input.serviceSlug ?? null) : null,
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
  ]);
  return item;
}

/** Instantiate a service's delivery template: one project + a milestone per gate. */
export async function instantiateProject(actor: WorkActor, serviceSlug: string, title: string, demo = false) {
  const svc = serviceBySlug[serviceSlug];
  if (!svc) throw new WorkError("Unknown service.");
  const project = await createWorkItem(actor, {
    title, type: "project", serviceSlug, templateKey: serviceSlug, clientReviewRequired: false, demo,
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
    })),
    select: { id: true },
  });
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
  }
  // External action gate — checked immediately before scheduling / delivering (§9.2).
  if (item.state === "approved" || (item.state === "failed" && to === "scheduled")) {
    const [ws, approval] = await Promise.all([
      db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } }),
      currentApproval(item.id, item.version),
    ]);
    const gate = gateAction({
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
      data: { state: to, stateBefore: to === "blocked" ? item.state : null, closedAt: closing ? new Date() : null },
    }),
    db.cosWorkEvent.create({
      data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "transition", fromState: item.state, toState: to, data: json(note ? { note } : undefined) },
    }),
  ]);
  if (to === "client_review") await requestApproval(actor, item.id);
  if (closing && item.findingId && to === "closed") {
    await db.cosFinding.updateMany({ where: { id: item.findingId, orgId: actor.orgId }, data: { statusNote: "Work delivered and closed." } });
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "work.transition", entity: "CosWorkItem", entityId: item.id, data: { from: item.state, to } });
}

/**
 * Edit title/payload. A material change bumps the version and re-hashes; any
 * live approval is revoked and an approved/scheduled item drops back to QA.
 */
export async function editWorkItem(actor: WorkActor, id: string, patch: { title?: string; payload?: unknown; dueAt?: Date | null; scheduledAt?: Date | null; assigneeId?: string | null; reviewerId?: string | null; priority?: number; commercial?: Record<string, unknown> }) {
  const item = await getWorkItem(actor, id);
  if (!can(actor.role, "work.execute") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  if (item.state === "closed" || item.state === "cancelled") throw new WorkError("Item is closed.");
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
  if (!approval || !approval.workItemId) throw new WorkError("Approval not found.");
  const item = await db.cosWorkItem.findFirst({ where: { id: approval.workItemId, orgId: actor.orgId } });
  if (!item) throw new WorkError("Work item not found.");
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
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `approval.${decision}`, entity: "CosApproval", entityId: approval.id, data: { workItemId: item.id, version: item.version, tier: item.riskTier } });
}

/** A client can pull an approval back before the work ships. */
export async function revokeApproval(actor: WorkActor, approvalId: string, reason: string) {
  if (!can(actor.role, "approvals.decide")) throw new WorkError("Forbidden.");
  if (!reason.trim()) throw new WorkError("A reason is required.");
  const approval = await db.cosApproval.findFirst({ where: { id: approvalId, orgId: actor.orgId } });
  if (!approval || !canDecideApproval(approval.status, "revoked")) throw new WorkError("Nothing to revoke.");
  await db.cosApproval.update({ where: { id: approval.id }, data: { status: "revoked", reason: reason.trim(), decidedAt: new Date(), decidedById: actor.userId } });
  if (approval.workItemId) {
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
  const gate = gateAction({ tier: Math.max(2, item.riskTier), killSwitch: ws?.killSwitch ?? false, currentHash: item.contentHash ?? "", approval });
  const log = (data: unknown, toState?: string) => db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "execution", fromState: item.state, toState: toState ?? null, data: json(data) } });
  if (!gate.allowed) { await log({ blocked: gate.reason, attempted: "publish" }); throw new WorkError(gate.reason); }

  const claim = await db.cosWorkItem.updateMany({ where: { id: item.id, orgId: actor.orgId, state: item.state, outcome: null }, data: { outcome: JSON.stringify({ publishing: true }) } });
  if (claim.count !== 1) throw new WorkError("This item is already being published or was published.");
  try {
    const externalId = await publishText(actor.orgId, channel, payload.body);
    await db.cosWorkItem.update({ where: { id: item.id }, data: { state: "delivered", outcome: JSON.stringify({ externalId, channel, publishedAt: new Date().toISOString() }) } });
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
