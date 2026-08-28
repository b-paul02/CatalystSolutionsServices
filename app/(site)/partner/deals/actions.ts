"use server";

import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/partner/auth";
import { logActivity, registerDeal, type RegistrationOutcome } from "@/lib/partner/deals";
import { toMinor } from "@/lib/partner/money";

// Authorization inside the mutation, always. requirePartner() also guarantees
// the actor has a partnerId, which is what scopes every write below.

export async function registerDealAction(form: {
  clientLegalName: string;
  website: string;
  noWebsite: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  market: string;
  family: string;
  estimatedTier: string;
  estimatedValue: string;
  expectedCloseDate: string;
  howYouKnowThem: string;
  notes: string;
}): Promise<RegistrationOutcome> {
  const actor = await requirePartner();

  const estimate = form.estimatedValue.replace(/[,\s]/g, "");
  const estimatedValue = estimate && Number.isFinite(Number(estimate)) ? toMinor(Number(estimate)) : null;
  const expectedCloseDate = form.expectedCloseDate ? new Date(`${form.expectedCloseDate}T00:00:00Z`) : null;

  const outcome = await registerDeal({
    actor,
    clientLegalName: form.clientLegalName,
    website: form.website,
    noWebsite: form.noWebsite,
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    market: form.market,
    family: form.family,
    estimatedTier: form.estimatedTier,
    estimatedValue,
    expectedCloseDate: expectedCloseDate && !Number.isNaN(expectedCloseDate.getTime()) ? expectedCloseDate : null,
    howYouKnowThem: form.howYouKnowThem,
    notes: form.notes,
  });

  if (outcome.ok) {
    revalidatePath("/partner/deals");
    revalidatePath("/partner");
  }
  return outcome;
}

export async function logActivityAction(dealId: string, type: string, notes: string) {
  const actor = await requirePartner();
  const { protectedUntil } = await logActivity({ actor, dealId, type, notes });
  revalidatePath(`/partner/deals/${dealId}`);
  revalidatePath("/partner");
  return { protectedUntil: protectedUntil.toISOString() };
}
