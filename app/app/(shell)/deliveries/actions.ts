"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import type { FormState } from "../../(auth)/actions";

const REPLACEMENT_WINDOW_DAYS = 7;

export async function requestReplacement(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const allocationId = String(form.get("allocationId"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (!reason) return { error: "Tell us what's wrong with the lead." };
  const allocation = await db.losAllocation.findFirst({
    where: { id: allocationId, orgId: actor.orgId },
    include: { replacement: true },
  });
  if (!allocation) return { error: "Allocation not found." };
  if (allocation.replacement) return { error: "A replacement was already requested for this lead." };
  if (allocation.state !== "delivered") return { error: "This delivery can no longer be disputed." };
  if (Date.now() - allocation.createdAt.getTime() > REPLACEMENT_WINDOW_DAYS * 86_400_000) {
    return { error: `Replacements must be requested within ${REPLACEMENT_WINDOW_DAYS} days of delivery.` };
  }
  await db.$transaction([
    db.losLeadReplacement.create({ data: { allocationId, reason } }),
    db.losAllocation.update({ where: { id: allocationId }, data: { state: "replacement_requested" } }),
  ]);
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "replacement.requested", entity: "LosAllocation", entityId: allocationId });
  revalidatePath("/app/deliveries");
  return { ok: "Replacement requested — our team will review it." };
}
