// Tenant-isolated asset library (GrowthOS v2, brief §G): uploads, versions, rights notes,
// client visibility, approval, export manifest. Bytes live behind lib/os/storage.ts.
import { createHash } from "node:crypto";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { assertWritable, WorkError, type WorkActor } from "./work";
import { mediaLink, storage, storageByName } from "./storage";

const MB = 1024 * 1024;
// type → [asset kind, max bytes]. Anything not listed is refused (no executables, no HTML, no SVG scripts).
export const ALLOWED: Record<string, [string, number]> = {
  "image/png": ["image", 15 * MB], "image/jpeg": ["image", 15 * MB], "image/webp": ["image", 15 * MB], "image/gif": ["image", 15 * MB],
  "video/mp4": ["video", 512 * MB], "video/quicktime": ["video", 512 * MB], "video/webm": ["video", 512 * MB],
  "audio/mpeg": ["audio", 50 * MB], "audio/wav": ["audio", 50 * MB], "audio/mp4": ["audio", 50 * MB],
  "application/pdf": ["document", 25 * MB], "text/plain": ["document", 5 * MB], "text/vtt": ["document", 5 * MB], "application/x-subrip": ["document", 5 * MB],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["document", 25 * MB],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["document", 50 * MB],
  "application/zip": ["other", 100 * MB],
};
export const CATEGORIES = ["brand", "source", "production", "deliverable"] as const;

// cheap content sniffing: the declared type must match the first bytes for the formats we can recognise
function sniffOk(mime: string, b: Buffer): boolean {
  const hex = b.subarray(0, 12).toString("hex");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return hex.startsWith("52494646") && b.subarray(8, 12).toString() === "WEBP";
  if (mime === "application/pdf") return b.subarray(0, 4).toString() === "%PDF";
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "audio/mp4") return b.subarray(4, 8).toString() === "ftyp";
  if (mime.endsWith("document") || mime.endsWith("presentation") || mime === "application/zip") return hex.startsWith("504b0304");
  return true;
}
function pngSize(mime: string, b: Buffer): { width?: number; height?: number } {
  return mime === "image/png" && b.length > 24 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : {};
}

export type UploadInput = { name: string; mime: string; bytes: Buffer; category?: string; tags?: string[]; rightsNote?: string; sourceNote?: string; clientVisible?: boolean; durationSec?: number | null; workItemId?: string | null; origin?: "upload" | "ai_generated"; note?: string };

function check(input: { mime: string; bytes: Buffer }) {
  const rule = ALLOWED[input.mime];
  if (!rule) throw new WorkError("That file type is not accepted.");
  if (input.bytes.length === 0) throw new WorkError("The file is empty.");
  if (input.bytes.length > rule[1]) throw new WorkError(`File is too large — the limit for this type is ${Math.round(rule[1] / MB)} MB.`);
  if (!sniffOk(input.mime, input.bytes)) throw new WorkError("The file's contents do not match its type.");
  return rule[0];
}
const canUpload = (actor: WorkActor) => can(actor.role, "work.execute") || can(actor.role, "work.manage") || can(actor.role, "work.request");

async function store(orgId: string, assetId: string, version: number, input: { name: string; mime: string; bytes: Buffer }) {
  const st = storage();
  const ext = (input.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const { ref } = await st.put(`${orgId}/${assetId}/v${version}${ext}`, input.bytes, input.mime);
  return { storage: st.name, storageKey: ref, sha256: createHash("sha256").update(input.bytes).digest("hex") };
}

export async function uploadAsset(actor: WorkActor, input: UploadInput) {
  if (!canUpload(actor)) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const kind = check(input);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new WorkError("Name the file.");
  if (input.workItemId && !(await db.cosWorkItem.findFirst({ where: { id: input.workItemId, orgId: actor.orgId } }))) throw new WorkError("Work item not found.");
  const ws = await db.cosWorkspace.findUnique({ where: { orgId: actor.orgId }, select: { demo: true } });
  const asset = await db.cosAsset.create({
    data: { orgId: actor.orgId, name, kind, category: (CATEGORIES as readonly string[]).includes(input.category ?? "") ? input.category! : "production", tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12), origin: input.origin ?? "upload", rightsNote: input.rightsNote?.slice(0, 600) || null, sourceNote: input.sourceNote?.slice(0, 600) || null, clientVisible: isStaffRole(actor.role) ? input.clientVisible ?? true : true, workItemId: input.workItemId ?? null, createdById: actor.userId, demo: ws?.demo ?? false },
  });
  try {
    const s = await store(actor.orgId, asset.id, 1, input);
    await db.cosAssetVersion.create({ data: { orgId: actor.orgId, assetId: asset.id, version: 1, ...s, mime: input.mime, sizeBytes: input.bytes.length, ...pngSize(input.mime, input.bytes), durationSec: input.durationSec ?? null, note: input.note?.slice(0, 300) || null, createdById: actor.userId } });
  } catch (e) {
    await db.cosAsset.delete({ where: { id: asset.id } }); // no orphan rows without bytes
    throw e instanceof WorkError ? e : new WorkError((e as Error).message.includes("not set up") ? "Asset storage is not set up yet — ask your account lead." : "Upload failed — nothing was saved.");
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "asset.uploaded", entity: "CosAsset", entityId: asset.id, data: { kind, bytes: input.bytes.length } });
  return asset;
}

async function load(actor: WorkActor, id: string) {
  const asset = await db.cosAsset.findFirst({ where: { id, orgId: actor.orgId }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!asset || (!isStaffRole(actor.role) && !asset.clientVisible)) throw new WorkError("Asset not found.");
  return asset;
}

/** New version of the same asset. An approved asset goes back to draft: approval was for the old bytes. */
export async function addAssetVersion(actor: WorkActor, id: string, input: { name: string; mime: string; bytes: Buffer; note?: string; durationSec?: number | null }) {
  if (!canUpload(actor)) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const asset = await load(actor, id);
  const kind = check(input);
  if (kind !== asset.kind) throw new WorkError(`A new version must be the same kind of file (${asset.kind}).`);
  const version = asset.currentVersion + 1;
  const s = await store(actor.orgId, asset.id, version, input);
  await db.$transaction([
    db.cosAssetVersion.create({ data: { orgId: actor.orgId, assetId: asset.id, version, ...s, mime: input.mime, sizeBytes: input.bytes.length, ...pngSize(input.mime, input.bytes), durationSec: input.durationSec ?? null, note: input.note?.slice(0, 300) || null, createdById: actor.userId } }),
    db.cosAsset.update({ where: { id: asset.id }, data: { currentVersion: version, status: asset.status === "approved" ? "draft" : asset.status } }),
  ]);
  return version;
}

export async function updateAsset(actor: WorkActor, id: string, patch: { name?: string; category?: string; tags?: string[]; rightsNote?: string; sourceNote?: string; clientVisible?: boolean; status?: string }) {
  await assertWritable(actor.orgId);
  const asset = await load(actor, id);
  const staff = isStaffRole(actor.role);
  if (patch.status) {
    if (!["draft", "approved", "archived"].includes(patch.status)) throw new WorkError("Unknown status.");
    // brand and source material is the client's to approve; production files pass internal review
    const ok = patch.status === "approved" ? (["brand", "source"].includes(asset.category) ? can(actor.role, "approvals.decide") : can(actor.role, "approvals.decide") || can(actor.role, "work.review") || can(actor.role, "work.manage")) : can(actor.role, "work.manage") || can(actor.role, "approvals.decide");
    if (!ok) throw new WorkError(patch.status === "approved" && ["brand", "source"].includes(asset.category) ? "Only the client can approve brand and source material." : "Forbidden.");
  } else if (!canUpload(actor)) throw new WorkError("Forbidden.");
  await db.cosAsset.update({
    where: { id: asset.id },
    data: { name: patch.name?.trim().slice(0, 200) || asset.name, category: patch.category && (CATEGORIES as readonly string[]).includes(patch.category) ? patch.category : asset.category, tags: patch.tags ? patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12) : asset.tags, rightsNote: patch.rightsNote ?? asset.rightsNote, sourceNote: patch.sourceNote ?? asset.sourceNote, clientVisible: staff && patch.clientVisible !== undefined ? patch.clientVisible : asset.clientVisible, status: patch.status ?? asset.status },
  });
}

/** Bytes for download/preview — always after the tenant + visibility check. */
export async function readAsset(actor: WorkActor, id: string, version?: number) {
  const asset = await load(actor, id);
  const v = asset.versions.find((x) => x.version === (version ?? asset.currentVersion));
  if (!v) throw new WorkError("Version not found.");
  if (!v.storageKey.startsWith(`${actor.orgId}/`) && v.storage === "local") throw new WorkError("Asset not found."); // belt and braces
  return { asset, version: v, bytes: await storageByName(v.storage).get(v.storageKey) };
}

/** What the publisher hands an adapter. Server-side only. */
export async function mediaForPublish(orgId: string, ids: string[]) {
  const assets = await db.cosAsset.findMany({ where: { orgId, id: { in: ids } }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  return ids.map((id) => {
    const a = assets.find((x) => x.id === id), v = a?.versions[0];
    if (!a || !v) throw new WorkError("An attached asset no longer exists.");
    const st = storageByName(v.storage);
    // publicUrl = a signed link to THIS version that expires in minutes; never a storage address (assets stay private)
    return { kind: a.kind, mime: v.mime, sizeBytes: v.sizeBytes, publicUrl: mediaLink(v.id), bytes: () => st.get(v.storageKey) };
  });
}

/** Handover manifest: every asset + version with checksum and a download path (client-visible ones for clients). */
export async function assetManifest(actor: WorkActor) {
  if (!can(actor.role, "work.view")) throw new WorkError("Forbidden.");
  const assets = await db.cosAsset.findMany({ where: { orgId: actor.orgId, ...(isStaffRole(actor.role) ? {} : { clientVisible: true }) }, include: { versions: { orderBy: { version: "asc" } } }, orderBy: { createdAt: "asc" } });
  return assets.map((a) => ({ id: a.id, name: a.name, kind: a.kind, category: a.category, status: a.status, origin: a.origin, rightsNote: a.rightsNote, sourceNote: a.sourceNote, tags: a.tags, versions: a.versions.map((v) => ({ version: v.version, mime: v.mime, sizeBytes: v.sizeBytes, sha256: v.sha256, createdAt: v.createdAt.toISOString(), download: `/api/os/assets/${a.id}?v=${v.version}&download=1` })) }));
}
