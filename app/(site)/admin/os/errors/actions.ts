"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import type { FormState } from "@/app/app/(auth)/actions";

/** Resolved = hidden from the default list; a recurrence re-opens it (captureError clears resolvedAt). */
export async function resolveError(_p: FormState, form: FormData): Promise<FormState> {
  await requirePlatform("super_admin", "support_admin");
  const id = String(form.get("id") ?? "").slice(0, 60);
  const r = await db.cosErrorEvent.updateMany({ where: { id }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/os/errors");
  return r.count ? { ok: "Resolved." } : { error: "Not found." };
}
