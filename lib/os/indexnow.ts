// WP-24 · IndexNow after a definite blog publish, and tracked-keyword positions from Search Console rows. No SERP
// scraping anywhere. IndexNow needs the key file on the SUBMITTED host, so the client's WordPress root must carry
// `/<INDEXNOW_KEY>.txt` (we also serve ours from public/ for this site); a refusal is logged and never fails publishing.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { upsertSnapshot } from "./metrics";
import { assertWritable, WorkError, type WorkActor } from "./work";

export const indexNowKey = (): string | null => process.env.INDEXNOW_KEY?.trim() || null;

/** POST the URL to the IndexNow endpoint. Returns what happened; never throws. */
export async function submitIndexNow(orgId: string, url: string): Promise<{ submitted: boolean; status?: number; reason?: string }> {
  const key = indexNowKey();
  if (!key) return { submitted: false, reason: "INDEXNOW_KEY not set" };
  let u: URL;
  try { u = new URL(url); } catch { return { submitted: false, reason: "bad url" }; }
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host: u.hostname, key, keyLocation: `${u.origin}/${key}.txt`, urlList: [u.toString()] }), signal: AbortSignal.timeout(10_000) });
    await logLosAudit({ orgId, actorType: "system", action: "indexnow.submitted", entity: "url", entityId: u.toString().slice(0, 200), data: { status: res.status } });
    return { submitted: res.ok || res.status === 202, status: res.status, reason: res.ok || res.status === 202 ? undefined : `IndexNow answered ${res.status} — is /${key}.txt on ${u.hostname}?` };
  } catch (e) { return { submitted: false, reason: (e as Error).message.slice(0, 120) }; }
}

// ── tracked keywords ─────────────────────────────────────────────────────────

export async function addTrackedKeyword(actor: WorkActor, query: string) {
  if (!can(actor.role, "work.manage") && !can(actor.role, "strategy.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const q = query.trim().toLowerCase().slice(0, 200);
  if (q.length < 2) throw new WorkError("Enter a search phrase.");
  if ((await db.cosTrackedKeyword.count({ where: { orgId: actor.orgId } })) >= 100) throw new WorkError("Up to 100 tracked phrases per workspace.");
  return db.cosTrackedKeyword.upsert({ where: { orgId_query: { orgId: actor.orgId, query: q } }, update: {}, create: { orgId: actor.orgId, query: q, createdById: actor.userId } });
}

export async function removeTrackedKeyword(actor: WorkActor, id: string) {
  if (!can(actor.role, "work.manage") && !can(actor.role, "strategy.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await db.cosTrackedKeyword.deleteMany({ where: { id, orgId: actor.orgId } });
}

/**
 * Average position (impression-weighted) of each tracked query in the latest Search Console snapshot → one
 * `lifetime` CosMetricSnapshot per query (latest wins; never summed). A query with no rows writes nothing (absent, not 0).
 */
export async function syncTrackedPositions(orgId: string, now = new Date()): Promise<{ tracked: number; measured: number }> {
  const tracked = await db.cosTrackedKeyword.findMany({ where: { orgId } });
  if (tracked.length === 0) return { tracked: 0, measured: 0 };
  const latest = await db.cosSearchQuery.findFirst({ where: { orgId }, orderBy: { day: "desc" }, select: { day: true } });
  if (!latest) return { tracked: tracked.length, measured: 0 };
  const rows = await db.cosSearchQuery.findMany({ where: { orgId, day: latest.day, query: { in: tracked.map((t) => t.query) } } });
  const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { demo: true } });
  let measured = 0;
  for (const t of tracked) {
    const mine = rows.filter((r) => r.query === t.query);
    const imp = mine.reduce((a, r) => a + r.impressions, 0);
    if (!mine.length || imp === 0) continue;
    const position = Math.round((mine.reduce((a, r) => a + r.position * r.impressions, 0) / imp) * 10) / 10;
    await upsertSnapshot(orgId, { provider: "gsc", metric: "search.position", kind: "lifetime", value: position, day: now, url: `kw:${t.query}`, grade: "B", demo: ws?.demo ?? false });
    await upsertSnapshot(orgId, { provider: "gsc", metric: "search.impressions_tracked", kind: "lifetime", value: imp, day: now, url: `kw:${t.query}`, grade: "B", demo: ws?.demo ?? false });
    measured++;
  }
  return { tracked: tracked.length, measured };
}

/** Weekly, once per org per ISO week (tick.ts). */
export async function tickTrackedPositions(now = new Date()) {
  const week = `${now.getUTCFullYear()}-W${Math.ceil(((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)}`;
  const orgs = await db.cosTrackedKeyword.findMany({ distinct: ["orgId"], select: { orgId: true } });
  for (const { orgId } of orgs) {
    const key = `os.positions:${orgId}:${week}`;
    if (await db.cosHeartbeat.findUnique({ where: { key } })) continue;
    await syncTrackedPositions(orgId, now).catch(() => undefined);
    await db.cosHeartbeat.create({ data: { key, at: now } }).catch(() => undefined);
  }
}

/** Latest position per tracked query for the Search page. */
export async function trackedPositions(orgId: string) {
  const tracked = await db.cosTrackedKeyword.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  const snaps = await db.cosMetricSnapshot.findMany({ where: { orgId, provider: "gsc", metric: { in: ["search.position", "search.impressions_tracked"] }, kind: "lifetime" }, orderBy: { periodStart: "desc" } });
  return tracked.map((t) => { const pos = snaps.find((s) => s.metric === "search.position" && s.url === `kw:${t.query}`); const imp = snaps.find((s) => s.metric === "search.impressions_tracked" && s.url === `kw:${t.query}`); return { id: t.id, query: t.query, position: pos?.value ?? null, impressions: imp?.value ?? null, at: pos?.periodStart ?? null }; });
}
