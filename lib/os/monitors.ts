// WP-29 · uptime monitors pinged from tick.ts: HEAD with a 10 s timeout, three consecutive failures before an alert
// (site_down), one alert per episode, site_up on recovery. The alert also lands as a comment on the open care-plan
// work item when there is one. No external monitoring service.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { safeUrl } from "./automation/definition";
import { notify } from "./notify";
import { assertWritable, WorkError, type WorkActor } from "./work";

export const FAILURES_BEFORE_ALERT = 3;
const TIMEOUT_MS = 10_000;

export async function addMonitor(actor: WorkActor, url: string, everyMin = 5) {
  if (!can(actor.role, "os.settings") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const u = safeUrl(url.trim()); // no internal addresses, https/http only
  if ((await db.cosMonitor.count({ where: { orgId: actor.orgId } })) >= 20) throw new WorkError("Up to 20 monitors per workspace.");
  const every = Math.max(5, Math.min(60, Math.round(everyMin) || 5));
  return db.cosMonitor.create({ data: { orgId: actor.orgId, url: u.toString(), everyMin: every, createdById: actor.userId } });
}

export async function removeMonitor(actor: WorkActor, id: string) {
  if (!can(actor.role, "os.settings") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  await db.cosMonitor.deleteMany({ where: { id, orgId: actor.orgId } });
}

async function ping(url: string): Promise<{ ok: boolean; status?: number; reason?: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "CatalystGrowthOS-Uptime/1.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // some hosts refuse HEAD: a GET on 405 keeps the check honest
    if (res.status === 405) { const g = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) }); return { ok: g.ok, status: g.status, reason: g.ok ? undefined : `HTTP ${g.status}` }; }
    return { ok: res.ok, status: res.status, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) { return { ok: false, reason: (e as Error).name === "TimeoutError" ? "timed out after 10 s" : "no answer" }; }
}

async function carePlanItem(orgId: string) {
  return db.cosWorkItem.findFirst({ where: { orgId, state: { notIn: ["closed", "cancelled"] }, OR: [{ templateKey: { in: ["care", "maintenance"] } }, { title: { contains: "care", mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, select: { id: true } });
}

/** One monitor check. Exported for tests and for "Check now". */
export async function checkMonitor(id: string, now = new Date()) {
  const m = await db.cosMonitor.findUnique({ where: { id } });
  if (!m) return null;
  const r = await ping(m.url);
  if (r.ok) {
    const recovered = m.lastStatus === "down";
    await db.cosMonitor.update({ where: { id: m.id }, data: { lastStatus: "ok", lastAt: now, failures: 0, alertedAt: null } });
    if (recovered && m.alertedAt) {
      const care = await carePlanItem(m.orgId);
      await notify({ orgId: m.orgId, audience: "client", kind: "site_up", title: `Back up: ${m.url}`, body: `Responded again at ${now.toISOString().slice(0, 16)}Z.`, href: care ? `/app/work/${care.id}` : "/app/settings/monitoring", dedupeKey: `site_up:${m.id}:${m.alertedAt.toISOString()}` });
      await notify({ orgId: m.orgId, audience: "staff", kind: "site_up", title: `Back up: ${m.url}`, href: care ? `/app/work/${care.id}` : "/app/settings/monitoring", dedupeKey: `site_up_staff:${m.id}:${m.alertedAt.toISOString()}` });
      if (care) await db.cosWorkEvent.create({ data: { orgId: m.orgId, workItemId: care.id, actorType: "system", kind: "comment", data: JSON.stringify({ text: `Uptime: ${m.url} is back up.` }) } });
    }
    return { ok: true as const, status: r.status };
  }
  const failures = m.failures + 1;
  const alertNow = failures >= FAILURES_BEFORE_ALERT && !m.alertedAt;
  await db.cosMonitor.update({ where: { id: m.id }, data: { lastStatus: failures >= FAILURES_BEFORE_ALERT ? "down" : m.lastStatus === "down" ? "down" : "unknown", lastAt: now, failures, ...(alertNow ? { alertedAt: now } : {}) } });
  if (alertNow) {
    const care = await carePlanItem(m.orgId);
    const body = `${failures} checks in a row failed (${r.reason ?? "unknown"}). Checked every ${m.everyMin} min.`;
    await notify({ orgId: m.orgId, audience: "client", kind: "site_down", title: `Site down: ${m.url}`, body, href: care ? `/app/work/${care.id}` : "/app/settings/monitoring", dedupeKey: `site_down:${m.id}:${now.toISOString()}` });
    await notify({ orgId: m.orgId, audience: "staff", kind: "site_down", title: `Site down: ${m.url}`, body, href: care ? `/app/work/${care.id}` : "/app/settings/monitoring", dedupeKey: `site_down_staff:${m.id}:${now.toISOString()}` });
    if (care) await db.cosWorkEvent.create({ data: { orgId: m.orgId, workItemId: care.id, actorType: "system", kind: "comment", data: JSON.stringify({ text: `Uptime: ${m.url} is DOWN — ${body}` }) } });
  }
  return { ok: false as const, failures, reason: r.reason };
}

/** Due monitors this tick (lastAt + everyMin ≤ now). At most 50 per tick. */
export async function tickMonitors(now = new Date()) {
  const due = await db.cosMonitor.findMany({ where: { OR: [{ lastAt: null }, { lastAt: { lte: new Date(now.getTime() - 5 * 60_000) } }] }, take: 50 });
  let checked = 0;
  for (const m of due) { if (m.lastAt && now.getTime() - m.lastAt.getTime() < m.everyMin * 60_000) continue; await checkMonitor(m.id, now).catch(() => undefined); checked++; }
  return checked;
}
