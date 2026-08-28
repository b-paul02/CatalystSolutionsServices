"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/partner/auth";
import { setPartnerStatus } from "@/lib/partner/partner-status";

/** Admin-only: suspending or terminating a partner stops them registering deals. */
export async function changePartnerStatus(partnerId: string, status: string, reason: string) {
  const actor = await requireAdmin();
  await setPartnerStatus({ actor, partnerId, status, reason });
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/admin/partners");
}
