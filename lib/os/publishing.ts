// Publisher (GrowthOS v2, brief §H). A CosPublication is ONE intended publication of ONE variant
// version to ONE account. Everything external happens in executePublication, which:
//   1. claims the row atomically (scheduled → claimed) so two workers can never both publish,
//   2. re-validates at publish time: approval (version + hash), content, entitlement, access mode,
//      kill switch (gateAction) and the account connection,
//   3. calls the adapter and records an append-only attempt,
//   4. retries ONLY failures the provider refused before acting (429/503), at most MAX_ATTEMPTS,
//   5. parks ambiguous outcomes as "uncertain" for a person to reconcile — never auto-retried,
//   6. keeps the ids of parts already posted so a resumed thread never re-posts them.
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { decryptField } from "@/lib/leados/crypto";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { assertWritable, WorkError, type WorkActor } from "./work";
import { gateAction } from "./workflow";
import { entitlements } from "./entitlements";
import { AdapterError, adapterFor, type PublishResult } from "./adapters";
import { CHANNELS, renderBody } from "./channels";
import { currentVariantApproval, publishLink, variantCheck } from "./content";
import { mediaForPublish } from "./assets";
import { zonedToUtc } from "./time";
import { notify } from "./notify";

export const MAX_ATTEMPTS = 4;
export const PUBLISH_JOB = "os.publish";
const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000; // 2, 4, 8 min

const parse = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

/** Provider access token for a connection, refreshed when the provider supports it. */
async function tokenFor(conn: { id: string; orgId: string; provider: string; accessTokenEnc: string | null }): Promise<string> {
  if (conn.provider === "test") return "test-token";
  if (!conn.accessTokenEnc) throw new AdapterError("The account is not connected.", "definite");
  if (["gsc", "linkedin", "x", "youtube"].includes(conn.provider)) {
    const { accessToken } = await import("./connectors");
    try { return await accessToken(conn.orgId, (conn.provider === "youtube" ? "youtube" : conn.provider) as never, conn.id); }
    catch (e) { throw new AdapterError((e as Error).message, "definite"); }
  }
  return decryptField(conn.accessTokenEnc); // meta page tokens, wordpress basic credential
}

// ── schedule / cancel / reschedule ───────────────────────────────────────────

/**
 * Schedule an APPROVED variant. `localTime` is wall-clock time in `timezone` (the workspace zone by
 * default); it is stored as UTC. DST gaps/overlaps are resolved explicitly and reported back.
 * One live publication per variant version (idempotencyKey) — scheduling twice returns the first.
 */
export async function schedulePublication(actor: WorkActor, variantId: string, opts: { localTime?: string; timezone?: string; now?: boolean }) {
  if (!can(actor.role, "work.execute") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const v = await db.cosContentVariant.findFirst({ where: { id: variantId, orgId: actor.orgId } });
  if (!v) throw new WorkError("Variant not found.");
  if (!["approved", "failed"].includes(v.state)) throw new WorkError("Only an approved variant can be scheduled.");
  const ent = await entitlements(actor.orgId);
  const tz = opts.timezone || ent.timezone;
  let when = new Date(), note: string | null = null;
  if (!opts.now) {
    if (!opts.localTime) throw new WorkError("Pick a date and time.");
    const z = zonedToUtc(opts.localTime, tz);
    when = z.utc; note = z.note;
    if (when.getTime() < Date.now() - 60_000) throw new WorkError("That time is in the past.");
  }
  const pre = await preflight(actor.orgId, v);
  if (!pre.ok) throw new WorkError(pre.reason);
  const key = `${v.id}:v${v.version}`;
  const existing = await db.cosPublication.findUnique({ where: { idempotencyKey: key } });
  if (existing && !["cancelled", "failed"].includes(existing.status)) throw new WorkError(existing.status === "published" ? "This version is already published." : `This version is already ${existing.status}.`);
  const data = { status: "scheduled", scheduledAt: when, timezone: tz, connectionId: v.connectionId, contentHash: v.contentHash, adapter: pre.adapterKind, partsTotal: v.format === "thread" ? v.parts.length : 1, nextAttemptAt: null, lastError: null, attemptCount: existing?.status === "failed" ? 0 : existing?.attemptCount ?? 0 };
  const pub = existing
    ? await db.cosPublication.update({ where: { id: existing.id }, data })
    : await db.cosPublication.create({ data: { ...data, orgId: actor.orgId, variantId: v.id, channel: v.channel, variantVersion: v.version, idempotencyKey: key, createdById: actor.userId } });
  await db.$transaction([
    db.cosContentVariant.update({ where: { id: v.id }, data: { state: "scheduled", scheduledAt: when } }),
    db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "execution", fromState: v.state, toState: "scheduled", data: JSON.stringify({ publicationId: pub.id, scheduledAt: when.toISOString(), timezone: tz, dst: note }) } }),
  ]);
  await enqueueJob({ type: PUBLISH_JOB, payload: { publicationId: pub.id }, runAt: when, idempotencyKey: `${PUBLISH_JOB}:${pub.id}:${pub.attemptCount}:${when.getTime()}`, maxAttempts: 1 });
  return { publication: pub, dstNote: note };
}

export async function cancelPublication(actor: WorkActor, publicationId: string, reason = "Cancelled.") {
  if (!can(actor.role, "work.execute") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  // conditional update: a publication a worker has already claimed cannot be cancelled from under it
  const r = await db.cosPublication.updateMany({ where: { id: publicationId, orgId: actor.orgId, status: "scheduled" }, data: { status: "cancelled", lastError: reason.slice(0, 300) } });
  if (r.count !== 1) throw new WorkError("This publication is no longer waiting — it cannot be cancelled.");
  const pub = await db.cosPublication.findUniqueOrThrow({ where: { id: publicationId } });
  await db.cosContentVariant.updateMany({ where: { id: pub.variantId, orgId: actor.orgId, state: "scheduled" }, data: { state: "approved", scheduledAt: null } });
}

export async function reschedulePublication(actor: WorkActor, publicationId: string, localTime: string, timezone?: string) {
  const pub = await db.cosPublication.findFirst({ where: { id: publicationId, orgId: actor.orgId } });
  if (!pub) throw new WorkError("Publication not found.");
  await cancelPublication(actor, publicationId, "Rescheduled.");
  return schedulePublication(actor, pub.variantId, { localTime, timezone: timezone ?? pub.timezone });
}

// ── publish-time validation ──────────────────────────────────────────────────

type Pre = { ok: true; adapterKind: "live" | "test" } | { ok: false; reason: string; retry?: boolean };

async function preflight(orgId: string, v: { id: string; channel: string; format: string; version: number; contentHash: string; connectionId: string | null; clientReviewRequired: boolean; workItemId: string; title: string | null; body: string; parts: string[]; cta: string | null; destinationUrl: string | null; mediaAssetIds: string[]; sourceChanged: boolean }): Promise<Pre> {
  const [ent, ws, approval] = await Promise.all([entitlements(orgId), db.cosWorkspace.findUnique({ where: { orgId } }), currentVariantApproval(orgId, v.id, v.version)]);
  if (ent.accessMode !== "active") return { ok: false, reason: "The workspace is in handover (read-only)." };
  if (!ent.modules.has("content")) return { ok: false, reason: "Content is no longer in this workspace's scope." };
  const gate = gateAction({ tier: 2, killSwitch: ws?.killSwitch ?? false, currentHash: v.contentHash, approval, autonomyEnabled: !v.clientReviewRequired });
  if (!gate.allowed) return { ok: false, reason: gate.reason };
  const check = await variantCheck(orgId, v);
  if (check.problems.length) return { ok: false, reason: check.problems.join(" ") };
  if (!v.connectionId) return { ok: false, reason: "Choose the account to publish to." };
  const conn = await db.cosConnection.findFirst({ where: { id: v.connectionId, orgId } });
  if (!conn) return { ok: false, reason: "The connected account no longer exists." };
  if (conn.status !== "verified") return { ok: false, reason: `The ${CHANNELS[v.channel]?.label ?? v.channel} account is ${conn.status} — reconnect it in Settings.` };
  if (!conn.capabilities.includes("publish")) return { ok: false, reason: conn.eligibilityNote ?? "This account is connected but cannot publish (missing permission)." };
  const adapter = adapterFor(conn.provider, v.channel);
  if (!adapter) return { ok: false, reason: `Publishing to ${CHANNELS[v.channel]?.label ?? v.channel} is not available — publish manually and record the link.` };
  if (!adapter.formats.includes(v.format)) return { ok: false, reason: `The ${v.format.replace(/_/g, " ")} format cannot be published automatically — publish manually and record the link.` };
  return { ok: true, adapterKind: conn.provider === "test" ? "test" : "live" };
}

// ── execute ──────────────────────────────────────────────────────────────────

const attempt = (orgId: string, publicationId: string, n: number, outcome: string, error?: string | null, httpStatus?: number | null) =>
  db.cosPublishAttempt.create({ data: { orgId, publicationId, n, outcome, error: error?.slice(0, 300) ?? null, httpStatus: httpStatus ?? null, finishedAt: new Date() } });

// Uploads made for a publication are remembered across its (bounded: MAX_ATTEMPTS) retries, so "LinkedIn is still
// processing" or an X 429 never causes a second upload. A ref older than 20 h is dropped (X forgets media after 24 h)
// and the file is uploaded afresh — once per attempt at most, and the attempts themselves are capped.
const MEDIA_REF_MAX_AGE_MS = 20 * 3_600_000;
type StoredRefs = Record<string, { id: string; at: string }>;
export function liveMediaRefs(json: string | null, now = Date.now()): Record<string, string> {
  const stored = parse<StoredRefs>(json, {});
  return Object.fromEntries(Object.entries(stored).filter(([, r]) => r?.id && now - new Date(r.at).getTime() < MEDIA_REF_MAX_AGE_MS).map(([k, r]) => [k, r.id]));
}
export function mergeMediaRefs(json: string | null, fresh: Record<string, string>, now = new Date()): string {
  const stored = parse<StoredRefs>(json, {});
  for (const [k, id] of Object.entries(fresh)) if (stored[k]?.id !== id) stored[k] = { id, at: now.toISOString() };
  return JSON.stringify(stored);
}

export async function executePublication(publicationId: string): Promise<string> {
  // 1. atomic claim — only a due, scheduled row can be claimed, and only once
  const claim = await db.cosPublication.updateMany({ where: { id: publicationId, status: "scheduled", scheduledAt: { lte: new Date(Date.now() + 5_000) } }, data: { status: "claimed", claimedAt: new Date(), attemptCount: { increment: 1 } } });
  if (claim.count !== 1) return "skipped";
  const pub = await db.cosPublication.findUniqueOrThrow({ where: { id: publicationId }, include: { variant: true } });
  const v = pub.variant, orgId = pub.orgId, n = pub.attemptCount;

  const fail = async (status: "failed" | "uncertain" | "partial", outcome: string, message: string, http?: number, partIds: string[] = pub.partExternalIds) => {
    await db.$transaction([
      // a terminal outcome forgets remembered uploads: if a person reschedules, the file is uploaded afresh rather than trusting a stale provider id
      db.cosPublication.update({ where: { id: pub.id }, data: { status, lastError: message.slice(0, 300), partExternalIds: partIds, partsDone: partIds.length, providerMedia: null } }),
      db.cosContentVariant.update({ where: { id: v.id }, data: { state: status === "failed" ? "failed" : "needs_review" } }),
      db.cosWorkEvent.create({ data: { orgId, workItemId: v.workItemId, variantId: v.id, actorType: "system", kind: "execution", toState: status, data: JSON.stringify({ publicationId: pub.id, outcome, message: message.slice(0, 300) }) } }),
    ]);
    await attempt(orgId, pub.id, n, outcome, message, http);
    await notify({ orgId, userId: v.ownerId, audience: "staff", kind: status === "failed" ? "publish_failed" : "publish_uncertain", title: status === "failed" ? `Publishing failed: ${CHANNELS[v.channel]?.label ?? v.channel}` : `Check ${CHANNELS[v.channel]?.label ?? v.channel}: publishing outcome unknown`, body: message.slice(0, 300), href: `/app/content/${v.workItemId}`, dedupeKey: `pub:${pub.id}:${n}:${status}` });
    return status;
  };

  // 2. revalidate everything NOW — the world may have changed since scheduling
  if (v.version !== pub.variantVersion || v.contentHash !== pub.contentHash) return fail("failed", "blocked", "The content changed after it was scheduled — it needs approval again.");
  const pre = await preflight(orgId, v);
  if (!pre.ok) return fail("failed", "blocked", pre.reason);

  const conn = await db.cosConnection.findFirstOrThrow({ where: { id: v.connectionId!, orgId } });
  const adapter = adapterFor(conn.provider, v.channel)!;
  let result: PublishResult;
  try {
    const link = await publishLink(orgId, v);
    const content = { title: v.title, body: v.body, parts: v.parts, cta: v.cta, destinationUrl: v.destinationUrl, mediaAssetIds: v.mediaAssetIds };
    const parts = v.format === "thread" ? v.parts.map((p, i) => (i === v.parts.length - 1 && link ? `${p}\n\n${link}` : p)) : [];
    result = await adapter.publish({
      token: await tokenFor(conn), account: { externalAccountId: conn.externalAccountId, accountType: conn.accountType, config: parse<Record<string, unknown>>(conn.config, {}) },
      format: v.format, title: v.title, text: renderBody(v.channel, v.format, content, link), parts, media: await mediaForPublish(orgId, v.mediaAssetIds), donePartIds: pub.partExternalIds, mediaRefs: liveMediaRefs(pub.providerMedia),
    });
  } catch (e) {
    if (!(e instanceof AdapterError)) return fail("uncertain", "uncertain", `Unexpected error while publishing: ${(e as Error).message}`.slice(0, 300));
    const done = e.partIds.length ? e.partIds : pub.partExternalIds;
    // some parts are live: never start over. A person decides whether to resume or finish by hand.
    if (done.length > 0 && e.kind !== "retryable") return fail(e.kind === "uncertain" ? "uncertain" : "partial", e.kind === "uncertain" ? "uncertain" : "partial", `${done.length} of ${pub.partsTotal} part(s) are live. ${e.message}`, e.httpStatus, done);
    if (e.kind === "uncertain") return fail("uncertain", "uncertain", `${e.message} The post may or may not be live — check the account before doing anything else.`, e.httpStatus);
    if (e.kind === "retryable" && n < MAX_ATTEMPTS) {
      const next = new Date(Date.now() + backoffMs(n));
      await db.cosPublication.update({ where: { id: pub.id }, data: { status: "scheduled", scheduledAt: next, nextAttemptAt: next, lastError: e.message.slice(0, 300), partExternalIds: done, partsDone: done.length, providerMedia: mergeMediaRefs(pub.providerMedia, e.mediaRefs) } });
      await attempt(orgId, pub.id, n, "retryable_failure", e.message, e.httpStatus);
      await enqueueJob({ type: PUBLISH_JOB, payload: { publicationId: pub.id }, runAt: next, idempotencyKey: `${PUBLISH_JOB}:${pub.id}:${n}:${next.getTime()}`, maxAttempts: 1 });
      return "retry_scheduled";
    }
    return fail("failed", e.kind === "retryable" ? "retryable_failure" : "definite_failure", e.kind === "retryable" ? `${e.message} Gave up after ${n} attempts.` : e.message, e.httpStatus);
  }

  // 3. success — recorded exactly once
  const now = new Date();
  await db.$transaction([
    db.cosPublication.update({ where: { id: pub.id }, data: { status: "published", publishedAt: now, externalId: result.externalId, externalUrl: result.externalUrl, partExternalIds: result.partIds, partsDone: result.partIds.length, lastError: null, nextAttemptAt: null } }),
    db.cosContentVariant.update({ where: { id: v.id }, data: { state: "published" } }),
    db.cosWorkEvent.create({ data: { orgId, workItemId: v.workItemId, variantId: v.id, actorType: "system", kind: "execution", toState: "published", data: JSON.stringify({ publicationId: pub.id, channel: v.channel, externalId: result.externalId, adapter: pub.adapter }) } }),
  ]);
  await attempt(orgId, pub.id, n, "success");
  if (pub.adapter === "live") await db.cosConnection.update({ where: { id: conn.id }, data: { liveVerifiedAt: now } });
  await logLosAudit({ orgId, actorType: "system", action: "variant.published", entity: "CosPublication", entityId: pub.id, data: { channel: v.channel, adapter: pub.adapter } });
  await markMasterDelivered(orgId, v.workItemId);
  return "published";
}

/** The master is delivered once every live variant is out (published or cancelled). */
async function markMasterDelivered(orgId: string, workItemId: string) {
  const open = await db.cosContentVariant.count({ where: { orgId, workItemId, state: { notIn: ["published", "cancelled"] } } });
  if (open > 0) return;
  const item = await db.cosWorkItem.findFirst({ where: { id: workItemId, orgId } });
  if (!item || ["delivered", "verified", "closed", "cancelled"].includes(item.state)) return;
  await db.$transaction([
    db.cosWorkItem.update({ where: { id: item.id }, data: { state: "delivered", deliveredAt: item.deliveredAt ?? new Date() } }),
    db.cosWorkEvent.create({ data: { orgId, workItemId: item.id, actorType: "system", kind: "transition", fromState: item.state, toState: "delivered", data: JSON.stringify({ note: "All channel variants published" }) } }),
  ]);
}

// ── people: reconcile, resume, manual evidence ───────────────────────────────

/** A person checked the account after an uncertain / partial outcome and says what is actually true. */
export async function reconcilePublication(actor: WorkActor, publicationId: string, verdict: "live" | "not_live", evidence: { externalUrl?: string; note?: string }) {
  if (!isStaffRole(actor.role) || !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  const pub = await db.cosPublication.findFirst({ where: { id: publicationId, orgId: actor.orgId, status: { in: ["uncertain", "partial"] } }, include: { variant: true } });
  if (!pub) throw new WorkError("Nothing to reconcile.");
  if (verdict === "live") {
    if (!evidence.externalUrl || !/^https:\/\//i.test(evidence.externalUrl)) throw new WorkError("Paste the link to the live post as evidence.");
    await db.$transaction([
      db.cosPublication.update({ where: { id: pub.id }, data: { status: "published", publishedAt: new Date(), externalUrl: evidence.externalUrl, evidenceNote: `Confirmed live by a team member. ${evidence.note ?? ""}`.slice(0, 300), lastError: null } }),
      db.cosContentVariant.update({ where: { id: pub.variantId }, data: { state: "published" } }),
    ]);
    await markMasterDelivered(actor.orgId, pub.variant.workItemId);
  } else {
    if (pub.partExternalIds.length > 0) throw new WorkError("Some parts are live. Finish the thread by hand on the platform, then mark it live with the link.");
    // confirmed absent → safe to let a person schedule it again (a NEW claim, same idempotency key reused)
    await db.$transaction([
      db.cosPublication.update({ where: { id: pub.id }, data: { status: "failed", lastError: `Confirmed not live by a team member. ${evidence.note ?? ""}`.slice(0, 300) } }),
      db.cosContentVariant.update({ where: { id: pub.variantId }, data: { state: "failed" } }),
    ]);
  }
  await attempt(actor.orgId, pub.id, pub.attemptCount, verdict === "live" ? "success" : "definite_failure", `Reconciled by a person: ${verdict}`);
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "publication.reconciled", entity: "CosPublication", entityId: pub.id, data: { verdict } });
}

/**
 * Channels without an adapter (or a client who posts themselves): record the publication honestly as
 * MANUAL with the live link as evidence. Approval is still required — manual is not a bypass.
 */
export async function recordManualPublication(actor: WorkActor, variantId: string, externalUrl: string, note?: string) {
  if (!can(actor.role, "work.execute") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const v = await db.cosContentVariant.findFirst({ where: { id: variantId, orgId: actor.orgId } });
  if (!v) throw new WorkError("Variant not found.");
  if (!["approved", "failed", "needs_review"].includes(v.state)) throw new WorkError("Only an approved variant can be recorded as published.");
  if (!/^https:\/\//i.test(externalUrl)) throw new WorkError("Paste the https link to the live post.");
  const [ws, approval] = await Promise.all([db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } }), currentVariantApproval(actor.orgId, v.id, v.version)]);
  const gate = gateAction({ tier: 2, killSwitch: false, currentHash: v.contentHash, approval, autonomyEnabled: !v.clientReviewRequired });
  if (!gate.allowed) throw new WorkError(gate.reason);
  const key = `${v.id}:v${v.version}`;
  const existing = await db.cosPublication.findUnique({ where: { idempotencyKey: key } });
  if (existing?.status === "published") throw new WorkError("This version is already recorded as published.");
  const data = { status: "published", adapter: "manual", publishedAt: new Date(), externalUrl, evidenceNote: (note ?? "Published by hand; link recorded as evidence.").slice(0, 300), scheduledAt: new Date(), timezone: ws?.timezone ?? "UTC", contentHash: v.contentHash, lastError: null };
  const pub = existing ? await db.cosPublication.update({ where: { id: existing.id }, data }) : await db.cosPublication.create({ data: { ...data, orgId: actor.orgId, variantId: v.id, channel: v.channel, variantVersion: v.version, idempotencyKey: key, connectionId: v.connectionId, createdById: actor.userId } });
  await db.$transaction([
    db.cosContentVariant.update({ where: { id: v.id }, data: { state: "published" } }),
    db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: v.workItemId, variantId: v.id, actorId: actor.userId, actorType: "user", kind: "execution", toState: "published", data: JSON.stringify({ publicationId: pub.id, manual: true }) } }),
  ]);
  await markMasterDelivered(actor.orgId, v.workItemId);
  return pub;
}

// ── scheduler glue ───────────────────────────────────────────────────────────

registerJobHandler(PUBLISH_JOB, async (payload) => { await executePublication((payload as { publicationId: string }).publicationId); });

/** Sweep: anything due that has no pending job (missed tick, restarted worker) is published now. Claims make this safe. */
export async function runDuePublications(now = new Date(), limit = 25): Promise<number> {
  const due = await db.cosPublication.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: limit, select: { id: true } });
  let n = 0;
  for (const p of due) if ((await executePublication(p.id)) !== "skipped") n++;
  // a worker that died mid-publish leaves a "claimed" row: the outcome is unknown → a person reconciles it
  const stuck = await db.cosPublication.findMany({ where: { status: "claimed", claimedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, include: { variant: { select: { workItemId: true, ownerId: true } } }, take: 25 });
  for (const s of stuck) {
    const r = await db.cosPublication.updateMany({ where: { id: s.id, status: "claimed" }, data: { status: "uncertain", lastError: "Publishing was interrupted — check the account before doing anything else." } });
    if (r.count !== 1) continue;
    await db.cosContentVariant.updateMany({ where: { id: s.variantId }, data: { state: "needs_review" } });
    await notify({ orgId: s.orgId, userId: s.variant.ownerId, audience: "staff", kind: "publish_uncertain", title: "Publishing was interrupted — outcome unknown", href: `/app/content/${s.variant.workItemId}`, dedupeKey: `pub:${s.id}:stuck` });
  }
  return n;
}
