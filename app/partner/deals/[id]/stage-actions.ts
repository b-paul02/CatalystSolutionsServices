"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePartner } from "@/lib/partner/auth";
import { writeAudit } from "@/lib/partner/audit";
import { winDeal } from "@/lib/partner/commissions";

// Stages a partner may set themselves. "won" goes through winDeal() so the
// commission rate is locked and a pending commission is created; "lapsed" is
// set by the system, never by hand.
const PARTNER_STAGES = ["registered", "qualified", "demo_given", "proposal_sent", "negotiation", "lost"];

export async function setDealStage(dealId: string, stage: string, lostReason?: string) {
  const actor = await requirePartner();
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: { id: true, partnerId: true, stage: true, proposalSentAt: true },
  });
  if (!deal || deal.partnerId !== actor.partnerId) throw new Error("Deal not found.");
  if (["won", "lost", "lapsed"].includes(deal.stage)) throw new Error("This deal is closed.");

  if (stage === "won") {
    const commission = await winDeal({ actor, dealId });
    revalidatePath(`/partner/deals/${dealId}`);
    revalidatePath("/partner");
    return { won: true, commissionId: commission.id };
  }

  if (!PARTNER_STAGES.includes(stage)) throw new Error("That is not a stage you can set.");
  if (stage === "lost" && !lostReason?.trim()) throw new Error("Give a reason for the loss.");

  await db.deal.update({
    where: { id: deal.id },
    data: {
      stage,
      lostReason: stage === "lost" ? lostReason!.trim() : null,
      lastActivityAt: new Date(),
      // Sending the proposal lifts the 180-day protection cap.
      proposalSentAt: stage === "proposal_sent" && !deal.proposalSentAt ? new Date() : deal.proposalSentAt,
    },
  });
  await writeAudit({
    actor, entity: "deal", entityId: deal.id, action: "stage_changed",
    before: { stage: deal.stage }, after: { stage }, reason: lostReason?.trim(),
  });

  revalidatePath(`/partner/deals/${dealId}`);
  revalidatePath("/partner");
  return { won: false };
}
