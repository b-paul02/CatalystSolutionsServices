// WP-19 · plan → calendar → production. Every calendar item has a format from the enum; each format has a recipe that
// runs as a job (≤ 60 s per step) and lands its output as a DRAFT on the work item with provenance. Validators failing
// = no draft, event logged. Nothing here advances a work item past draft: QA, client review, approval and publishing
// are untouched. Text is Catalyst-internal metering; images use the client wallet only with a CosAiBillingAuth, else
// the built-in next/og template (and the item says so).
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { logLosAudit } from "@/lib/leados/audit";
import { aiAvailable, aiModel, draftContent, seoBrief, unsupportedClaims, tenantContext } from "./ai";
import { activeRateCard, priceMax, release, reserve, settle } from "./credits";
import { imageGenStatus, renderImage } from "./imagegen";
import { uploadAsset } from "./assets";
import { renderTemplate } from "./graphics";
import { flagOn } from "./flags";
import { brandProblems, getBrandRules } from "./brand";
import { notify } from "./notify";
import { periodBounds } from "./time";
import { assertWritable, WorkError, type WorkActor } from "./work";

export const PRODUCE_JOB = "os.content_produce";
export const FORMATS = ["text_post", "thread", "carousel", "image_post", "blog", "email", "reel", "short", "video"] as const;
export type Format = (typeof FORMATS)[number];
export const isFormat = (f: string): f is Format => (FORMATS as readonly string[]).includes(f);
export const VIDEO_FORMATS: readonly Format[] = ["reel", "short", "video"];
export const IMAGE_FORMATS: readonly Format[] = ["image_post", "carousel"];

export type ProductionStatus = "queued" | "drafting" | "draft_ready" | "failed" | "needs_asset";
export type Production = { status: ProductionStatus; version: number; startedAt?: string; finishedAt?: string; reason?: string; imageSource?: "provider" | "template"; note?: string; assetIds?: string[]; actorId?: string };

type Payload = Record<string, unknown> & { format?: string; channel?: string; hook?: string; persona?: string; cta?: string; body?: string; production?: Production };
const parse = (s: string | null): Payload => { try { return s ? (JSON.parse(s) as Payload) : {}; } catch { return {}; } };

export const productionOf = (payload: string | null): Production | null => parse(payload).production ?? null;

async function setProduction(itemId: string, patch: Partial<Production>, extra: Record<string, unknown> = {}) {
  const item = await db.cosWorkItem.findUniqueOrThrow({ where: { id: itemId }, select: { payload: true, version: true } });
  const p = parse(item.payload);
  const production: Production = { status: "queued", version: item.version, ...(p.production ?? {}), ...patch };
  await db.cosWorkItem.update({ where: { id: itemId }, data: { payload: JSON.stringify({ ...p, ...extra, production }) } });
  return production;
}

/** Credits one image costs on the active rate card (client wallet path), or null when unpriced. */
export async function imageCredits(): Promise<number | null> {
  const card = await activeRateCard();
  const rate = card?.rates.image;
  return rate ? priceMax(rate, 1) : null;
}

/** Queue production for one item. Idempotent per (item, version). Staff only; read-only workspaces refused. */
export async function enqueueProduce(actor: WorkActor, itemId: string): Promise<{ queued: boolean; reason?: string }> {
  if (!isStaffRole(actor.role) || !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  if (!(await flagOn("content_produce", actor.orgId))) throw new WorkError("Content production is switched off by the Catalyst team at the moment.");
  if (!aiAvailable()) throw new WorkError("AI is not configured (LLM_API_KEY).");
  const item = await db.cosWorkItem.findFirst({ where: { id: itemId, orgId: actor.orgId, type: "content" } });
  if (!item) throw new WorkError("Content item not found.");
  const p = parse(item.payload);
  if (!p.format || !isFormat(p.format)) return { queued: false, reason: `"${p.format ?? "none"}" is not a production format (${FORMATS.join(", ")}).` };
  if (["closed", "cancelled"].includes(item.state)) return { queued: false, reason: "Item is closed." };
  if (p.production?.status === "drafting" && p.production.version === item.version) return { queued: false, reason: "Already drafting." };
  await setProduction(item.id, { status: "queued", version: item.version, actorId: actor.userId, reason: undefined, startedAt: undefined, finishedAt: undefined });
  await enqueueJob({ type: PRODUCE_JOB, payload: { itemId: item.id, version: item.version, actor }, idempotencyKey: `item:${item.id}:${item.version}`, maxAttempts: 2 });
  return { queued: true };
}

/** "Produce all drafts": every content item in the window with a production format and no body yet. Returns the quote. */
export async function enqueueProduceAll(actor: WorkActor, opts: { planId?: string | null; start?: Date; end?: Date } = {}) {
  if (!isStaffRole(actor.role) || !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  const items = await db.cosWorkItem.findMany({ where: { orgId: actor.orgId, type: "content", state: { notIn: ["closed", "cancelled"] }, ...(opts.planId ? { planId: opts.planId } : {}), ...(opts.start && opts.end ? { scheduledAt: { gte: opts.start, lt: opts.end } } : {}) }, take: 60 });
  const todo = items.filter((i) => { const p = parse(i.payload); return p.format && isFormat(p.format) && !(p.body && String(p.body).trim()) && p.production?.status !== "draft_ready"; });
  const perImage = await imageCredits();
  const images = todo.reduce((a, i) => a + ((): number => { const p = parse(i.payload); return p.format === "carousel" ? 3 : p.format === "image_post" ? 1 : 0; })(), 0);
  let queued = 0;
  for (const i of todo) { const r = await enqueueProduce(actor, i.id); if (r.queued) queued++; }
  return { queued, images, quoteCredits: perImage === null ? null : images * perImage };
}

// ── recipes ──────────────────────────────────────────────────────────────────

async function draftText(orgId: string, item: { title: string }, p: Payload, notes = "") {
  const d = await draftContent(orgId, { channel: p.channel ?? "linkedin", topic: item.title, hook: p.hook, persona: p.persona, format: p.format, cta: p.cta, notes });
  const ctx = await tenantContext(orgId);
  // banned claims reject the draft; numbers/superlatives without a source are FLAGS the editor resolves (as in draftVariants)
  const flags = [...d.expertiseFlags, ...unsupportedClaims(d.body, ctx.grounding).map((s) => `Needs a source or an approved claim: "${s.slice(0, 140)}"`), ...brandProblems(d.body, await getBrandRules(orgId))];
  return { body: d.body, meta: d.meta, flags, problems: d.problems };
}

/** One image: client wallet (needs a live CosAiBillingAuth + provider), else the built-in template. Never Catalyst-paid provider images here. */
async function makeImage(actor: WorkActor, item: { id: string; orgId: string; title: string }, fields: { title: string; body: string; index?: number; total?: number }, template: "quote_card" | "carousel_slide"): Promise<{ assetId: string; source: "provider" | "template"; note: string }> {
  const [auth, price, ws] = await Promise.all([
    db.cosAiBillingAuth.findFirst({ where: { orgId: item.orgId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    imageCredits(),
    db.cosWorkspace.findUnique({ where: { orgId: item.orgId }, select: { brandProfile: true, timezone: true } }),
  ]);
  const brand = ws?.brandProfile ? (JSON.parse(ws.brandProfile) as { brand?: string; color?: string }) : {};
  const org = await db.losOrg.findUnique({ where: { id: item.orgId }, select: { name: true } });
  if (auth && price !== null && imageGenStatus().ready) {
    const operationId = `produce:${item.id}:${Date.now().toString(36)}`;
    try {
      await db.$transaction((tx) => reserve(tx, { orgId: item.orgId, userId: actor.userId, operationId, amount: price, periodStart: periodBounds("month", ws?.timezone ?? "UTC").start, billingAuthId: auth.id }));
    } catch (e) { return fallback(`${(e as Error).message} — the built-in template was used instead.`); }
    try {
      const bytes = await renderImage(`${fields.title}. ${fields.body}`.slice(0, 1500));
      const asset = await uploadAsset(actor, { name: `${item.title.slice(0, 60)} — image${fields.index ? ` ${fields.index}` : ""}.png`, mime: "image/png", bytes, category: "production", origin: "ai_generated", clientVisible: false, workItemId: item.id, sourceNote: `Generated by the image provider for the content pipeline (client credits, authorised).`, rightsNote: "AI generated — review the provider’s terms before commercial use." });
      await db.$transaction((tx) => settle(tx, { operationId, credits: price, reason: `Content pipeline image: ${item.title.slice(0, 80)}`, billingAuthId: auth.id }));
      await db.cosAiUsage.create({ data: { orgId: item.orgId, feature: "content_pipeline.image", modality: "image", model: imageGenStatus().provider, units: 1, costMicros: null, ok: true, workItemId: item.id, userId: actor.userId, payer: "client_wallet", billingPurpose: "staff_assisted_client_billed" } });
      return { assetId: asset.id, source: "provider", note: `Image generated with the provider on the client's credits (${price} credits, authorised).` };
    } catch (e) {
      await db.$transaction((tx) => release(tx, { operationId, reason: `Image not produced: ${(e as Error).message.slice(0, 120)}`, billingAuthId: auth.id })).catch(() => undefined);
      return fallback(`Provider image failed (${(e as Error).message.slice(0, 80)}); the built-in template was used instead — no credits charged.`);
    }
  }
  return fallback(auth ? "Image provider or pricing is not set up; the built-in template was used." : "No client authorisation for image credits; the built-in template was used (no credits charged).");

  async function fallback(note: string) {
    const bytes = await renderTemplate(template, { title: fields.title, body: fields.body, brand: org?.name ?? "", color: brand.color, index: fields.index, total: fields.total });
    const asset = await uploadAsset(actor, { name: `${item.title.slice(0, 60)} — template${fields.index ? ` ${fields.index}` : ""}.png`, mime: "image/png", bytes, category: "production", origin: "ai_generated", clientVisible: false, workItemId: item.id, sourceNote: "Rendered from the built-in graphic template (no image provider, no credits)." });
    return { assetId: asset.id, source: "template" as const, note };
  }
}

/** The job. Reads the item at the queued version; a newer version means the work is stale and is skipped. */
export async function produceItem(itemId: string, version: number, actor: WorkActor): Promise<void> {
  const item = await db.cosWorkItem.findFirst({ where: { id: itemId, orgId: actor.orgId, type: "content" } });
  if (!item || item.version !== version) return;
  const p = parse(item.payload);
  const format = p.format && isFormat(p.format) ? p.format : null;
  if (!format) return;
  await setProduction(item.id, { status: "drafting", startedAt: new Date().toISOString() });
  const fail = async (reason: string) => {
    await setProduction(item.id, { status: "failed", reason: reason.slice(0, 300), finishedAt: new Date().toISOString() });
    await db.cosWorkEvent.create({ data: { orgId: item.orgId, workItemId: item.id, actorType: "ai", kind: "ai", internal: true, data: JSON.stringify({ production: "failed", format, reason: reason.slice(0, 300) }) } });
    await notify({ orgId: item.orgId, userId: actor.userId, audience: "staff", kind: "job_failed", title: `Draft not produced: ${item.title.slice(0, 80)}`, body: reason.slice(0, 300), href: `/app/content/${item.id}`, dedupeKey: `produce-fail:${item.id}:${version}` });
  };
  try {
    const provenance = { origin: "ai", model: aiModel(), pipeline: PRODUCE_JOB, format };
    if (format === "blog") {
      const brief = await seoBrief(item.orgId, item.title);
      const d = await draftText(item.orgId, item, p, `Follow this brief. Intent: ${brief.intent}. Outline: ${(brief.outline ?? []).join(" | ")}. Questions to answer: ${(brief.questions ?? []).join(" | ")}`);
      if (d.problems.length) return fail(`Validators rejected the article: ${d.problems[0]}`);
      await setProduction(item.id, { status: "draft_ready", finishedAt: new Date().toISOString() }, { brief, body: d.body, meta: d.meta, expertiseFlags: d.flags, provenance });
    } else if (VIDEO_FORMATS.includes(format)) {
      const d = await draftText(item.orgId, item, p, "Write a spoken script with timings, then a SHOT LIST (one shot per line: framing — action — on-screen text), then a CAPTION. A script is not a video: a person films and edits it.");
      if (d.problems.length) return fail(`Validators rejected the script: ${d.problems[0]}`);
      await setProduction(item.id, { status: "needs_asset", finishedAt: new Date().toISOString(), note: "Script, shot list and caption are ready. Attach the finished video from Assets before this can go to QA." }, { body: d.body, meta: d.meta, expertiseFlags: d.flags, provenance, scriptOnly: true });
      await notify({ orgId: item.orgId, audience: "staff", kind: "asset_needed", title: `Video file needed: ${item.title.slice(0, 80)}`, body: "The script is drafted. Film it, upload the file to Assets and attach it.", href: `/app/content/${item.id}`, dedupeKey: `asset-needed:${item.id}:${version}` });
    } else if (IMAGE_FORMATS.includes(format)) {
      const d = await draftText(item.orgId, item, p, format === "carousel" ? "Write the caption, then 3 to 5 slides as lines starting with 'Slide N:' (headline — supporting line)." : "Write the caption and one line of on-image text starting with 'Image:'.");
      if (d.problems.length) return fail(`Validators rejected the copy: ${d.problems[0]}`);
      const slides = format === "carousel" ? (d.body.match(/^Slide \d+:.*$/gim) ?? []).slice(0, 5).map((l) => l.replace(/^Slide \d+:\s*/i, "")) : [(d.body.match(/^Image:\s*(.*)$/im)?.[1] ?? item.title)];
      const made: { assetId: string; source: "provider" | "template"; note: string }[] = [];
      for (const [i, s] of (slides.length ? slides : [item.title]).entries()) { const [title, body = ""] = s.split(/\s+—\s+/); made.push(await makeImage(actor, item, { title: title.slice(0, 120), body: body.slice(0, 300), index: format === "carousel" ? i + 1 : undefined, total: format === "carousel" ? slides.length : undefined }, format === "carousel" ? "carousel_slide" : "quote_card")); }
      await setProduction(item.id, { status: "draft_ready", finishedAt: new Date().toISOString(), imageSource: made.every((m) => m.source === "provider") ? "provider" : "template", note: made[0]?.note, assetIds: made.map((m) => m.assetId) }, { body: d.body, meta: d.meta, expertiseFlags: d.flags, provenance, mediaAssetIds: made.map((m) => m.assetId) });
    } else {
      const d = await draftText(item.orgId, item, p, format === "thread" ? "Write a thread: one post per line, numbered." : format === "email" ? "Write the email: first line 'Subject: …', then the body." : "");
      if (d.problems.length) return fail(`Validators rejected the draft: ${d.problems[0]}`);
      await setProduction(item.id, { status: "draft_ready", finishedAt: new Date().toISOString() }, { body: d.body, meta: d.meta, expertiseFlags: d.flags, provenance });
    }
    await db.cosWorkEvent.create({ data: { orgId: item.orgId, workItemId: item.id, actorType: "ai", kind: "ai", internal: true, model: aiModel(), data: JSON.stringify({ production: "draft", format }) } });
    if (!VIDEO_FORMATS.includes(format)) await notify({ orgId: item.orgId, userId: actor.userId, audience: "staff", kind: "draft_ready", title: `Draft ready: ${item.title.slice(0, 80)}`, body: `${format.replace(/_/g, " ")} — review it, then send it to QA.`, href: `/app/content/${item.id}`, dedupeKey: `draft-ready:${item.id}:${version}` });
    await logLosAudit({ orgId: item.orgId, actorUserId: actor.userId, actorType: "system", action: "content.produced", entity: "CosWorkItem", entityId: item.id, data: { format } });
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Production failed.");
  }
}

registerJobHandler(PRODUCE_JOB, async (payload) => {
  const p = payload as { itemId: string; version: number; actor: WorkActor };
  // the actor must still be a member — a removed staff member's queued work does not run in their name
  const m = await db.losMembership.findFirst({ where: { orgId: p.actor.orgId, userId: p.actor.userId } });
  if (!m) return;
  await produceItem(p.itemId, p.version, { ...p.actor, role: m.role });
});
