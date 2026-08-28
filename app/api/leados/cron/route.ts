import { NextRequest, NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/leados/jobs";
import "@/lib/leados/registerJobs";

export const maxDuration = 300;

// LeadOS job-queue tick. Hit every few minutes by Vercel cron:
// GET /api/leados/cron with Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { enqueueDueAllocations } = await import("@/lib/leados/allocationJob");
  const enqueued = await enqueueDueAllocations();
  let total = 0;
  // Drain in batches until quiet or ~4 min elapsed (Vercel limit headroom).
  const deadline = Date.now() + 4 * 60_000;
  for (;;) {
    const ran = await runPendingJobs(10);
    total += ran;
    if (ran === 0 || Date.now() > deadline) break;
  }
  return NextResponse.json({ ran: total, allocationsEnqueued: enqueued });
}
