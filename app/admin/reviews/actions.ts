"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db, logEvent } from "@/lib/audit/db";
import { regenerateWithReason, runPipeline } from "@/lib/audit/pipeline";
import { regenerateDoctorWithReason, runDoctorPipeline } from "@/lib/audit/doctor-pipeline";

export async function saveEdits(reportId: string, json: string) {
  JSON.parse(json); // validate before saving
  await db.report.update({ where: { id: reportId }, data: { json } });
  const r = await db.report.findUniqueOrThrow({ where: { id: reportId } });
  await logEvent(r.leadId, "report_edited");
  revalidatePath(`/admin/reviews/${r.leadId}`);
}

export async function approve(reportId: string, reviewerName: string) {
  if (!reviewerName.trim()) throw new Error("Reviewer name is required — every approval is accountable.");
  const r = await db.report.update({
    where: { id: reportId },
    data: { status: "approved", reviewerName: reviewerName.trim(), deliveredAt: new Date() },
    include: { lead: true },
  });
  await db.lead.update({ where: { id: r.leadId }, data: { status: r.lead.tag === "nurture" ? "nurture" : "delivered" } });
  await logEvent(r.leadId, "report_approved", { reviewer: r.reviewerName });
  // No delivery email for now — users watch their report link; nurture cron still handles follow-ups.
  revalidatePath("/admin/reviews");
}

/** One-click recovery for failed/crashed generations — reruns the pipeline from the stored submission. */
export async function regenerate(reportId: string) {
  const r = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { lead: true } });
  await logEvent(r.leadId, "report_regenerate_requested");
  const run = r.lead.type === "doctor" ? runDoctorPipeline : runPipeline;
  // takes minutes (multiple model calls) — run after the response; the progress bar tracks it
  after(() => run(r.leadId).catch((e) => console.error("regenerate failed", e)));
  revalidatePath("/admin/reviews");
}

export async function reject(reportId: string, reviewerName: string, reason: string) {
  if (!reason.trim()) throw new Error("A rejection reason is required — it drives the regeneration.");
  const r = await db.report.update({
    where: { id: reportId },
    data: { status: "rejected", reviewerName: reviewerName.trim() || null, reviewNote: reason.trim() },
    include: { lead: true },
  });
  await logEvent(r.leadId, "report_rejected", { reviewer: reviewerName, reason });
  // regeneration takes minutes (multiple model calls) — run after the response
  const regen = r.lead.type === "doctor" ? regenerateDoctorWithReason : regenerateWithReason;
  after(() => regen(r.leadId, reason.trim()).catch((e) => console.error("regen failed", e)));
  revalidatePath("/admin/reviews");
}
