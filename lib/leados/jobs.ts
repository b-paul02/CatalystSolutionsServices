// LeadOS background jobs on a Postgres table. Claiming uses FOR UPDATE SKIP
// LOCKED so multiple workers (or overlapping cron ticks) never double-run a job.
import { db } from "@/lib/audit/db";

export type JobHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/** Domains register their job types at module load. Re-registering replaces. */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

/**
 * Enqueue a job. An idempotencyKey makes the enqueue itself idempotent:
 * the same key is silently ignored the second time.
 */
export async function enqueueJob(opts: {
  type: string;
  payload?: unknown;
  runAt?: Date;
  idempotencyKey?: string;
  maxAttempts?: number;
}): Promise<void> {
  const data = {
    type: opts.type,
    payload: opts.payload === undefined ? null : JSON.stringify(opts.payload),
    runAt: opts.runAt ?? new Date(),
    idempotencyKey: opts.idempotencyKey ?? null,
    maxAttempts: opts.maxAttempts ?? 5,
  };
  if (data.idempotencyKey) {
    await db.losJob.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      update: {}, // already enqueued — do nothing
      create: data,
    });
  } else {
    await db.losJob.create({ data });
  }
}

function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** attempts); // 30s, 1m, 2m … cap 1h
}

/**
 * Claim and run up to `limit` due jobs. Returns how many ran.
 * Called from the cron endpoint; safe to call concurrently.
 */
export async function runPendingJobs(limit = 10): Promise<number> {
  const claimed = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "LosJob"
      WHERE status = 'pending' AND "runAt" <= now()
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return [] as string[];
    const ids = rows.map((r) => r.id);
    await tx.losJob.updateMany({
      where: { id: { in: ids } },
      data: { status: "running", lockedAt: new Date() },
    });
    return ids;
  });

  for (const id of claimed) {
    const job = await db.losJob.findUnique({ where: { id } });
    if (!job) continue;
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(job.payload ? JSON.parse(job.payload) : undefined);
      await db.losJob.update({ where: { id }, data: { status: "done", lastError: null } });
    } catch (err) {
      const attempts = job.attempts + 1;
      const dead = attempts >= job.maxAttempts;
      await db.losJob.update({
        where: { id },
        data: {
          status: dead ? "dead" : "pending",
          attempts,
          lastError: String(err instanceof Error ? err.message : err).slice(0, 2000),
          runAt: dead ? job.runAt : new Date(Date.now() + backoffMs(attempts)),
          lockedAt: null,
        },
      });
    }
  }
  return claimed.length;
}
