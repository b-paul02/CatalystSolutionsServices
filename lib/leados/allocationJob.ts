// Daily allocation via the job queue. The cron tick enqueues one job per due
// plan per day (idempotencyKey plan+date); the engine itself is also idempotent.
import { allocatePlan, duePlanIds } from "./allocation";
import { enqueueJob, registerJobHandler } from "./jobs";

export const ALLOCATION_JOB = "leados:allocation-run";

registerJobHandler(ALLOCATION_JOB, async (payload) => {
  const { planId, runDate } = payload as { planId: string; runDate: string };
  await allocatePlan(planId, { execute: true, runDate });
});

export async function enqueueDueAllocations(now = new Date()): Promise<number> {
  const due = await duePlanIds(now);
  for (const d of due) {
    await enqueueJob({
      type: ALLOCATION_JOB,
      payload: d,
      idempotencyKey: `alloc-${d.planId}-${d.runDate}`,
    });
  }
  return due.length;
}
