"use server";

// WP-02 · operator actions on the job queue. Platform role re-checked; every change audited.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import type { FormState } from "@/app/app/(auth)/actions";

const ROLES = ["super_admin", "support_admin"];
const str = (form: FormData, key: string, max = 60) => String(form.get(key) ?? "").trim().slice(0, max);

/** Retry = back to pending, attempts reset, run now. Only failed / dead / stuck-running jobs. */
export async function retryJob(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...ROLES);
  const id = str(form, "id");
  const r = await db.losJob.updateMany({ where: { id, status: { in: ["dead", "pending", "running"] } }, data: { status: "pending", attempts: 0, runAt: new Date(), lockedAt: null, lastError: null } });
  if (r.count === 0) return { error: "Job not found or already done." };
  await logLosAudit({ actorType: "platform_admin", action: "job.retried", entity: "LosJob", entityId: id, data: { by: admin.email } });
  revalidatePath("/admin/os/jobs");
  return { ok: "Queued to run on the next tick." };
}

/** Kill = mark dead so it never runs again; the row stays for the record. */
export async function killJob(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...ROLES);
  const id = str(form, "id");
  const r = await db.losJob.updateMany({ where: { id, status: { in: ["pending", "running"] } }, data: { status: "dead", lockedAt: null, lastError: `Killed by operator ${admin.email}` } });
  if (r.count === 0) return { error: "Job not found or not running." };
  await logLosAudit({ actorType: "platform_admin", action: "job.killed", entity: "LosJob", entityId: id, data: { by: admin.email } });
  revalidatePath("/admin/os/jobs");
  return { ok: "Marked dead." };
}
