import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/audit/db";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";

// Progress is derived from the real Event log — every pipeline node logs node_done,
// so the bar reflects actual work, not a timer.

type Milestone = { match: (type: string, data: string) => boolean; percent: number; label: string };

const DOCTOR: Milestone[] = [
  { match: (t) => t === "pipeline_started", percent: 8, label: "Starting analysis" },
  { match: (t, d) => t === "node_done" && d.includes("presence_scan"), percent: 35, label: "Researching online presence" },
  { match: (t, d) => t === "node_done" && (d.includes("found_site_scan") || d.includes("scorecard")), percent: 48, label: "Scanning website" },
  { match: (t, d) => t === "node_done" && d.includes("doctor_synthesis"), percent: 68, label: "Writing the report" },
  { match: (t) => t === "critic_verdict", percent: 85, label: "Compliance review" },
  { match: (t) => t === "pipeline_finished", percent: 100, label: "Finished" },
];

const BUSINESS: Milestone[] = [
  { match: (t) => t === "pipeline_started", percent: 6, label: "Starting analysis" },
  { match: (t, d) => t === "node_done" && d.includes("analyst"), percent: 25, label: "Running specialist analysts" },
  { match: (t, d) => t === "node_done" && d.includes("icp"), percent: 32, label: "Building customer profiles" },
  { match: (t, d) => t === "node_done" && d.includes("pagespeed"), percent: 38, label: "Measuring site performance" },
  { match: (t, d) => t === "node_done" && d.includes("competitors"), percent: 48, label: "Verifying competitors" },
  { match: (t, d) => t === "node_done" && d.includes("synthesis"), percent: 65, label: "Writing the report" },
  { match: (t) => t === "critic_verdict", percent: 80, label: "Compliance review" },
  { match: (t, d) => t === "node_done" && d.includes("artifact"), percent: 93, label: "Preparing reviewer notes" },
  { match: (t) => t === "pipeline_finished", percent: 100, label: "Finished" },
];

export async function GET(req: NextRequest) {
  const admin = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId") ?? "";
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!lead) return NextResponse.json({ error: "Unknown lead" }, { status: 404 });

  // only events belonging to the CURRENT run
  const startIdx = lead.events.map((e) => e.type).lastIndexOf("pipeline_started");
  const run = startIdx >= 0 ? lead.events.slice(startIdx) : [];
  const startedAt = startIdx >= 0 ? lead.events[startIdx].createdAt : null;

  const milestones = lead.type === "doctor" ? DOCTOR : BUSINESS;
  let percent = 0, stage = "Waiting to start";
  for (const e of run) {
    for (const m of milestones) {
      if (m.match(e.type, e.data ?? "") && m.percent > percent) { percent = m.percent; stage = m.label; }
    }
  }
  const failed = run.some((e) => e.type === "pipeline_error");
  const done = run.some((e) => e.type === "pipeline_finished");
  const generating = lead.status === "generating";

  return NextResponse.json({
    generating, done, failed,
    percent: failed ? percent : done ? 100 : percent,
    stage: failed ? "Failed — see event log" : stage,
    elapsedSec: startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : 0,
    typical: lead.type === "doctor" ? "typically 2–6 minutes (includes live research)" : "typically 2–4 minutes",
  });
}
