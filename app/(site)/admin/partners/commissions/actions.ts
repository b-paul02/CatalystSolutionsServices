"use server";

import { revalidatePath } from "next/cache";
import { requireFinance } from "@/lib/partner/auth";
import { toMinor } from "@/lib/partner/money";
import {
  createAdjustment, markPaid, recordCollection, recordInvoice, voidCommissions,
} from "@/lib/partner/commissions";

// Finance and admins only. Checked inside every mutation.

const money = (major: string) => {
  const cleaned = major.replace(/[,\s]/g, "");
  if (!cleaned || !Number.isFinite(Number(cleaned)) || Number(cleaned) <= 0) throw new Error("Enter a valid amount.");
  return toMinor(Number(cleaned));
};

export async function recordInvoiceAction(dealId: string, amount: string, reference: string, dueAt: string) {
  const actor = await requireFinance();
  const invoice = await recordInvoice({
    actor, dealId, amount: money(amount), reference: reference.trim() || undefined,
    dueAt: dueAt ? new Date(`${dueAt}T00:00:00Z`) : null,
  });
  revalidatePath("/admin/partners/commissions");
  return { invoiceId: invoice.id };
}

export async function recordCollectionAction(invoiceId: string, amount: string, method: string, reference: string) {
  const actor = await requireFinance();
  await recordCollection({
    actor, invoiceId, amount: money(amount),
    method: method.trim() || undefined, reference: reference.trim() || undefined,
  });
  revalidatePath("/admin/partners/commissions");
}

export async function markPaidAction(commissionId: string, payoutRef: string) {
  const actor = await requireFinance();
  await markPaid({ actor, commissionId, payoutRef });
  revalidatePath("/admin/partners/commissions");
}

export async function createAdjustmentAction(commissionId: string, reasonCode: string, reason: string, amount: string) {
  const actor = await requireFinance();
  await createAdjustment({
    actor, commissionId, reasonCode, reason,
    amount: amount.trim() ? money(amount) : undefined,
  });
  revalidatePath("/admin/partners/commissions");
}

export async function voidCommissionsAction(dealId: string, reason: string) {
  const actor = await requireFinance();
  const count = await voidCommissions({ actor, dealId, reason });
  revalidatePath("/admin/partners/commissions");
  return { count };
}
