import { db } from "@/lib/audit/db";
import { writeAudit } from "./audit";
import { normaliseDomain } from "./domain";
import type { Actor } from "./auth";

export const OPEN_STAGES = ["registered", "qualified", "demo_given", "proposal_sent", "negotiation"];
const DAY = 24 * 60 * 60 * 1000;

/** A rival deal keeps its hold for this long after protection lapses, if it is still being worked. */
export const RECENT_ACTIVITY_DAYS = 30;
/** Logging an activity buys this much more protection... */
export const ACTIVITY_EXTENSION_DAYS = 30;
/** ...up to this ceiling, until a proposal goes out. */
export const PROTECTION_CAP_DAYS = 180;

export type RegistrationOutcome =
  | { ok: true; dealId: string; protectedUntil: Date }
  | { ok: false; reason: "house_account" | "already_registered" | "your_own_deal" | "invalid"; message: string };

/**
 * Rejection messages are deliberately flat. A partner learns only that they
 * cannot have this account — never who holds it, when it was taken, or what
 * stage it is at. Anything more is competitive intelligence about another partner.
 */
const MESSAGES = {
  house_account: "This account is managed directly by Catalyst.",
  already_registered: "This account is already registered.",
  your_own_deal: "You have already registered this account.",
} as const;

export async function registerDeal(input: {
  actor: Actor & { partnerId: string };
  clientLegalName: string;
  website: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  market: string;
  family?: string;
  estimatedTier?: string;
  estimatedValue?: bigint | null;
  expectedCloseDate?: Date | null;
  howYouKnowThem?: string;
  notes?: string;
  now?: Date;
}): Promise<RegistrationOutcome> {
  const now = input.now ?? new Date();
  const domain = normaliseDomain(input.website);
  if (!domain) return { ok: false, reason: "invalid", message: "Enter the client's website." };
  if (!input.clientLegalName.trim()) return { ok: false, reason: "invalid", message: "Enter the client's legal name." };

  const partner = await db.partner.findUnique({
    where: { id: input.actor.partnerId },
    select: { protectionDays: true, markets: true, status: true },
  });
  if (!partner) return { ok: false, reason: "invalid", message: "Partner record not found." };
  if (partner.status === "suspended" || partner.status === "terminated") {
    return { ok: false, reason: "invalid", message: "Your partner account cannot register deals at the moment." };
  }
  const allowedMarkets = JSON.parse(partner.markets) as string[];
  if (!allowedMarkets.includes(input.market)) {
    return { ok: false, reason: "invalid", message: "You are not enabled for that market." };
  }

  const existing = await db.client.findUnique({
    where: { domainNormalised: domain },
    select: { id: true, isHouseAccount: true, existingClientSince: true },
  });

  if (existing) {
    // Catalyst's own account: never registrable, whatever its deal history.
    if (existing.isHouseAccount || existing.existingClientSince) {
      return { ok: false, reason: "house_account", message: MESSAGES.house_account };
    }

    const openDeals = await db.deal.findMany({
      where: { clientId: existing.id, stage: { in: OPEN_STAGES } },
      select: { id: true, partnerId: true, protectedUntil: true, lastActivityAt: true },
    });

    if (openDeals.some((d) => d.partnerId === input.actor.partnerId)) {
      return { ok: false, reason: "your_own_deal", message: MESSAGES.your_own_deal };
    }

    // Someone else holds it if protection is live, or if it lapsed but they are
    // demonstrably still working it.
    const held = openDeals.some(
      (d) => d.protectedUntil > now || now.getTime() - d.lastActivityAt.getTime() < RECENT_ACTIVITY_DAYS * DAY,
    );
    if (held) return { ok: false, reason: "already_registered", message: MESSAGES.already_registered };
  }

  const clientId = existing
    ? existing.id
    : (await db.client.create({
        data: {
          legalName: input.clientLegalName.trim(),
          domainNormalised: domain,
          contactName: input.contactName?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
          contactPhone: input.contactPhone?.trim() || null,
        },
        select: { id: true },
      })).id;

  const protectedUntil = new Date(now.getTime() + partner.protectionDays * DAY);
  const deal = await db.deal.create({
    data: {
      partnerId: input.actor.partnerId,
      clientId,
      market: input.market,
      stage: "registered",
      family: input.family || null,
      estimatedTier: input.estimatedTier || null,
      estimatedValue: input.estimatedValue ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      howYouKnowThem: input.howYouKnowThem?.trim() || null,
      notes: input.notes?.trim() || null,
      registeredAt: now,
      protectedUntil,
      lastActivityAt: now,
    },
    select: { id: true, protectedUntil: true },
  });

  await writeAudit({
    actor: input.actor, entity: "deal", entityId: deal.id, action: "registered",
    after: { clientId, domain, market: input.market, protectedUntil },
    reason: "Partner registered a deal",
  });

  return { ok: true, dealId: deal.id, protectedUntil: deal.protectedUntil };
}

/**
 * Logging an activity extends protection by 30 days, capped at 180 days from
 * registration until a proposal has been sent.
 */
export function extendedProtection(opts: {
  registeredAt: Date;
  protectedUntil: Date;
  proposalSentAt: Date | null;
  now?: Date;
}): Date {
  const now = opts.now ?? new Date();
  const base = opts.protectedUntil > now ? opts.protectedUntil : now;
  const extended = new Date(base.getTime() + ACTIVITY_EXTENSION_DAYS * DAY);
  if (opts.proposalSentAt) return extended; // cap lifts once a proposal is out
  const cap = new Date(opts.registeredAt.getTime() + PROTECTION_CAP_DAYS * DAY);
  return extended > cap ? cap : extended;
}

export async function logActivity(input: {
  actor: Actor & { partnerId: string };
  dealId: string;
  type: string;
  notes?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const deal = await db.deal.findUnique({
    where: { id: input.dealId },
    select: { id: true, partnerId: true, registeredAt: true, protectedUntil: true, proposalSentAt: true, stage: true },
  });
  // Same generic error whether the deal is missing or someone else's — a partner
  // must not be able to probe for the existence of other partners' deals.
  if (!deal || deal.partnerId !== input.actor.partnerId) throw new Error("Deal not found.");

  const protectedUntil = extendedProtection({
    registeredAt: deal.registeredAt,
    protectedUntil: deal.protectedUntil,
    proposalSentAt: deal.proposalSentAt,
    now,
  });

  await db.activity.create({
    data: { dealId: deal.id, partnerId: input.actor.partnerId, type: input.type, notes: input.notes?.trim() || null, occurredAt: now },
  });
  await db.deal.update({
    where: { id: deal.id },
    data: { lastActivityAt: now, protectedUntil },
  });
  await writeAudit({
    actor: input.actor, entity: "deal", entityId: deal.id, action: "activity_logged",
    before: { protectedUntil: deal.protectedUntil }, after: { protectedUntil, type: input.type },
  });

  return { protectedUntil };
}
