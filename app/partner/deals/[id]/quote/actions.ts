"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePartner } from "@/lib/partner/auth";
import { writeAudit } from "@/lib/partner/audit";
import { requestCustomPrice } from "@/lib/partner/deals";
import { toMinor } from "@/lib/partner/money";

/**
 * Attaches a price book package to a deal.
 *
 * The client sends a price book id and nothing else. The fee is read from the
 * database row — never from the request — so there is no path by which a partner
 * can put a price on a deal that is not in the price book.
 *
 * The Growth Plan monthly figure is deliberately not written anywhere on the
 * deal: it is display-only and can never become a commissionable base.
 */
export async function selectPackage(dealId: string, priceBookId: string) {
  const actor = await requirePartner();

  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: { id: true, partnerId: true, market: true, stage: true, priceBookId: true, onboardingFee: true },
  });
  if (!deal || deal.partnerId !== actor.partnerId) throw new Error("Deal not found.");
  if (["won", "lost", "lapsed"].includes(deal.stage)) throw new Error("This deal is closed.");
  // A staff-set custom price outranks the picker — a partner must not be able
  // to swap it back to a price-book fee themselves.
  if (deal.priceBookId === null && deal.onboardingFee !== null) {
    throw new Error("This deal has custom pricing set by Catalyst. Talk to your Catalyst contact if it should change.");
  }

  const pkg = await db.priceBook.findUnique({
    where: { id: priceBookId },
    select: { id: true, market: true, onboardingFee: true, program: true, tier: true, activeTo: true, family: true },
  });
  if (!pkg) throw new Error("That package is not in the price book.");
  // India and US are independent books. A deal only ever sees its own market's
  // rows, and this re-checks it server-side.
  if (pkg.market !== deal.market) throw new Error("That package is not available in this deal's market.");
  if (pkg.activeTo && pkg.activeTo < new Date()) throw new Error("That package is no longer available.");

  await db.deal.update({
    where: { id: deal.id },
    data: {
      priceBookId: pkg.id,
      onboardingFee: pkg.onboardingFee, // straight from the price book
      family: pkg.family,
      estimatedTier: pkg.tier,
    },
  });

  await writeAudit({
    actor, entity: "deal", entityId: deal.id, action: "package_selected",
    before: { priceBookId: deal.priceBookId, onboardingFee: deal.onboardingFee },
    after: { priceBookId: pkg.id, onboardingFee: pkg.onboardingFee, program: pkg.program, tier: pkg.tier },
    reason: "Partner selected a package from the price book",
  });

  revalidatePath(`/partner/deals/${deal.id}`);
  revalidatePath("/partner");
  return { ok: true as const };
}

/** A partner proposes a price. Recorded only — no money moves until staff approve. */
export async function requestCustomPriceAction(dealId: string, amountMajor: string, note: string) {
  const actor = await requirePartner();
  const cleaned = amountMajor.replace(/[,\s]/g, "");
  if (!cleaned || !Number.isFinite(Number(cleaned)) || Number(cleaned) <= 0) throw new Error("Enter a valid amount.");
  await requestCustomPrice({ actor, dealId, amount: toMinor(Number(cleaned)), note });
  revalidatePath(`/partner/deals/${dealId}`);
  revalidatePath(`/partner/deals/${dealId}/quote`);
}
