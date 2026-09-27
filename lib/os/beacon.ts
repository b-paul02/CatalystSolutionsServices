// WP-43 · behaviour beacon: page view, click (percent + tag), scroll depth. No text, no input values, no cookies,
// honours Do Not Track. Rows live 30 days. Heatmap = dots over a screenshot the client uploads (no browser here).
import { db } from "@/lib/audit/db";

export const BEACON_TYPES = ["pv", "click", "scroll"] as const;
export type BeaconIn = { w: string; t: string; p: string; x?: number; y?: number; g?: string; d?: number };

export function parseBeacon(raw: unknown): BeaconIn | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const w = typeof b.w === "string" ? b.w.slice(0, 40) : "", t = typeof b.t === "string" ? b.t : "", p = typeof b.p === "string" ? b.p.split("?")[0].slice(0, 200) : "";
  if (!w || !(BEACON_TYPES as readonly string[]).includes(t) || !p.startsWith("/")) return null;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : undefined);
  const out: BeaconIn = { w, t, p };
  if (t === "click") { out.x = num(b.x, 100); out.y = num(b.y, 100); out.g = typeof b.g === "string" ? b.g.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() : undefined; if (out.x === undefined || out.y === undefined) return null; }
  if (t === "scroll") { out.d = num(b.d, 100); if (out.d === undefined) return null; }
  return out;
}

export async function recordBeacon(b: BeaconIn, now = new Date()) {
  const ws = await db.cosWorkspace.findUnique({ where: { orgId: b.w }, select: { orgId: true, accessMode: true } });
  if (!ws || ws.accessMode !== "active") return false;
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await db.cosBehaviorEvent.create({ data: { orgId: ws.orgId, day, type: b.t, path: b.p, x: b.x ?? null, y: b.y ?? null, tag: b.g ?? null, depth: b.d ?? null } });
  return true;
}

export async function sweepBehavior(now = new Date()) {
  const r = await db.cosBehaviorEvent.deleteMany({ where: { day: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  return r.count;
}

export async function heatmapData(orgId: string, path: string) {
  const [pages, clicks, scroll] = await Promise.all([
    db.cosBehaviorEvent.count({ where: { orgId, path, type: "pv" } }),
    db.cosBehaviorEvent.findMany({ where: { orgId, path, type: "click" }, select: { x: true, y: true, tag: true }, take: 5000 }),
    db.cosBehaviorEvent.aggregate({ where: { orgId, path, type: "scroll" }, _avg: { depth: true }, _count: true }),
  ]);
  return { pages, clicks: clicks.map((c) => ({ x: c.x ?? 0, y: c.y ?? 0, tag: c.tag })), scroll: scroll._count ? { avgDepth: Math.round(scroll._avg.depth ?? 0), samples: scroll._count } : null };
}

export async function topPaths(orgId: string) {
  const rows = await db.cosBehaviorEvent.groupBy({ by: ["path"], where: { orgId, type: "pv" }, _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 30 });
  return rows.map((r) => ({ path: r.path, views: r._count._all }));
}
