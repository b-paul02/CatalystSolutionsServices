"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/partner/auth";
import { approveRate, setRate } from "@/lib/partner/rates";

// Authorization is checked here, inside the mutation, before anything is read
// or written. Only admins may set or approve a commission rate.

export async function changeRate(partnerId: string, input: {
  rateBp: number;
  effectiveFrom: string; // yyyy-mm-dd
  reason: string;
}) {
  const actor = await requireAdmin();
  const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00Z`);
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error("Give a valid effective date.");

  const { needsSecondAdmin } = await setRate({
    partnerId,
    rateBp: input.rateBp,
    effectiveFrom,
    reason: input.reason,
    actor,
  });

  revalidatePath(`/admin/partners/${partnerId}`);
  return { needsSecondAdmin };
}

/** A second admin signs off a rate above 30%. The setter cannot approve their own. */
export async function approvePendingRate(partnerId: string, rateId: string) {
  await approveRate(rateId, await requireAdmin());
  revalidatePath(`/admin/partners/${partnerId}`);
}
