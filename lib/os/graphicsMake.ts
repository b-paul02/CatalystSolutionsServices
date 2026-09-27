// WP-22/23 · graphics from a variant (template auto-filled from its copy + the brand colour) and per-channel
// derivatives of an image asset. Both land in Assets; the person attaches them to a version (attaching is a material
// edit, so it is never done silently). ponytail: PNG only, sources ≤ 4 MB — WebP and larger sources need sharp.
import { createElement } from "react";
import { ImageResponse } from "next/og";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { addAssetVersion, readAsset, uploadAsset } from "./assets";
import { getBrandRules } from "./brand";
import { renderTemplate, TEMPLATES, type TemplateKey } from "./graphics";
import { assertWritable, WorkError, type WorkActor } from "./work";

const canMake = (actor: WorkActor) => isStaffRole(actor.role) && (can(actor.role, "work.execute") || can(actor.role, "work.manage"));

/** Render a template from an approved-or-draft variant's copy; save as a new asset, or a new version of the one made before. */
export async function makeGraphicForVariant(actor: WorkActor, variantId: string, template: TemplateKey) {
  if (!canMake(actor)) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  if (!TEMPLATES[template]) throw new WorkError("Unknown template.");
  const v = await db.cosContentVariant.findFirst({ where: { id: variantId, orgId: actor.orgId }, include: { workItem: { select: { id: true, title: true } } } });
  if (!v) throw new WorkError("Version not found.");
  const [rules, org] = await Promise.all([getBrandRules(actor.orgId), db.losOrg.findUnique({ where: { id: actor.orgId }, select: { name: true } })]);
  const text = v.body || v.parts[0] || "";
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const fields = template === "blog_cover" ? { title: v.title || v.workItem.title, brand: org?.name ?? "", color: rules.color ?? undefined }
    : template === "carousel_slide" ? { title: v.title || firstSentence.slice(0, 80) || v.workItem.title, body: v.parts[1] ?? text.split(/(?<=[.!?])\s+/).slice(1, 3).join(" "), brand: org?.name ?? "", color: rules.color ?? undefined, index: 1, total: Math.max(1, v.parts.length) }
    : { title: firstSentence.slice(0, 140) || v.workItem.title, body: v.cta ?? "", brand: org?.name ?? "", color: rules.color ?? undefined };
  const bytes = await renderTemplate(template, fields);
  const name = `${v.workItem.title.slice(0, 60)} — ${TEMPLATES[template].label}.png`;
  const existing = await db.cosAsset.findFirst({ where: { orgId: actor.orgId, workItemId: v.workItem.id, name, status: { not: "archived" } } });
  if (existing) { const version = await addAssetVersion(actor, existing.id, { name, mime: "image/png", bytes, note: `Re-rendered from ${v.channel} v${v.version}` }); return { assetId: existing.id, version, created: false }; }
  const asset = await uploadAsset(actor, { name, mime: "image/png", bytes, category: "production", origin: "ai_generated", clientVisible: true, workItemId: v.workItem.id, sourceNote: `Rendered from the “${TEMPLATES[template].label}” template with the copy of ${v.channel} v${v.version}.`, rightsNote: "Rendered by the platform from the client's own copy; no third-party imagery." });
  return { assetId: asset.id, version: 1, created: true };
}

// ── WP-23 · derivatives ──────────────────────────────────────────────────────

export const DERIVATIVE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  "instagram:square": { w: 1080, h: 1080, label: "Instagram square" }, "instagram:portrait": { w: 1080, h: 1350, label: "Instagram portrait" }, "instagram:story": { w: 1080, h: 1920, label: "Story / Reel cover" },
  "linkedin:landscape": { w: 1200, h: 627, label: "LinkedIn landscape" }, "x:landscape": { w: 1600, h: 900, label: "X landscape" }, "facebook:link": { w: 1200, h: 630, label: "Facebook link" }, "blog:cover": { w: 1200, h: 630, label: "Blog cover" }, "youtube:thumbnail": { w: 1280, h: 720, label: "YouTube thumbnail" },
};
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

type DerivRenderer = (src: { bytes: Buffer; mime: string }, w: number, h: number) => Promise<Buffer>;
let derivRenderer: DerivRenderer = async (src, w, h) => {
  // the original as a data URL inside an <img> at the target size, cover-cropped by satori
  const el = createElement("div", { style: { display: "flex", width: "100%", height: "100%", overflow: "hidden", background: "#000" } }, createElement("img", { src: `data:${src.mime};base64,${src.bytes.toString("base64")}`, width: w, height: h, style: { objectFit: "cover", width: "100%", height: "100%" } }));
  return Buffer.from(await new ImageResponse(el, { width: w, height: h }).arrayBuffer());
};
export const setDerivativeRendererForTests = (r: DerivRenderer) => { derivRenderer = r; };

/** New assets (tagged derivative-of:<id>) for the requested sizes. Idempotent per (asset, size): re-running replaces the version. */
export async function makeDerivatives(actor: WorkActor, assetId: string, sizes: string[]) {
  if (!canMake(actor)) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const keys = sizes.filter((s) => DERIVATIVE_SIZES[s]);
  if (keys.length === 0) throw new WorkError("Pick at least one size.");
  const { asset, version, bytes } = await readAsset(actor, assetId);
  if (asset.kind !== "image") throw new WorkError("Derivatives are made from images.");
  if (!["image/png", "image/jpeg"].includes(version.mime)) throw new WorkError("PNG or JPEG sources only (WebP and GIF need a converter this platform does not ship).");
  if (bytes.length > MAX_SOURCE_BYTES) throw new WorkError("Source images over 4 MB cannot be re-rendered here — upload a smaller original.");
  const made: { key: string; assetId: string; version: number }[] = [];
  for (const key of keys) {
    const s = DERIVATIVE_SIZES[key];
    const out = await derivRenderer({ bytes, mime: version.mime }, s.w, s.h);
    const name = `${asset.name.replace(/\.[A-Za-z0-9]+$/, "")} — ${s.w}×${s.h}.png`;
    const existing = await db.cosAsset.findFirst({ where: { orgId: actor.orgId, tags: { has: `derivative-of:${asset.id}` }, name, status: { not: "archived" } } });
    if (existing) made.push({ key, assetId: existing.id, version: await addAssetVersion(actor, existing.id, { name, mime: "image/png", bytes: out, note: `Re-rendered from v${version.version} of the original` }) });
    else { const a = await uploadAsset(actor, { name, mime: "image/png", bytes: out, category: asset.category, tags: [...asset.tags, `derivative-of:${asset.id}`, key.replace(":", "-")], clientVisible: asset.clientVisible, workItemId: asset.workItemId, rightsNote: asset.rightsNote ?? undefined, sourceNote: `${s.label} (${s.w}×${s.h}) rendered from “${asset.name}” v${version.version}. PNG only.` }); made.push({ key, assetId: a.id, version: 1 }); }
  }
  return made;
}
