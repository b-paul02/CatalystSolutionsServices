// Daily connector sync, run through the LeadOS job queue (retries + dead-letter).
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { syncSearchConsole } from "./connectors";

registerJobHandler("os.gsc_sync", async (payload) => {
  const { orgId } = payload as { orgId: string };
  await syncSearchConsole(orgId);
});

/** One job per verified connection per day (idempotency key), enqueued by the cron tick. */
export async function enqueueConnectorSyncs(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const conns = await db.cosConnection.findMany({ where: { provider: "gsc", status: "verified" }, select: { orgId: true } });
  for (const c of conns) await enqueueJob({ type: "os.gsc_sync", payload: { orgId: c.orgId }, idempotencyKey: `os.gsc_sync:${c.orgId}:${day}` });
}
