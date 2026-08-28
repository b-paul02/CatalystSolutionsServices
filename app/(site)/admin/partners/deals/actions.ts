"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/partner/auth";
import { resolveCustomPriceRequest, setCustomPrice } from "@/lib/partner/deals";
import { toMinor } from "@/lib/partner/money";

/**
 * Staff-only. This is the one door to a non-price-book fee — the partner UI
 * has no price input anywhere, and a partner calling this gets 403.
 */
export async function setCustomPriceAction(dealId: string, amountMajor: string, reason: string) {
  const actor = await requireRole("deal_desk", "admin", "super_admin");

  const cleaned = amountMajor.replace(/[,\s]/g, "");
  if (!cleaned || !Number.isFinite(Number(cleaned)) || Number(cleaned) <= 0) {
    throw new Error("Enter a valid amount.");
  }

  await setCustomPrice({ actor, dealId, amount: toMinor(Number(cleaned)), reason });
  revalidatePath("/admin/partners/deals");
}

/** Approve the partner's proposal. The amount is read from the database, never the client. */
export async function approveCustomPriceRequestAction(dealId: string) {
  const actor = await requireRole("deal_desk", "admin", "super_admin");
  await resolveCustomPriceRequest({ actor, dealId, approve: true });
  revalidatePath("/admin/partners/deals");
}

export async function declineCustomPriceRequestAction(dealId: string, reason: string) {
  const actor = await requireRole("deal_desk", "admin", "super_admin");
  await resolveCustomPriceRequest({ actor, dealId, approve: false, reason });
  revalidatePath("/admin/partners/deals");
}
