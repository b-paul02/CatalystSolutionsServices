// Runs against the real database (this project tests on the live DB by
// decision). Every row it creates is removed in cleanup.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler, runPendingJobs } from "@/lib/leados/jobs";

const TYPE = "test:leados-jobs-suite";

afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: TYPE } });
  await db.$disconnect();
});

describe("LeadOS job queue", () => {
  it("runs an enqueued job exactly once and marks it done", async () => {
    let runs = 0;
    registerJobHandler(TYPE, async (payload) => {
      runs++;
      expect(payload).toEqual({ hello: "world" });
    });
    const key = `test-once-${Date.now()}`;
    await enqueueJob({ type: TYPE, payload: { hello: "world" }, idempotencyKey: key });
    await runPendingJobs(50);
    await runPendingJobs(50); // second tick must not re-run it
    expect(runs).toBe(1);
    const job = await db.losJob.findUnique({ where: { idempotencyKey: key } });
    expect(job?.status).toBe("done");
  });

  it("is idempotent on enqueue by idempotencyKey", async () => {
    const key = `test-idem-${Date.now()}`;
    await enqueueJob({ type: TYPE, idempotencyKey: key });
    await enqueueJob({ type: TYPE, idempotencyKey: key });
    const count = await db.losJob.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("retries a failing job with backoff and dead-letters at maxAttempts", async () => {
    const key = `test-fail-${Date.now()}`;
    registerJobHandler(TYPE, async () => {
      throw new Error("boom");
    });
    await enqueueJob({ type: TYPE, idempotencyKey: key, maxAttempts: 2 });

    await runPendingJobs(50);
    let job = await db.losJob.findUnique({ where: { idempotencyKey: key } });
    expect(job?.status).toBe("pending"); // retry scheduled
    expect(job?.attempts).toBe(1);
    expect(job?.runAt.getTime()).toBeGreaterThan(Date.now()); // backoff in future
    expect(job?.lastError).toContain("boom");

    // Force the retry due now, then exhaust attempts.
    await db.losJob.update({ where: { idempotencyKey: key }, data: { runAt: new Date() } });
    await runPendingJobs(50);
    job = await db.losJob.findUnique({ where: { idempotencyKey: key } });
    expect(job?.status).toBe("dead");
    expect(job?.attempts).toBe(2);
  });

  it("dead-letters a job with no registered handler", async () => {
    const key = `test-nohandler-${Date.now()}`;
    await enqueueJob({ type: `${TYPE}:unknown`, idempotencyKey: key, maxAttempts: 1 });
    await runPendingJobs(50);
    const job = await db.losJob.findUnique({ where: { idempotencyKey: key } });
    expect(job?.status).toBe("dead");
    expect(job?.lastError).toContain("No handler");
    await db.losJob.deleteMany({ where: { type: `${TYPE}:unknown` } });
  });
});
