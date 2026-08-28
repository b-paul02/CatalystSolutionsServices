"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { generatePassword, hashPassword, requireAdmin } from "@/lib/partner/auth";
import { writeAudit } from "@/lib/partner/audit";
import { partnerWelcomeMessage, type OutboundMessage } from "@/lib/partner/email";
import { currentRate } from "@/lib/partner/rates";

/**
 * Issues a fresh password for a partner and hands the admin the message to send.
 *
 * Needed because only the hash is stored: once the welcome text is dismissed the
 * original password is gone for good. This is the way back, not a lookup.
 */
export async function resetPartnerPassword(partnerId: string): Promise<OutboundMessage> {
  const actor = await requireAdmin();
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, legalName: true, contactEmail: true, markets: true, userId: true,
              user: { select: { name: true, email: true } } },
  });
  if (!partner) throw new Error("Partner not found.");

  const password = generatePassword();
  await db.user.update({ where: { id: partner.userId }, data: { passwordHash: hashPassword(password) } });

  await writeAudit({
    actor, entity: "user", entityId: partner.userId, action: "password_reset",
    after: { partnerId },
    reason: "Admin issued a new password to send by hand",
  });

  const rate = await currentRate(partnerId);
  revalidatePath(`/admin/partners/${partnerId}`);
  return partnerWelcomeMessage({
    to: partner.user.email,
    name: partner.user.name ?? partner.legalName,
    password,
    rateBp: rate?.rateBp ?? 0,
    markets: JSON.parse(partner.markets) as string[],
  });
}
