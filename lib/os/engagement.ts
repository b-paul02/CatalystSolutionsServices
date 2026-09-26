// Engagement lifecycle (GrowthOS v2). One org can run several engagements; each has its
// own stage, hold, payment status, checklist, cycles and commercial records.
// Same contract as lib/os/work.ts: the actor is already tenant-resolved (requireOrg) and
// every function re-checks the capability. History is append-only (CosEngagementEvent).
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { WorkError, type WorkActor } from "./work";
import { notify } from "./notify";
import { serviceBySlug } from "./catalog";
import { templateFor } from "./templates";

// ── pure rules ───────────────────────────────────────────────────────────────

export const ENGAGEMENT_STAGES = ["prospect", "discovery", "proposal", "accepted", "onboarding", "active", "review", "completed", "offboarded", "declined"] as const;
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number];
export const HOLDS = ["none", "awaiting_client", "blocked", "paused"] as const;
export const PAYMENT_STATUSES = ["not_invoiced", "invoiced", "part_paid", "paid", "overdue", "refunded"] as const;
export const GOAL_FOCUS = ["visibility", "acquisition", "retention", "operations", "product"] as const;
export const ENTRY_SOURCES = ["audit", "direct", "partner"] as const;
export const READINESS = ["unknown", "assets_ready", "foundation_needed"] as const;
export const ACCESS_STATUSES = ["pending", "available", "insufficient", "disconnected", "not_needed"] as const;

export const STAGE_LABEL: Record<EngagementStage, string> = {
  prospect: "Prospect", discovery: "Discovery", proposal: "Proposal", accepted: "Accepted", onboarding: "Onboarding",
  active: "Active delivery", review: "Review / renewal", completed: "Completed", offboarded: "Handed over", declined: "Declined",
};

// "accepted" is reached ONLY by the client signing scope (signContract) — never by staff.
const NEXT: Record<EngagementStage, EngagementStage[]> = {
  prospect: ["discovery", "proposal", "declined"],
  discovery: ["proposal", "declined"],
  proposal: ["discovery", "declined"],
  accepted: ["onboarding"],
  onboarding: ["active"],
  active: ["review", "completed"],
  review: ["active", "completed"],
  completed: ["offboarded"],
  offboarded: [],
  declined: [],
};
export const OPEN_STAGES: EngagementStage[] = ["prospect", "discovery", "proposal", "accepted", "onboarding", "active", "review"];

export function canMoveEngagement(from: string, to: string, by: "staff" | "client_signature"): { ok: true } | { ok: false; reason: string } {
  if (to === "accepted") return by === "client_signature" && (from === "proposal" || from === "discovery" || from === "prospect") ? { ok: true } : { ok: false, reason: "An engagement is accepted only when the client signs the proposed scope." };
  if (by !== "staff") return { ok: false, reason: "Not allowed." };
  return (NEXT[from as EngagementStage] ?? []).includes(to as EngagementStage) ? { ok: true } : { ok: false, reason: `Cannot move from ${from} to ${to}.` };
}
export const nextStages = (from: string): EngagementStage[] => (NEXT[from as EngagementStage] ?? []).filter((s) => s !== "accepted");

/** Payment status is DERIVED from commercial records — never typed in. */
export function derivePaymentStatus(records: { status: string; dueAt: Date | null }[], now = new Date()): (typeof PAYMENT_STATUSES)[number] {
  const live = records.filter((r) => r.status !== "void" && r.status !== "draft");
  if (live.length === 0) return "not_invoiced";
  if (live.every((r) => r.status === "refunded")) return "refunded";
  if (live.some((r) => r.status === "overdue" || ((r.status === "issued" || r.status === "part_paid") && r.dueAt && r.dueAt < now))) return "overdue";
  if (live.every((r) => r.status === "paid" || r.status === "refunded")) return "paid";
  if (live.some((r) => r.status === "paid" || r.status === "part_paid")) return "part_paid";
  return "invoiced";
}

/** Next period start for a recurring engagement (UTC month/quarter boundaries from startsAt's day). */
export function cyclePeriod(interval: string, anchor: Date, now: Date): { start: Date; end: Date } | null {
  const months = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 0;
  if (!months) return null;
  const day = Math.min(anchor.getUTCDate(), 28); // ponytail: clamp to 28 so every month has the day
  const elapsed = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth() - (now.getUTCDate() < day ? 1 : 0);
  const k = Math.max(0, Math.floor(elapsed / months));
  const at = (n: number) => new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + n * months, day));
  return { start: at(k), end: at(k + 1) };
}

// ── helpers ──────────────────────────────────────────────────────────────────

const staffOnly = (actor: WorkActor) => { if (!isStaffRole(actor.role) || !can(actor.role, "work.manage")) throw new WorkError("Forbidden."); };

export async function getEngagement(actor: WorkActor, id: string) {
  if (!can(actor.role, "work.view")) throw new WorkError("Forbidden.");
  const e = await db.cosEngagement.findFirst({ where: { id, orgId: actor.orgId } });
  if (!e) throw new WorkError("Engagement not found.");
  return e;
}

const event = (orgId: string, engagementId: string, actorId: string | null, kind: string, fromValue: string | null, toValue: string | null, reason?: string | null, actorType = "user") =>
  db.cosEngagementEvent.create({ data: { orgId, engagementId, actorId, actorType, kind, fromValue, toValue, reason: reason?.slice(0, 1000) ?? null } });

export type NewEngagement = {
  name: string; entrySource?: string; sourceLeadId?: string | null; partnerDealId?: string | null; goalFocus?: string[];
  readiness?: string; ownerId?: string | null; currency?: string | null; demo?: boolean;
};

/**
 * Create an engagement for an org. Platform admins call this with actorId only.
 * Linking the same partner deal twice returns the FIRST engagement (unique partnerDealId) —
 * a partner opportunity can never produce two engagements, workspaces or charges.
 */
export async function createEngagement(orgId: string, actorId: string | null, input: NewEngagement, actorType = "user") {
  const name = input.name.trim();
  if (!name) throw new WorkError("Engagement name is required.");
  if (input.partnerDealId) {
    const existing = await db.cosEngagement.findUnique({ where: { partnerDealId: input.partnerDealId } });
    if (existing) {
      if (existing.orgId !== orgId) throw new WorkError("That partner deal is already linked to another organisation.");
      return existing;
    }
  }
  const entrySource = (ENTRY_SOURCES as readonly string[]).includes(input.entrySource ?? "") ? input.entrySource! : input.partnerDealId ? "partner" : input.sourceLeadId ? "audit" : "direct";
  try {
    const e = await db.cosEngagement.create({
      data: {
        orgId, name, entrySource, sourceLeadId: input.sourceLeadId ?? null, partnerDealId: input.partnerDealId ?? null,
        goalFocus: (input.goalFocus ?? []).filter((g) => (GOAL_FOCUS as readonly string[]).includes(g)),
        readiness: (READINESS as readonly string[]).includes(input.readiness ?? "") ? input.readiness! : "unknown",
        ownerId: input.ownerId ?? null, currency: input.currency ?? null, createdById: actorId, demo: input.demo ?? false,
        nextAction: "Run discovery", nextActionSide: "catalyst",
      },
    });
    await event(orgId, e.id, actorId, "stage", null, "prospect", `Created from ${entrySource}`, actorType);
    await logLosAudit({ orgId, actorUserId: actorId ?? undefined, actorType: actorType === "user" ? "user" : "platform_admin", action: "engagement.created", entity: "CosEngagement", entityId: e.id, data: { entrySource } });
    return e;
  } catch (err) {
    // concurrent link of the same deal: the unique index decided — return the winner
    if (input.partnerDealId && (err as { code?: string }).code === "P2002") {
      const winner = await db.cosEngagement.findUnique({ where: { partnerDealId: input.partnerDealId } });
      if (winner && winner.orgId === orgId) return winner;
    }
    throw err;
  }
}

export async function moveEngagement(actor: WorkActor, id: string, to: string, reason?: string) {
  staffOnly(actor);
  const e = await getEngagement(actor, id);
  const check = canMoveEngagement(e.stage, to, "staff");
  if (!check.ok) throw new WorkError(check.reason);
  if (to === "declined" && !reason?.trim()) throw new WorkError("Give a reason for declining.");
  if (to === "active") {
    const open = await db.cosChecklistItem.count({ where: { engagementId: e.id, status: { in: ["pending", "insufficient", "disconnected"] } } });
    // Missing access never blocks the whole engagement — only the work that depends on it.
    if (open > 0 && !reason?.trim()) throw new WorkError(`${open} onboarding item(s) are still open. Add a note to start delivery anyway — dependent work stays blocked.`);
  }
  await applyStage(e.orgId, e.id, e.stage, to, actor.userId, reason);
}

async function applyStage(orgId: string, id: string, from: string, to: string, actorId: string | null, reason?: string | null, actorType = "user") {
  const closing = to === "completed" || to === "offboarded" || to === "declined";
  const NEXT_ACTION: Partial<Record<EngagementStage, [string, "client" | "catalyst"]>> = {
    discovery: ["Complete the discovery profile", "client"], proposal: ["Review and sign the proposed scope", "client"],
    accepted: ["Start onboarding", "catalyst"], onboarding: ["Provide access and brand assets", "client"],
    active: ["Delivery in progress", "catalyst"], review: ["Review results and decide on renewal", "client"], completed: ["Export and hand over", "catalyst"],
  };
  const na = NEXT_ACTION[to as EngagementStage];
  await db.$transaction([
    db.cosEngagement.update({
      where: { id },
      data: { stage: to, closedAt: closing ? new Date() : null, ...(to === "active" ? { startsAt: undefined } : {}), nextAction: na?.[0] ?? null, nextActionSide: na?.[1] ?? null, ...(closing ? { hold: "none", holdReason: null } : {}) },
    }),
    db.cosEngagementEvent.create({ data: { orgId, engagementId: id, actorId, actorType, kind: "stage", fromValue: from, toValue: to, reason: reason?.slice(0, 1000) ?? null } }),
  ]);
  if (to === "active") await db.cosEngagement.updateMany({ where: { id, startsAt: null }, data: { startsAt: new Date() } });
  await logLosAudit({ orgId, actorUserId: actorId ?? undefined, actorType: "user", action: "engagement.stage", entity: "CosEngagement", entityId: id, data: { from, to } });
}

/** Called by signContract: the client's signature is the only path to "accepted". */
export async function acceptEngagementBySignature(orgId: string, engagementId: string, userId: string) {
  const e = await db.cosEngagement.findFirst({ where: { id: engagementId, orgId } });
  if (!e || !canMoveEngagement(e.stage, "accepted", "client_signature").ok) return;
  await applyStage(orgId, e.id, e.stage, "accepted", userId, "Client signed the proposed scope");
}
export async function declineEngagementByClient(orgId: string, engagementId: string, userId: string, reason: string) {
  const e = await db.cosEngagement.findFirst({ where: { id: engagementId, orgId, stage: { in: ["prospect", "discovery", "proposal"] } } });
  if (!e) return;
  // only when no other proposal is still open for this engagement
  if (await db.cosContract.count({ where: { orgId, engagementId, status: { in: ["proposed", "active"] } } })) return;
  await applyStage(orgId, e.id, e.stage, "declined", userId, reason || "Client declined the proposed scope");
}

export async function setHold(actor: WorkActor, id: string, hold: string, reason: string, ownerId?: string | null) {
  staffOnly(actor);
  const e = await getEngagement(actor, id);
  if (!(HOLDS as readonly string[]).includes(hold)) throw new WorkError("Unknown hold.");
  if (!OPEN_STAGES.includes(e.stage as EngagementStage)) throw new WorkError("This engagement is closed.");
  if (hold !== "none" && !reason.trim()) throw new WorkError("Say why, and what unblocks it.");
  if (ownerId && !(await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId: ownerId } }))) throw new WorkError("Owner is not in this workspace.");
  await db.$transaction([
    db.cosEngagement.update({ where: { id: e.id }, data: { hold, holdReason: hold === "none" ? null : reason.slice(0, 1000), holdOwnerId: hold === "none" ? null : ownerId ?? null, holdSince: hold === "none" ? null : new Date() } }),
    db.cosEngagementEvent.create({ data: { orgId: e.orgId, engagementId: e.id, actorId: actor.userId, kind: "hold", fromValue: e.hold, toValue: hold, reason: reason.slice(0, 1000) || null } }),
  ]);
  if (hold === "awaiting_client") await notify({ orgId: e.orgId, audience: "client", kind: "access_needed", title: `${e.name}: waiting on you`, body: reason.slice(0, 300), href: `/app/engagement/${e.id}`, dedupeKey: `hold:${e.id}:${Date.now()}` });
}

export async function updateEngagement(actor: WorkActor, id: string, patch: {
  name?: string; goalFocus?: string[]; readiness?: string; ownerId?: string | null; nextAction?: string | null; nextActionSide?: string | null;
  nextActionOwnerId?: string | null; nextActionDueAt?: Date | null; currency?: string | null; setupFeeMinor?: bigint | null; recurringFeeMinor?: bigint | null;
  billingInterval?: string; reviewCycles?: number | null; responseHours?: number | null; startsAt?: Date | null; endsAt?: Date | null; renewalAt?: Date | null;
  renewalNoticeDays?: number; renewalMode?: string; kickoffSummary?: string | null;
}) {
  staffOnly(actor);
  const e = await getEngagement(actor, id);
  for (const uid of [patch.ownerId, patch.nextActionOwnerId]) {
    if (uid && !(await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId: uid } }))) throw new WorkError("That person is not in this workspace.");
  }
  if (patch.billingInterval && !["none", "monthly", "quarterly"].includes(patch.billingInterval)) throw new WorkError("Unknown billing interval.");
  if (patch.currency && !/^[A-Z]{3}$/.test(patch.currency)) throw new WorkError("Currency must be a 3-letter code.");
  if (patch.readiness && !(READINESS as readonly string[]).includes(patch.readiness)) throw new WorkError("Unknown readiness.");
  const data = { ...patch, goalFocus: patch.goalFocus?.filter((g) => (GOAL_FOCUS as readonly string[]).includes(g)), name: patch.name?.trim() || undefined };
  await db.cosEngagement.update({ where: { id: e.id }, data });
  await logLosAudit({ orgId: e.orgId, actorUserId: actor.userId, actorType: "user", action: "engagement.updated", entity: "CosEngagement", entityId: e.id, data: { fields: Object.keys(patch) } });
}

// ── checklist (access, assets, inputs) ───────────────────────────────────────

/** Add the intake requirements of the engagement's contracted services. Idempotent per (engagement, key). */
export async function seedChecklist(orgId: string, engagementId: string, serviceSlugs: string[]) {
  let created = 0;
  for (const slug of serviceSlugs) {
    const tpl = templateFor(slug);
    if (!tpl) continue;
    for (const item of tpl.intake) {
      const key = item.shared ? item.key : `${slug}.${item.key}`;
      if (await db.cosChecklistItem.findUnique({ where: { engagementId_key: { engagementId, key } }, select: { id: true } })) continue;
      await db.cosChecklistItem.upsert({ // upsert (not create): two signers at once must not throw
        where: { engagementId_key: { engagementId, key } }, update: {},
        create: { orgId, engagementId, key, kind: item.kind, label: item.label, serviceSlug: item.shared ? null : slug, provider: item.provider ?? null, ownerSide: item.ownerSide ?? "client", note: item.help ?? null },
      });
      created++;
    }
  }
  return created;
}

export async function addChecklistItem(actor: WorkActor, engagementId: string, input: { kind: string; label: string; ownerSide?: string; dueAt?: Date | null; ownerId?: string | null; provider?: string | null; note?: string }) {
  staffOnly(actor);
  const e = await getEngagement(actor, engagementId);
  if (!["access", "asset", "input"].includes(input.kind)) throw new WorkError("Unknown checklist kind.");
  if (!input.label.trim()) throw new WorkError("Describe what is needed.");
  return db.cosChecklistItem.create({ data: { orgId: e.orgId, engagementId: e.id, kind: input.kind, label: input.label.trim().slice(0, 300), ownerSide: input.ownerSide === "catalyst" ? "catalyst" : "client", dueAt: input.dueAt ?? null, ownerId: input.ownerId ?? null, provider: input.provider ?? null, note: input.note?.slice(0, 1000) ?? null } });
}

/**
 * Clients resolve their own items; staff resolve any. "available" for an access item that names a
 * provider requires a verified connection — a tick box is not evidence of access.
 */
export async function resolveChecklistItem(actor: WorkActor, itemId: string, status: string, opts: { note?: string; connectionId?: string | null; assetId?: string | null; dueAt?: Date | null; ownerId?: string | null } = {}) {
  if (!can(actor.role, "work.view")) throw new WorkError("Forbidden.");
  const item = await db.cosChecklistItem.findFirst({ where: { id: itemId, orgId: actor.orgId } });
  if (!item) throw new WorkError("Checklist item not found.");
  if (!(ACCESS_STATUSES as readonly string[]).includes(status)) throw new WorkError("Unknown status.");
  const staff = isStaffRole(actor.role);
  if (!staff && item.ownerSide !== "client") throw new WorkError("This item is handled by Catalyst.");
  if (!staff && status === "not_needed") throw new WorkError("Ask your account lead to mark this as not needed.");
  if (/password|passwd|pwd\s*[:=]/i.test(opts.note ?? "")) throw new WorkError("Never paste passwords here. Connect the account or invite us on the provider's side.");
  let connectionId = opts.connectionId ?? item.connectionId;
  if (status === "available" && item.kind === "access" && item.provider) {
    const conn = await db.cosConnection.findFirst({ where: { orgId: actor.orgId, provider: item.provider, status: "verified", ...(connectionId ? { id: connectionId } : {}) } });
    if (!conn) throw new WorkError("Connect and verify the account first (Settings → Connections) — then this item completes itself.");
    connectionId = conn.id;
  }
  if (opts.assetId && !(await db.cosAsset.findFirst({ where: { id: opts.assetId, orgId: actor.orgId } }))) throw new WorkError("Asset not found.");
  const resolved = status === "available" || status === "not_needed";
  await db.cosChecklistItem.update({
    where: { id: item.id },
    data: { status, note: opts.note?.slice(0, 1000) ?? item.note, connectionId, assetId: opts.assetId ?? item.assetId, dueAt: opts.dueAt === undefined ? item.dueAt : opts.dueAt, ownerId: opts.ownerId === undefined ? item.ownerId : opts.ownerId, resolvedAt: resolved ? new Date() : null, resolvedById: resolved ? actor.userId : null },
  });
  await db.cosEngagementEvent.create({ data: { orgId: item.orgId, engagementId: item.engagementId, actorId: actor.userId, kind: "note", fromValue: item.status, toValue: status, reason: `Checklist: ${item.label}`.slice(0, 1000) } });
  if (resolved) await releaseDependents(actor.orgId, { checklistId: item.id });
}

/** Connection verified/failed → matching access items follow automatically. */
export async function syncAccessFromConnection(orgId: string, provider: string, connectionId: string, status: string) {
  const to = status === "verified" ? "available" : status === "disconnected" ? "disconnected" : status === "failed" ? "insufficient" : null;
  if (!to) return;
  const items = await db.cosChecklistItem.findMany({ where: { orgId, kind: "access", provider, status: { not: "not_needed" }, engagement: { stage: { in: OPEN_STAGES } } } });
  for (const it of items) {
    if (it.status === to) continue;
    await db.cosChecklistItem.update({ where: { id: it.id }, data: { status: to, connectionId, resolvedAt: to === "available" ? new Date() : null } });
    if (to === "available") await releaseDependents(orgId, { checklistId: it.id });
    else await notify({ orgId, audience: "client", kind: "access_needed", title: `Access needed: ${it.label}`, href: "/app/settings/workspace", dedupeKey: `access:${it.id}:${to}:${new Date().toISOString().slice(0, 10)}` });
  }
}

// ── dependencies ─────────────────────────────────────────────────────────────

const DONE_STATES = ["delivered", "verified", "closed"];

export async function addDependency(actor: WorkActor, workItemId: string, on: { workItemId?: string; checklistId?: string }, note?: string) {
  staffOnly(actor);
  const item = await db.cosWorkItem.findFirst({ where: { id: workItemId, orgId: actor.orgId } });
  if (!item) throw new WorkError("Work item not found.");
  if (!on.workItemId === !on.checklistId) throw new WorkError("Pick one thing this depends on.");
  if (on.workItemId) {
    if (on.workItemId === workItemId) throw new WorkError("An item cannot depend on itself.");
    if (!(await db.cosWorkItem.findFirst({ where: { id: on.workItemId, orgId: actor.orgId } }))) throw new WorkError("Dependency not found.");
    // one-hop cycle guard is enough for a UI that adds one edge at a time; deeper loops surface as mutual blocks
    if (await db.cosDependency.findFirst({ where: { orgId: actor.orgId, workItemId: on.workItemId, onWorkItemId: workItemId } })) throw new WorkError("Those two items would block each other.");
  } else if (!(await db.cosChecklistItem.findFirst({ where: { id: on.checklistId, orgId: actor.orgId } }))) throw new WorkError("Checklist item not found.");
  if (await db.cosDependency.findFirst({ where: { orgId: actor.orgId, workItemId, onWorkItemId: on.workItemId ?? null, onChecklistId: on.checklistId ?? null } })) return;
  await db.cosDependency.create({ data: { orgId: actor.orgId, workItemId, onWorkItemId: on.workItemId ?? null, onChecklistId: on.checklistId ?? null, note: note?.slice(0, 300) ?? null } });
}

export async function removeDependency(actor: WorkActor, dependencyId: string) {
  staffOnly(actor);
  await db.cosDependency.deleteMany({ where: { id: dependencyId, orgId: actor.orgId } });
}

/** What still blocks this item. Empty = free to start. */
export async function unmetDependencies(orgId: string, workItemId: string): Promise<{ id: string; label: string; kind: "work" | "checklist"; refId: string }[]> {
  const deps = await db.cosDependency.findMany({ where: { orgId, workItemId }, include: { onChecklist: true } });
  if (deps.length === 0) return [];
  const workIds = deps.map((d) => d.onWorkItemId).filter((x): x is string => Boolean(x));
  const works = workIds.length ? await db.cosWorkItem.findMany({ where: { orgId, id: { in: workIds } }, select: { id: true, title: true, state: true } }) : [];
  const out: { id: string; label: string; kind: "work" | "checklist"; refId: string }[] = [];
  for (const d of deps) {
    if (d.onChecklist && !["available", "not_needed"].includes(d.onChecklist.status)) out.push({ id: d.id, kind: "checklist", refId: d.onChecklist.id, label: `${d.onChecklist.label} (${d.onChecklist.status.replace(/_/g, " ")})` });
    const w = works.find((x) => x.id === d.onWorkItemId);
    if (w && !DONE_STATES.includes(w.state)) out.push({ id: d.id, kind: "work", refId: w.id, label: `${w.title} (${w.state.replace(/_/g, " ")})` });
  }
  return out;
}

/** A prerequisite just completed → tell the owners of items that are now free. */
export async function releaseDependents(orgId: string, done: { workItemId?: string; checklistId?: string }) {
  const deps = await db.cosDependency.findMany({ where: { orgId, ...(done.workItemId ? { onWorkItemId: done.workItemId } : { onChecklistId: done.checklistId }) } });
  for (const d of deps) {
    if ((await unmetDependencies(orgId, d.workItemId)).length > 0) continue;
    const item = await db.cosWorkItem.findFirst({ where: { id: d.workItemId, orgId } });
    if (!item) continue;
    // an item parked as blocked purely on prerequisites returns to where it was
    if (item.state === "blocked" && item.stateBefore) {
      await db.$transaction([
        db.cosWorkItem.update({ where: { id: item.id }, data: { state: item.stateBefore, stateBefore: null } }),
        db.cosWorkEvent.create({ data: { orgId, workItemId: item.id, actorType: "system", kind: "transition", fromState: "blocked", toState: item.stateBefore, data: JSON.stringify({ note: "Prerequisites met" }) } }),
      ]);
    }
    await notify({ orgId, userId: item.assigneeId ?? item.ownerId, audience: "staff", kind: "blocked", title: `Unblocked: ${item.title}`, href: `/app/work/${item.id}`, dedupeKey: `unblocked:${item.id}:${d.id}` });
  }
}

// ── kickoff, roadmap ─────────────────────────────────────────────────────────

/** Facts-only kickoff summary assembled from stored records (no AI, nothing invented). */
export async function buildKickoffSummary(orgId: string, engagementId: string): Promise<string> {
  const [e, profile, goals, contracts, checklist] = await Promise.all([
    db.cosEngagement.findFirst({ where: { id: engagementId, orgId } }),
    db.cosBusinessProfile.findUnique({ where: { orgId } }),
    db.cosGoal.findMany({ where: { orgId, archivedAt: null, OR: [{ engagementId }, { engagementId: null }] } }),
    db.cosContract.findMany({ where: { orgId, engagementId, status: "active" } }),
    db.cosChecklistItem.findMany({ where: { orgId, engagementId } }),
  ]);
  if (!e) throw new WorkError("Engagement not found.");
  const services = [...new Set(contracts.flatMap((c) => JSON.parse(c.services) as string[]))];
  const open = checklist.filter((c) => !["available", "not_needed"].includes(c.status));
  const line = (label: string, v: string | null | undefined) => (v?.trim() ? `${label}: ${v.trim()}` : `${label}: not provided yet`);
  return [
    `Engagement: ${e.name} (${e.entrySource}) — focus: ${e.goalFocus.join(", ") || "not set"}`,
    line("Business model", profile?.businessModel), line("Audience", profile?.audience), line("Offers", profile?.offers), line("Geography", profile?.geography),
    `Goals: ${goals.length ? goals.map((g) => `${g.metric} → ${g.target} ${g.unit} (${g.horizon})`).join("; ") : "none agreed yet"}`,
    `Scope: ${services.length ? services.map((s) => serviceBySlug[s]?.title ?? s).join(", ") : "no signed scope yet"}`,
    `Service expectations: ${e.reviewCycles ?? "—"} review cycle(s), response within ${e.responseHours ?? "—"} hours`,
    `Readiness: ${e.readiness.replace(/_/g, " ")}`,
    `Open onboarding items (${open.length}): ${open.map((c) => `${c.label} [${c.ownerSide}]`).join("; ") || "none"}`,
    line("Constraints", profile?.constraints),
  ].join("\n");
}

// ── recurring cycles ─────────────────────────────────────────────────────────

/**
 * Generate the CURRENT cycle's recurring work once. Idempotent twice over: the unique
 * (engagementId, periodStart) row is created first; only its creator generates items.
 * Paused engagements record a skipped cycle and generate nothing.
 */
export async function generateCycle(orgId: string, engagementId: string, now = new Date()): Promise<{ created: number; cycleId: string | null; skipped?: string }> {
  const e = await db.cosEngagement.findFirst({ where: { id: engagementId, orgId } });
  if (!e || e.stage !== "active" || !e.startsAt) return { created: 0, cycleId: null, skipped: "not active" };
  if (e.endsAt && e.endsAt <= now) return { created: 0, cycleId: null, skipped: "term ended" };
  const period = cyclePeriod(e.billingInterval, e.startsAt, now);
  if (!period) return { created: 0, cycleId: null, skipped: "not recurring" };
  let cycle;
  try {
    cycle = await db.cosCycle.create({ data: { orgId, engagementId, periodStart: period.start, periodEnd: period.end, status: e.hold === "paused" ? "skipped" : "open" } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { created: 0, cycleId: null, skipped: "already generated" };
    throw err;
  }
  if (cycle.status === "skipped") return { created: 0, cycleId: cycle.id, skipped: "paused" };
  const contracts = await db.cosContract.findMany({ where: { orgId, engagementId, status: "active" } });
  const services = [...new Set(contracts.flatMap((c) => JSON.parse(c.services) as string[]))];
  const rows = services.flatMap((slug) => (templateFor(slug)?.recurring ?? []).map((r) => ({ slug, r })));
  const label = period.start.toISOString().slice(0, 7);
  const { itemHash } = await import("./work");
  if (rows.length) {
    await db.cosWorkItem.createMany({
      data: rows.map(({ slug, r }) => ({
        orgId, engagementId, cycleId: cycle.id, title: `${r.title} — ${label}`, type: "task", serviceSlug: slug, studio: serviceBySlug[slug]?.studio ?? null,
        templateKey: `${slug}.recurring.${r.key}`, contractId: contracts.find((c) => (JSON.parse(c.services) as string[]).includes(slug))?.id ?? null,
        clientReviewRequired: r.clientReview ?? false, assignRole: r.role, acceptanceCriteria: r.acceptance ?? null, dueAt: period.end,
        commercial: JSON.stringify({ inScope: true }), contentHash: itemHash(`${r.title} — ${label}`, null), ownerId: e.ownerId, demo: e.demo,
      })),
    });
  }
  await db.cosCycle.update({ where: { id: cycle.id }, data: { itemsCreated: rows.length } });
  // the period's fee — one record per cycle (unique), amount only if the engagement has one configured
  if (e.recurringFeeMinor && e.currency) {
    await db.cosCommercialRecord.create({ data: { orgId, engagementId, kind: "recurring", cycleId: cycle.id, description: `Recurring fee ${label}`, amountMinor: e.recurringFeeMinor, currency: e.currency, dueAt: period.start, demo: e.demo } }).catch((err) => { if ((err as { code?: string }).code !== "P2002") throw err; });
  }
  await notify({ orgId, audience: "staff", kind: "cycle_generated", title: `${e.name}: ${rows.length} recurring item(s) for ${label}`, href: `/app/engagement/${e.id}`, dedupeKey: `cycle:${cycle.id}` });
  return { created: rows.length, cycleId: cycle.id };
}

/** Scheduler entry: cycles + renewal reminders for every active engagement. */
export async function tickEngagements(now = new Date()) {
  const active = await db.cosEngagement.findMany({ where: { stage: { in: ["active", "review"] } }, select: { id: true, orgId: true, name: true, renewalAt: true, renewalNoticeDays: true, stage: true, billingInterval: true } });
  for (const e of active) {
    if (e.stage === "active" && e.billingInterval !== "none") await generateCycle(e.orgId, e.id, now).catch(() => {});
    if (e.renewalAt && e.renewalAt.getTime() - now.getTime() <= e.renewalNoticeDays * 86_400_000 && e.renewalAt > now) {
      const key = `renewal:${e.id}:${e.renewalAt.toISOString().slice(0, 10)}`;
      await notify({ orgId: e.orgId, audience: "staff", kind: "renewal_due", title: `${e.name} renews on ${e.renewalAt.toISOString().slice(0, 10)}`, href: `/app/engagement/${e.id}`, dedupeKey: `${key}:staff` });
      await notify({ orgId: e.orgId, audience: "client", kind: "renewal_due", title: `${e.name} is up for renewal on ${e.renewalAt.toISOString().slice(0, 10)}`, href: `/app/engagement/${e.id}`, dedupeKey: `${key}:client` });
    }
  }
}

// ── handover ─────────────────────────────────────────────────────────────────

/**
 * Complete → hand over. Ends the engagement's contracts (history stays), and when no other
 * engagement is open the workspace becomes read_only: everything remains visible and exportable,
 * nothing can be created, approved or published. Nothing is deleted.
 */
export async function handOver(actor: WorkActor, id: string, opts: { revokeStaff?: boolean } = {}) {
  staffOnly(actor);
  const e = await getEngagement(actor, id);
  if (e.stage !== "completed") throw new WorkError("Complete the engagement before handing it over.");
  const scheduled = await db.cosPublication.count({ where: { orgId: e.orgId, status: { in: ["scheduled", "claimed"] } } });
  if (scheduled > 0) throw new WorkError(`${scheduled} publication(s) are still scheduled — cancel or publish them first.`);
  await db.cosContract.updateMany({ where: { orgId: e.orgId, engagementId: e.id, status: "active" }, data: { status: "ended", endedAt: new Date() } });
  await applyStage(e.orgId, e.id, e.stage, "offboarded", actor.userId, "Handover complete");
  const stillOpen = await db.cosEngagement.count({ where: { orgId: e.orgId, stage: { in: OPEN_STAGES } } });
  if (stillOpen === 0) await db.cosWorkspace.updateMany({ where: { orgId: e.orgId }, data: { accessMode: "read_only" } });
  await db.cosEngagementEvent.create({ data: { orgId: e.orgId, engagementId: e.id, actorId: actor.userId, kind: "handover", toValue: stillOpen === 0 ? "read_only" : "active", reason: opts.revokeStaff ? "Staff access revocation requested" : null } });
  return { readOnly: stillOpen === 0 };
}
