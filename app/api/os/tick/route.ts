import { NextRequest, NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/leados/jobs";
import "@/lib/leados/registerJobs";
import { runTick } from "@/lib/os/tick";

export const maxDuration = 60;

// Time-sensitive GrowthOS work: due publications, workflow waits, recurring cycles, renewals.
// Call every 1–5 minutes with Authorization: Bearer CRON_SECRET (see GROWTHOS_EXTERNAL_SETUP.md →
// Scheduler). Safe to call concurrently or late: every unit of work is claimed atomically.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runTick();
  const deadline = Date.now() + 40_000;
  let ran = 0;
  for (;;) { const n = await runPendingJobs(10); ran += n; if (n === 0 || Date.now() > deadline) break; }
  return NextResponse.json({ ...summary, jobsRan: ran });
}
