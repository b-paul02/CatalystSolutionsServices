// Asset storage adapter. PRIVATE by default, in every adapter: keys start with the orgId and bytes reach a browser
// only through /api/os/assets/[id] after a membership check. Storage addresses are never handed to anyone.
//   ASSET_STORAGE=local        → .data/assets (development; works offline)
//   ASSET_STORAGE=vercel_blob  → Vercel Blob, access "private" (official SDK @vercel/blob ≥ 2, BLOB_READ_WRITE_TOKEN).
//                                 Implemented from the SDK's typed API; NOT live-verified — see GROWTHOS_COMPLETION_HANDOFF.md.
// Providers that must FETCH media (Instagram, Facebook photos) get a deliberate, single-asset, time-limited signed
// link (mediaLink below → /api/os/media/[versionId]) minted at publish time. The library itself is never public.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type Storage = {
  name: "local" | "vercel_blob";
  put: (key: string, bytes: Buffer, mime: string) => Promise<{ ref: string }>;
  get: (ref: string) => Promise<Buffer>;
  del: (ref: string) => Promise<void>;
};

const ROOT = path.resolve(process.cwd(), ".data", "assets");
const safeKey = (key: string) => { if (!/^[a-z0-9]+\/[A-Za-z0-9._\-/]+$/.test(key) || key.includes("..")) throw new Error("Bad storage key."); return key; };

const local: Storage = {
  name: "local",
  async put(key, bytes) { const file = path.join(ROOT, safeKey(key)); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); return { ref: key }; },
  get: (ref) => readFile(path.join(ROOT, safeKey(ref))),
  del: (ref) => rm(path.join(ROOT, safeKey(ref)), { force: true }),
};

const blob: Storage = {
  name: "vercel_blob",
  // the ref we keep is the PATHNAME; reading it needs the store token, so knowing a ref opens nothing
  async put(key, bytes, mime) { const { put } = await import("@vercel/blob"); const r = await put(safeKey(key), bytes, { access: "private", contentType: mime, addRandomSuffix: true }); return { ref: r.pathname }; },
  async get(ref) {
    const { get } = await import("@vercel/blob");
    const r = await get(ref, { access: "private" });
    if (!r || r.statusCode !== 200) throw new Error("Asset not found in storage.");
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  },
  async del(ref) { const { del } = await import("@vercel/blob"); await del(ref); },
};

export function storage(nameOverride?: string): Storage {
  const name = nameOverride ?? process.env.ASSET_STORAGE ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (name === "local") { if (process.env.NODE_ENV === "production" && !process.env.ASSET_STORAGE_ALLOW_LOCAL) throw new Error("Asset storage is not set up."); return local; }
  if (name === "vercel_blob") { if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Asset storage is not set up."); return blob; }
  throw new Error("Asset storage is not set up.");
}
export const storageReady = (): boolean => { try { storage(); return true; } catch { return false; } };
export const storageByName = (name: string): Storage => (name === "vercel_blob" ? blob : local);

// ── time-limited media delivery for provider ingestion ───────────────────────

export const MEDIA_LINK_TTL_SEC = 30 * 60; // Meta fetches within minutes of the container call
const mediaKey = () => { const k = process.env.LEADOS_SECRET; if (!k) throw new Error("LEADOS_SECRET is required."); return createHmac("sha256", k).update("os.media-link.v1").digest(); };
const sign = (versionId: string, exp: number) => createHmac("sha256", mediaKey()).update(`${versionId}.${exp}`).digest("hex");

/** The public https origin providers can reach. None (e.g. localhost) ⇒ fetch-based channels honestly say "requires setup". */
export function mediaOrigin(): string | null {
  const o = process.env.MEDIA_PUBLIC_ORIGIN ?? (process.env.NODE_ENV === "production" ? process.env.SITE_URL ?? null : null);
  if (!o || !/^https:\/\//i.test(o) || /\/\/(localhost|127\.|\[::1\])/i.test(o)) return null;
  return o.replace(/\/+$/, "");
}
/** One asset version, one expiry, unforgeable. Minted only by the publisher for media on an APPROVED variant. */
export function mediaLink(versionId: string, now = Date.now(), ttlSec = MEDIA_LINK_TTL_SEC): string | null {
  const origin = mediaOrigin();
  if (!origin) return null;
  const exp = Math.floor(now / 1000) + ttlSec;
  return `${origin}/api/os/media/${versionId}?exp=${exp}&sig=${sign(versionId, exp)}`;
}
export function verifyMediaLink(versionId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig) || Number(exp) * 1000 < now) return false;
  const want = Buffer.from(sign(versionId, Number(exp))), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
