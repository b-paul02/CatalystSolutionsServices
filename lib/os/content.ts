// Content Studio engine (GrowthOS v2, brief §F): marketing campaigns + briefs, sources and
// approved claims, master content → channel variants, revisions, comments and per-variant
// approvals. Same contract as lib/os/work.ts: tenant-resolved actor, capability re-checked here.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { assertWritable, createWorkItem, snapshotRevision, WorkError, type WorkActor } from "./work";
import { canDecideApproval } from "./workflow";
import { CHANNELS, copyFingerprint, formatSpec, taggedUrl, validateVariant, variantHash, type VariantContent } from "./channels";
import { copyProblems } from "./ai";
import { entitlements } from "./entitlements";
import { notify } from "./notify";
import { testAdapterEnabled } from "./adapters";

const canMake = (actor: WorkActor) => can(actor.role, "work.execute") || can(actor.role, "work.manage");
const need = (ok: boolean) => { if (!ok) throw new WorkError("Forbidden."); };

// ── campaigns ────────────────────────────────────────────────────────────────

const codeOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "campaign";

export type CampaignInput = {
  name: string; engagementId?: string | null; goalId?: string | null; objective?: string; audience?: string; keyMessage?: string; offer?: string;
  cta?: string; destinationUrl?: string; channels?: string[]; paidMode?: string; budgetNote?: string; startsAt?: Date | null; endsAt?: Date | null;
};

/**
 * `studio`: a member with `ai.use` saving their own AI Studio brief. It is always created as a DRAFT and only someone with
 * `work.manage` can change or activate it afterwards (updateCampaign) — so this grants no campaign management.
 */
export async function createCampaign(actor: WorkActor, input: CampaignInput, opts: { studio?: { operationId: string; provenance: unknown }; tx?: Prisma.TransactionClient } = {}) {
  need(can(actor.role, "work.manage") || (!!opts.studio && can(actor.role, "ai.use")));
  const d = opts.tx ?? db;
  await assertWritable(actor.orgId);
  const ent = await entitlements(actor.orgId);
  if (!ent.modules.has("content")) throw new WorkError("Content is not part of this workspace's scope — raise a change request.");
  const name = input.name.trim();
  if (!name) throw new WorkError("Name the campaign.");
  if (input.destinationUrl && !/^https:\/\//i.test(input.destinationUrl)) throw new WorkError("Destination link must be https.");
  const [goal, eng] = await Promise.all([
    input.goalId ? db.cosGoal.findFirst({ where: { id: input.goalId, orgId: actor.orgId } }) : null,
    input.engagementId ? db.cosEngagement.findFirst({ where: { id: input.engagementId, orgId: actor.orgId } }) : null,
  ]);
  if ((input.goalId && !goal) || (input.engagementId && !eng)) throw new WorkError("Linked goal or engagement not found.");
  // the code is the stable utm_campaign — unique per org, never edited afterwards
  const base = codeOf(name);
  let code = base;
  for (let i = 2; await d.cosCampaign.findUnique({ where: { orgId_code: { orgId: actor.orgId, code } } }); i++) code = `${base}-${i}`;
  const c = await d.cosCampaign.create({
    data: {
      orgId: actor.orgId, name, code, engagementId: eng?.id ?? goal?.engagementId ?? ent.defaultEngagementId, goalId: goal?.id ?? null,
      objective: input.objective?.slice(0, 1000) || null, audience: input.audience?.slice(0, 1000) || null, keyMessage: input.keyMessage?.slice(0, 1000) || null,
      offer: input.offer?.slice(0, 600) || null, cta: input.cta?.slice(0, 200) || null, destinationUrl: input.destinationUrl || null,
      channels: (input.channels ?? []).filter((ch) => CHANNELS[ch]), paidMode: ["organic", "paid", "mixed"].includes(input.paidMode ?? "") ? input.paidMode! : "organic",
      budgetNote: input.budgetNote?.slice(0, 300) || null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, ownerId: actor.userId, createdById: actor.userId, demo: ent.demo,
    },
  });
  if (opts.studio) {
    // provenance lives with the brief's first revision (no extra column): which run wrote it and what the person changed
    const snapshot = { name: c.name, objective: c.objective, audience: c.audience, keyMessage: c.keyMessage, offer: c.offer, cta: c.cta, channels: c.channels, provenance: opts.studio.provenance };
    await d.cosRevision.create({ data: { orgId: actor.orgId, subject: "campaign", subjectId: c.id, version: 1, contentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), snapshot: JSON.stringify(snapshot), createdById: actor.userId } });
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "campaign.created", entity: "CosCampaign", entityId: c.id, data: opts.studio ? { origin: "ai_studio", operationId: opts.studio.operationId } : undefined });
  return c;
}

export async function updateCampaign(actor: WorkActor, id: string, patch: Omit<CampaignInput, "name" | "engagementId"> & { name?: string; status?: string }) {
  need(can(actor.role, "work.manage"));
  await assertWritable(actor.orgId);
  const c = await db.cosCampaign.findFirst({ where: { id, orgId: actor.orgId } });
  if (!c) throw new WorkError("Campaign not found.");
  if (patch.status && !["draft", "active", "paused", "completed", "archived"].includes(patch.status)) throw new WorkError("Unknown status.");
  if (patch.destinationUrl && !/^https:\/\//i.test(patch.destinationUrl)) throw new WorkError("Destination link must be https.");
  if (patch.goalId && !(await db.cosGoal.findFirst({ where: { id: patch.goalId, orgId: actor.orgId } }))) throw new WorkError("Goal not found.");
  const briefChanged = (["objective", "audience", "keyMessage", "offer", "cta", "destinationUrl"] as const).some((k) => patch[k] !== undefined && (patch[k] || null) !== c[k]);
  await db.cosCampaign.update({
    where: { id: c.id },
    data: {
      name: patch.name?.trim() || c.name, status: patch.status ?? c.status, goalId: patch.goalId === undefined ? c.goalId : patch.goalId || null,
      objective: patch.objective ?? c.objective, audience: patch.audience ?? c.audience, keyMessage: patch.keyMessage ?? c.keyMessage, offer: patch.offer ?? c.offer,
      cta: patch.cta ?? c.cta, destinationUrl: patch.destinationUrl === undefined ? c.destinationUrl : patch.destinationUrl || null,
      channels: patch.channels ? patch.channels.filter((ch) => CHANNELS[ch]) : c.channels, paidMode: patch.paidMode ?? c.paidMode, budgetNote: patch.budgetNote ?? c.budgetNote,
      startsAt: patch.startsAt === undefined ? c.startsAt : patch.startsAt, endsAt: patch.endsAt === undefined ? c.endsAt : patch.endsAt,
    },
  });
  // A changed brief is a changed shared source: flag this campaign's open variants for review.
  // Their approvals stay valid — only an edit to the variant itself voids its approval.
  if (briefChanged) {
    const items = await db.cosWorkItem.findMany({ where: { orgId: actor.orgId, campaignId: c.id }, select: { id: true } });
    await db.cosContentVariant.updateMany({ where: { orgId: actor.orgId, workItemId: { in: items.map((i) => i.id) }, state: { notIn: ["published", "cancelled"] } }, data: { sourceChanged: true } });
  }
  return { briefChanged };
}

// ── sources & approved claims ────────────────────────────────────────────────

export async function addSource(actor: WorkActor, input: { title: string; kind?: string; url?: string; excerpt?: string; assetId?: string | null }) {
  need(canMake(actor) || can(actor.role, "work.request"));
  await assertWritable(actor.orgId);
  if (!input.title.trim()) throw new WorkError("Give the source a title.");
  if (input.url && !/^https:\/\//i.test(input.url)) throw new WorkError("Source links must be https.");
  if (input.assetId && !(await db.cosAsset.findFirst({ where: { id: input.assetId, orgId: actor.orgId } }))) throw new WorkError("Asset not found.");
  return db.cosSource.create({ data: { orgId: actor.orgId, title: input.title.trim().slice(0, 200), kind: ["url", "document", "transcript", "note"].includes(input.kind ?? "") ? input.kind! : input.url ? "url" : "note", url: input.url || null, excerpt: input.excerpt?.slice(0, 6000) || null, assetId: input.assetId ?? null, createdById: actor.userId } });
}

export async function proposeClaim(actor: WorkActor, text: string, opts: { sourceId?: string | null; evidenceNote?: string } = {}) {
  need(canMake(actor) || can(actor.role, "work.request"));
  await assertWritable(actor.orgId);
  if (text.trim().length < 8) throw new WorkError("Write the claim out in full.");
  if (opts.sourceId && !(await db.cosSource.findFirst({ where: { id: opts.sourceId, orgId: actor.orgId } }))) throw new WorkError("Source not found.");
  return db.cosClaim.create({ data: { orgId: actor.orgId, text: text.trim().slice(0, 500), sourceId: opts.sourceId ?? null, evidenceNote: opts.evidenceNote?.slice(0, 500) || null, createdById: actor.userId } });
}

/** Only the CLIENT can approve a claim about their own business. */
export async function decideClaim(actor: WorkActor, id: string, status: "approved" | "retired") {
  need(status === "approved" ? can(actor.role, "approvals.decide") : can(actor.role, "approvals.decide") || can(actor.role, "work.manage"));
  const claim = await db.cosClaim.findFirst({ where: { id, orgId: actor.orgId } });
  if (!claim) throw new WorkError("Claim not found.");
  await db.cosClaim.update({ where: { id }, data: { status, approvedById: status === "approved" ? actor.userId : claim.approvedById, approvedAt: status === "approved" ? new Date() : claim.approvedAt } });
}

// ── master content + variants ────────────────────────────────────────────────

export async function createMaster(actor: WorkActor, input: { title: string; campaignId?: string | null; goalId?: string | null; brief?: string; body?: string; pillar?: string; sourceIds?: string[]; claimIds?: string[]; serviceSlug?: string | null; scheduledAt?: Date | null }) {
  need(canMake(actor));
  const ent = await entitlements(actor.orgId);
  const serviceSlug = input.serviceSlug ?? (["content", "social", "video", "seo"].find((s) => ent.services.has(s)) ?? "content");
  const [sources, claims] = await Promise.all([
    input.sourceIds?.length ? db.cosSource.findMany({ where: { orgId: actor.orgId, id: { in: input.sourceIds } }, select: { id: true } }) : [],
    input.claimIds?.length ? db.cosClaim.findMany({ where: { orgId: actor.orgId, id: { in: input.claimIds }, status: "approved" }, select: { id: true } }) : [],
  ]);
  return createWorkItem(actor, { // createWorkItem enforces work.manage + scope (out-of-scope ⇒ change request)
    title: input.title, type: "content", serviceSlug, riskTier: 2, campaignId: input.campaignId ?? null, goalId: input.goalId ?? null, scheduledAt: input.scheduledAt ?? null,
    payload: { kind: "master", brief: input.brief ?? "", body: input.body ?? "", pillar: input.pillar ?? null, sourceIds: sources.map((s) => s.id), claimIds: claims.map((c) => c.id), provenance: { origin: "human" } },
  });
}

const contentOf = (v: { title: string | null; body: string; parts: string[]; cta: string | null; destinationUrl: string | null; mediaAssetIds: string[] }): VariantContent => ({ title: v.title, body: v.body, parts: v.parts, cta: v.cta, destinationUrl: v.destinationUrl, mediaAssetIds: v.mediaAssetIds });

async function loadVariant(actor: WorkActor, id: string) {
  const v = await db.cosContentVariant.findFirst({ where: { id, orgId: actor.orgId }, include: { workItem: true } });
  if (!v) throw new WorkError("Variant not found.");
  if (!can(actor.role, "work.view") && v.workItem.assigneeId !== actor.userId && v.ownerId !== actor.userId) throw new WorkError("Variant not found.");
  return v;
}

export type VariantInput = { channel: string; format: string; title?: string; body?: string; parts?: string[]; cta?: string; destinationUrl?: string; mediaAssetIds?: string[]; connectionId?: string | null; clientReviewRequired?: boolean };

export async function createVariant(actor: WorkActor, masterId: string, input: VariantInput, opts: { aiDrafted?: boolean; studioDraft?: boolean } = {}) {
  need(canMake(actor) || (opts.studioDraft === true && can(actor.role, "ai.use")));
  await assertWritable(actor.orgId);
  const master = await db.cosWorkItem.findFirst({ where: { id: masterId, orgId: actor.orgId, type: "content" } });
  if (!master) throw new WorkError("Master content not found.");
  if (!formatSpec(input.channel, input.format)) throw new WorkError(`${input.channel} does not support "${input.format}".`);
  await checkLinks(actor.orgId, input);
  const content: VariantContent = { title: input.title?.trim() || null, body: input.body ?? "", parts: (input.parts ?? []).map((p) => p.trim()).filter(Boolean), cta: input.cta?.trim() || null, destinationUrl: input.destinationUrl?.trim() || null, mediaAssetIds: input.mediaAssetIds ?? [] };
  const hash = variantHash(content);
  const v = await db.cosContentVariant.create({
    data: { orgId: actor.orgId, workItemId: master.id, channel: input.channel, format: input.format, connectionId: input.connectionId ?? null, ...content, contentHash: hash, sourceVersion: master.version, clientReviewRequired: input.clientReviewRequired ?? true, ownerId: actor.userId, createdById: actor.userId, demo: master.demo },
  });
  await snapshotRevision(actor.orgId, "variant", v.id, 1, hash, { ...content, aiDrafted: opts.aiDrafted ?? false }, actor.userId);
  return v;
}

async function checkLinks(orgId: string, input: { connectionId?: string | null; mediaAssetIds?: string[]; channel?: string }) {
  if (input.connectionId) {
    const conn = await db.cosConnection.findFirst({ where: { id: input.connectionId, orgId } });
    if (!conn) throw new WorkError("Connected account not found.");
    const isTest = conn.provider === "test" && testAdapterEnabled(); // explicit test accounts stand in for any channel outside production
    if (input.channel && CHANNELS[input.channel] && conn.provider !== CHANNELS[input.channel].provider && !isTest) throw new WorkError("That account belongs to a different platform.");
  }
  if (input.mediaAssetIds?.length) {
    const n = await db.cosAsset.count({ where: { orgId, id: { in: input.mediaAssetIds }, status: { not: "archived" } } });
    if (n !== new Set(input.mediaAssetIds).size) throw new WorkError("One of the attached assets was not found in this workspace.");
  }
}

/**
 * Edit a variant. Copy / media / CTA / destination are material: version+1, a revision snapshot,
 * live approvals on THIS variant revoked, scheduled publications cancelled, state back to QA.
 * Sibling variants and the master are untouched.
 */
export async function editVariant(actor: WorkActor, id: string, patch: Partial<Omit<VariantInput, "channel" | "format">>) {
  need(canMake(actor));
  await assertWritable(actor.orgId);
  const v = await loadVariant(actor, id);
  if (["published", "cancelled"].includes(v.state)) throw new WorkError(`This variant is ${v.state} — duplicate it to make a new one.`);
  await checkLinks(actor.orgId, { ...patch, channel: v.channel });
  const next: VariantContent = {
    title: patch.title === undefined ? v.title : patch.title.trim() || null, body: patch.body ?? v.body,
    parts: patch.parts === undefined ? v.parts : patch.parts.map((p) => p.trim()).filter(Boolean), cta: patch.cta === undefined ? v.cta : patch.cta.trim() || null,
    destinationUrl: patch.destinationUrl === undefined ? v.destinationUrl : patch.destinationUrl.trim() || null, mediaAssetIds: patch.mediaAssetIds ?? v.mediaAssetIds,
  };
  const hash = variantHash(next);
  const material = hash !== v.contentHash;
  const wasSignedOff = ["client_review", "approved", "scheduled", "failed", "needs_review"].includes(v.state);
  await db.$transaction(async (tx) => {
    await tx.cosContentVariant.update({
      where: { id: v.id },
      data: { ...next, contentHash: hash, connectionId: patch.connectionId === undefined ? v.connectionId : patch.connectionId, clientReviewRequired: patch.clientReviewRequired ?? v.clientReviewRequired, version: material ? v.version + 1 : v.version, state: material && wasSignedOff ? "internal_qa" : v.state, scheduledAt: material && wasSignedOff ? null : v.scheduledAt },
    });
    if (!material) return;
    await tx.cosApproval.updateMany({ where: { orgId: actor.orgId, subject: "variant", subjectId: v.id, status: { in: ["requested", "approved", "approved_with_edits"] } }, data: { status: "revoked", reason: "Content changed after request.", decidedAt: new Date() } });
    await tx.cosPublication.updateMany({ where: { orgId: actor.orgId, variantId: v.id, status: "scheduled" }, data: { status: "cancelled", lastError: "Content changed — approval needed again." } });
    await tx.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "edit", fromState: v.state, toState: wasSignedOff ? "internal_qa" : v.state, data: JSON.stringify({ version: v.version + 1, approvalsRevoked: wasSignedOff }) } });
  });
  if (material) await snapshotRevision(actor.orgId, "variant", v.id, v.version + 1, hash, next, actor.userId);
  return { material, approvalsRevoked: material && wasSignedOff };
}

/** Reviewer has looked at a "source changed" flag and the variant still stands. Approval untouched. */
export async function acknowledgeSourceChange(actor: WorkActor, id: string) {
  need(canMake(actor) || can(actor.role, "work.review"));
  const v = await loadVariant(actor, id);
  await db.cosContentVariant.update({ where: { id: v.id }, data: { sourceChanged: false, sourceVersion: v.workItem.version } });
  await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "edit", internal: true, data: JSON.stringify({ sourceChangeReviewed: v.workItem.version }) } });
}

async function mediaFor(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const assets = await db.cosAsset.findMany({ where: { orgId, id: { in: ids } }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  return assets.map((a) => ({ id: a.id, kind: a.kind, status: a.status, durationSec: a.versions[0]?.durationSec ?? null }));
}

export async function variantCheck(orgId: string, v: { channel: string; format: string; title: string | null; body: string; parts: string[]; cta: string | null; destinationUrl: string | null; mediaAssetIds: string[] }) {
  const base = validateVariant(v.channel, v.format, contentOf(v), await mediaFor(orgId, v.mediaAssetIds));
  const claims = [v.title ?? "", v.body, ...v.parts].flatMap((t) => copyProblems(t));
  return { problems: [...base.problems, ...new Set(claims)], warnings: base.warnings };
}

/** Same copy already live or queued on the same channel → warn before it goes out twice. */
export async function duplicatesOf(orgId: string, variantId: string): Promise<{ id: string; title: string; state: string }[]> {
  const v = await db.cosContentVariant.findFirst({ where: { id: variantId, orgId } });
  if (!v) return [];
  const fp = copyFingerprint([v.body, ...v.parts].join(" "));
  if (!fp) return [];
  const others = await db.cosContentVariant.findMany({ where: { orgId, channel: v.channel, id: { not: v.id }, state: { notIn: ["cancelled"] } }, select: { id: true, body: true, parts: true, state: true, workItem: { select: { title: true } } }, take: 400, orderBy: { createdAt: "desc" } });
  return others.filter((o) => copyFingerprint([o.body, ...o.parts].join(" ")) === fp).map((o) => ({ id: o.id, title: o.workItem.title, state: o.state }));
}

const VARIANT_NEXT: Record<string, string[]> = {
  draft: ["internal_qa", "cancelled"], internal_qa: ["draft", "client_review", "approved", "cancelled"], client_review: ["cancelled"],
  approved: ["cancelled"], scheduled: ["cancelled"], failed: ["internal_qa", "cancelled"], needs_review: ["cancelled"], published: [], cancelled: [],
};

/** Staff moves. client_review → approved happens ONLY through decideVariantApproval. */
export async function moveVariant(actor: WorkActor, id: string, to: string) {
  await assertWritable(actor.orgId);
  const v = await loadVariant(actor, id);
  if (!(VARIANT_NEXT[v.state] ?? []).includes(to)) throw new WorkError(`Cannot move a ${v.state.replace(/_/g, " ")} variant to ${to.replace(/_/g, " ")}.`);
  const reviewing = v.state === "internal_qa" && (to === "client_review" || to === "approved");
  need(reviewing ? can(actor.role, "work.review") || can(actor.role, "work.manage") : canMake(actor));
  if (reviewing) {
    const check = await variantCheck(actor.orgId, v);
    if (check.problems.length) throw new WorkError(`Fix before review: ${check.problems.join(" ")}`);
    if (v.sourceChanged) throw new WorkError("The master or brief changed since this variant was written — review it against the source first.");
    if (to === "approved" && v.clientReviewRequired) throw new WorkError("This variant needs the client's approval.");
  }
  await db.$transaction([
    db.cosContentVariant.update({ where: { id: v.id }, data: { state: to } }),
    db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "transition", fromState: v.state, toState: to } }),
  ]);
  if (to === "cancelled") await db.cosPublication.updateMany({ where: { orgId: actor.orgId, variantId: v.id, status: "scheduled" }, data: { status: "cancelled", lastError: "Variant cancelled." } });
  if (to === "client_review") await requestVariantApproval(actor, v.id);
}

export async function requestVariantApproval(actor: WorkActor, id: string) {
  need(isStaffRole(actor.role));
  const v = await loadVariant(actor, id);
  const open = await db.cosApproval.findFirst({ where: { orgId: actor.orgId, subject: "variant", subjectId: v.id, version: v.version, status: "requested" } });
  if (open) return open;
  const approval = await db.cosApproval.create({
    data: { orgId: actor.orgId, workItemId: v.workItemId, subject: "variant", subjectId: v.id, version: v.version, contentHash: v.contentHash, summary: `${CHANNELS[v.channel]?.label ?? v.channel} ${v.format.replace(/_/g, " ")}: ${v.workItem.title}`.slice(0, 200), diff: JSON.stringify({ type: "variant", channel: v.channel, format: v.format, riskTier: 2 }), requestedById: actor.userId, expiresAt: new Date(Date.now() + 14 * 86_400_000) },
  });
  await notify({ orgId: actor.orgId, audience: "client", kind: "approval_requested", title: `Your decision is needed: ${approval.summary}`, href: "/app/approvals", dedupeKey: `approval:${approval.id}` });
  return approval;
}

/** Client decision on ONE variant, bound to its exact version + hash. Staff can never decide. */
export async function decideVariantApproval(actor: WorkActor, approvalId: string, decision: "approved" | "approved_with_edits" | "rejected", opts: { reason?: string; editedBody?: string } = {}) {
  need(can(actor.role, "approvals.decide"));
  await assertWritable(actor.orgId);
  const approval = await db.cosApproval.findFirst({ where: { id: approvalId, orgId: actor.orgId, subject: "variant" } });
  if (!approval) throw new WorkError("Approval not found.");
  const v = await db.cosContentVariant.findFirst({ where: { id: approval.subjectId, orgId: actor.orgId }, include: { workItem: true } });
  if (!v) throw new WorkError("Variant not found.");
  if (!canDecideApproval(approval.status, decision)) throw new WorkError(`This request is already ${approval.status}.`);
  if (approval.expiresAt && approval.expiresAt < new Date()) {
    await db.cosApproval.update({ where: { id: approval.id }, data: { status: "expired", decidedAt: new Date() } });
    throw new WorkError("This approval request expired — ask for a fresh one.");
  }
  if (approval.version !== v.version || approval.contentHash !== v.contentHash) throw new WorkError("The variant changed after this request — a fresh approval is needed.");
  if (decision === "rejected" && !opts.reason?.trim()) throw new WorkError("A reason is required to reject.");
  if (decision === "approved_with_edits" && !opts.editedBody?.trim()) throw new WorkError("Provide the edited version.");

  let hash = v.contentHash, version = v.version, diff = approval.diff;
  await db.$transaction(async (tx) => {
    if (decision === "approved_with_edits") {
      const after = { ...contentOf(v), body: opts.editedBody! };
      hash = variantHash(after); version = v.version + 1;
      diff = JSON.stringify({ ...(JSON.parse(approval.diff ?? "{}") as object), before: { body: v.body }, after: { body: after.body } });
      await tx.cosContentVariant.update({ where: { id: v.id }, data: { body: after.body, contentHash: hash, version } });
    }
    await tx.cosApproval.update({ where: { id: approval.id }, data: { status: decision, decidedById: actor.userId, decidedAt: new Date(), reason: opts.reason?.trim() || null, contentHash: hash, version, diff } });
    const next = decision === "rejected" ? "draft" : "approved";
    await tx.cosContentVariant.update({ where: { id: v.id }, data: { state: next } });
    await tx.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "approval", fromState: v.state, toState: next, data: JSON.stringify({ approvalId: approval.id, status: decision, version, reason: opts.reason?.trim() }) } });
  });
  await db.cosNotification.updateMany({ where: { dedupeKey: `approval:${approval.id}`, readAt: null }, data: { readAt: new Date() } });
  if (decision === "approved_with_edits") await snapshotRevision(actor.orgId, "variant", v.id, version, hash, { ...contentOf(v), body: opts.editedBody, editedByClient: true }, actor.userId);
  if (decision === "rejected") await notify({ orgId: actor.orgId, userId: v.ownerId, audience: "staff", kind: "revision_requested", title: `Revision requested: ${approval.summary}`, body: opts.reason ?? null, href: `/app/content/${v.workItemId}`, dedupeKey: `revision:${approval.id}` });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `approval.${decision}`, entity: "CosApproval", entityId: approval.id, data: { variantId: v.id, version } });
}

/** The approval that currently covers this exact variant version, if any. */
export const currentVariantApproval = (orgId: string, variantId: string, version: number) =>
  db.cosApproval.findFirst({ where: { orgId, subject: "variant", subjectId: variantId, version }, orderBy: { createdAt: "desc" } });

export async function commentOnVariant(actor: WorkActor, id: string, text: string, internal: boolean) {
  const v = await loadVariant(actor, id);
  if (!text.trim()) throw new WorkError("Write something first.");
  // clients can never post (or see) internal notes
  await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "comment", internal: isStaffRole(actor.role) && internal, data: JSON.stringify({ text: text.trim().slice(0, 4000) }) } });
}

/** Bulk move. Each variant passes its OWN checks; failures are reported, never forced. */
export async function bulkMoveVariants(actor: WorkActor, ids: string[], to: string) {
  const done: string[] = [], failed: { id: string; reason: string }[] = [];
  for (const id of [...new Set(ids)].slice(0, 100)) {
    try { await moveVariant(actor, id, to); done.push(id); }
    catch (e) { if (!(e instanceof WorkError)) throw e; failed.push({ id, reason: e.message }); }
  }
  return { done, failed };
}

/** Link exactly as it will be published (stable ids). Null when the variant has no destination. */
export async function publishLink(orgId: string, v: { id: string; channel: string; destinationUrl: string | null; workItemId: string }): Promise<string | null> {
  if (!v.destinationUrl) return null;
  const item = await db.cosWorkItem.findFirst({ where: { id: v.workItemId, orgId }, select: { campaignId: true } });
  const camp = item?.campaignId ? await db.cosCampaign.findFirst({ where: { id: item.campaignId, orgId }, select: { code: true, paidMode: true } }) : null;
  const tagged = camp ? taggedUrl(v.destinationUrl, { campaignCode: camp.code, channel: v.channel, variantId: v.id, paid: camp.paidMode === "paid" }) : v.destinationUrl;
  // WP-05: the published link is a short link (/l/:code) so clicks are counted; the tagged destination is what it opens
  const { shortLinkForVariant, shortUrl } = await import("./links");
  return shortUrl((await shortLinkForVariant(orgId, v.id, tagged)).code);
}
