import { db } from "@/lib/audit/db";
import { writeAudit } from "./audit";
import type { Actor } from "./auth";

/**
 * A partner's standing. Set by hand: the agreement is signed offline, and an
 * admin marks the partner active once it comes back. Phase 2's e-signature
 * integration is expected to drive this same transition automatically.
 */
export const PARTNER_STATUSES = ["pending_agreement", "active", "suspended", "terminated"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  pending_agreement: "Pending agreement",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
};

/** What each status means for the partner — shown to the admin before they commit. */
export const PARTNER_STATUS_EFFECTS: Record<PartnerStatus, string> = {
  pending_agreement: "Can sign in and register deals. Their earnings page says the agreement is still outstanding.",
  active: "Full access. Nothing on their dashboard flags an outstanding step.",
  suspended: "Can still sign in and see existing deals, but cannot register new ones.",
  terminated: "Can still sign in and see existing deals, but cannot register new ones. Use for a partner who has left.",
};

export class PartnerStatusError extends Error {}

export const MIN_REASON_LENGTH = 10;

export async function setPartnerStatus(opts: {
  actor: Actor;
  partnerId: string;
  status: string;
  reason: string;
}) {
  if (!(PARTNER_STATUSES as readonly string[]).includes(opts.status)) {
    throw new PartnerStatusError("That is not a valid partner status.");
  }
  if (opts.reason.trim().length < MIN_REASON_LENGTH) {
    throw new PartnerStatusError(`Give a reason of at least ${MIN_REASON_LENGTH} characters.`);
  }

  const partner = await db.partner.findUnique({
    where: { id: opts.partnerId },
    select: { id: true, status: true, legalName: true },
  });
  if (!partner) throw new PartnerStatusError("Partner not found.");
  if (partner.status === opts.status) {
    throw new PartnerStatusError(`This partner is already ${PARTNER_STATUS_LABELS[opts.status as PartnerStatus].toLowerCase()}.`);
  }

  const updated = await db.partner.update({
    where: { id: partner.id },
    data: { status: opts.status },
  });

  await writeAudit({
    actor: opts.actor,
    entity: "partner",
    entityId: partner.id,
    action: "status_changed",
    before: { status: partner.status },
    after: { status: opts.status },
    reason: opts.reason.trim(),
  });

  return updated;
}
