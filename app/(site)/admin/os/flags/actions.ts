"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { isFeatureKey, setFlag } from "@/lib/os/flags";
import type { FormState } from "@/app/app/(auth)/actions";

const str = (form: FormData, key: string, max = 300) => String(form.get(key) ?? "").trim().slice(0, max);

export async function toggleFlag(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform("super_admin", "support_admin");
  const key = str(form, "key", 40), orgId = str(form, "orgId", 60);
  if (!isFeatureKey(key)) return { error: "Unknown feature." };
  if (orgId && !(await db.losOrg.findUnique({ where: { id: orgId }, select: { id: true } }))) return { error: "Workspace not found." };
  if (form.get("remove")) { await db.cosFeatureFlag.deleteMany({ where: { key, orgId } }); }
  else await setFlag(key, orgId, str(form, "on", 5) === "true", admin.email, str(form, "note"));
  await logLosAudit({ orgId: orgId || null, actorType: "platform_admin", action: "flag.set", entity: "CosFeatureFlag", entityId: `${key}:${orgId || "global"}`, data: { on: str(form, "on", 5), removed: Boolean(form.get("remove")), by: admin.email } });
  revalidatePath("/admin/os/flags");
  return { ok: "Saved." };
}
