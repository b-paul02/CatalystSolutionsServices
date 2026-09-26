// One scheduler tick for time-sensitive GrowthOS work. Every unit is claimed atomically, so
// overlapping or late ticks are harmless. The heartbeat lets the operator console show when
// the scheduler last ran — a stale heartbeat means scheduled posts are NOT going out.
import { db } from "@/lib/audit/db";

export const HEARTBEAT_KEY = "os.tick";
const LEASE_KEY = "os.tick.lease";
export const STALE_AFTER_MIN = 15;
// longer than the route's maxDuration (60s): a worker that died mid-tick frees the lease by itself
const LEASE_MS = 120_000;

/**
 * One tick at a time. Every unit below is ALSO claimed atomically on its own, so this lease is not what prevents
 * duplicate publishing — it stops two schedulers (say Vercel cron and an external pinger) doing the same sweeps twice.
 * A row lease rather than pg_advisory_lock: advisory locks belong to a connection, and ours are pooled.
 */
async function takeLease(now: Date): Promise<boolean> {
  await db.cosHeartbeat.upsert({ where: { key: LEASE_KEY }, update: {}, create: { key: LEASE_KEY, at: new Date(0) } });
  const got = await db.cosHeartbeat.updateMany({ where: { key: LEASE_KEY, at: { lt: new Date(now.getTime() - LEASE_MS) } }, data: { at: now, note: "held" } });
  return got.count === 1;
}
const dropLease = () => db.cosHeartbeat.updateMany({ where: { key: LEASE_KEY }, data: { at: new Date(0), note: null } });

export async function runTick(now = new Date()): Promise<{ skipped: true } | { skipped: false; published: number; ai: { uncertain: number; recovered: number; requeued: number }; creditsExpired: number }> {
  if (!(await takeLease(now))) return { skipped: true };
  try {
    const { runDuePublications } = await import("./publishing");
    const { tickWorkflows } = await import("./automation/engine");
    const { tickEngagements } = await import("./engagement");
    const { enqueueMetricSyncs } = await import("./metrics");
    const { reconcileStudio } = await import("./studio");
    const { expireGrants } = await import("./credits");
    const published = await runDuePublications(now);
    await tickWorkflows(now);
    await tickEngagements(now);
    await enqueueMetricSyncs(now);
    await import("./adsSync").then(({ enqueueAdsSyncs }) => enqueueAdsSyncs(now)).catch(() => undefined); // WP-25
    const ai = await reconcileStudio(now);
    const creditsExpired = await expireGrants(now);
    // credits can also run low by expiring; a failed notice never fails the tick
    const { lowBalanceNotice } = await import("./studio");
    for (const w of await db.cosCreditWallet.findMany({ where: { lowBalanceAt: { not: null } }, select: { orgId: true }, take: 500 })) await lowBalanceNotice(w.orgId, now).catch(() => undefined);
    await db.cosApproval.updateMany({ where: { status: "requested", expiresAt: { lt: now } }, data: { status: "expired", decidedAt: now } });
    // retention sweeps (first-party build): error events 90 d. Each is its own delete; a failure never fails the tick.
    await import("./errors").then(({ sweepErrors }) => sweepErrors(now)).catch(() => undefined);
    await import("@/lib/leados/contactCheck").then(({ sweepContactChecks }) => sweepContactChecks(now)).catch(() => undefined);
    await import("./indexnow").then(({ tickTrackedPositions }) => tickTrackedPositions(now)).catch(() => undefined); // weekly per org, guarded inside
    await db.cosHeartbeat.upsert({ where: { key: HEARTBEAT_KEY }, update: { at: now }, create: { key: HEARTBEAT_KEY, at: now } });
    return { skipped: false, published, ai, creditsExpired };
  } finally { await dropLease(); }
}

/** `dead` = jobs that exhausted their retries; `stuck` = claimed long ago and never finished. Both need a person. */
export async function schedulerHealth(now = new Date()): Promise<{ lastRun: Date | null; stale: boolean; deadJobs: number; stuckJobs: number; recentFailures: { type: string; lastError: string | null }[] }> {
  const [hb, deadJobs, stuckJobs, recentFailures] = await Promise.all([
    db.cosHeartbeat.findUnique({ where: { key: HEARTBEAT_KEY } }),
    db.losJob.count({ where: { status: "dead" } }),
    db.losJob.count({ where: { status: "running", lockedAt: { lt: new Date(now.getTime() - 30 * 60_000) } } }),
    db.losJob.findMany({ where: { status: "dead" }, orderBy: { updatedAt: "desc" }, take: 5, select: { type: true, lastError: true } }),
  ]);
  return { lastRun: hb?.at ?? null, stale: !hb || now.getTime() - hb.at.getTime() > STALE_AFTER_MIN * 60_000, deadJobs, stuckJobs, recentFailures };
}
