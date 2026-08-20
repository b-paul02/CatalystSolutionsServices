"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireAdmin, generatePassword, hashPassword } from "@/lib/partner/auth";
import { writeAudit } from "@/lib/partner/audit";
import {
  applicationRejectedMessage, infoRequestMessage, partnerWelcomeMessage, type OutboundMessage,
} from "@/lib/partner/email";
import { REASON_CODES, type ReasonCode } from "@/lib/partner/application-fields";
import { setRate } from "@/lib/partner/rates";

// Authorization is enforced HERE, inside each mutation — not by the /admin
// middleware, which only guards page navigation.

const TRIAGE_STATUSES = ["applied", "screening", "interview", "low_priority"];

export async function assignReviewer(applicationId: string, reviewerId: string | null) {
  const actor = await requireAdmin();
  const before = await db.partnerApplication.findUnique({ where: { id: applicationId }, select: { reviewerId: true } });
  await db.partnerApplication.update({ where: { id: applicationId }, data: { reviewerId } });
  await writeAudit({ actor, entity: "partner_application", entityId: applicationId, action: "reviewer_assigned",
    before, after: { reviewerId } });
  revalidatePath("/admin/partners/applications");
}

export async function setApplicationStatus(applicationId: string, status: string, note?: string) {
  const actor = await requireAdmin();
  if (!TRIAGE_STATUSES.includes(status)) throw new Error("Use approve or reject for a decision.");
  const before = await db.partnerApplication.findUnique({ where: { id: applicationId }, select: { status: true } });
  await db.partnerApplication.update({ where: { id: applicationId }, data: { status } });
  await writeAudit({ actor, entity: "partner_application", entityId: applicationId, action: "status_changed",
    before, after: { status }, reason: note });
  revalidatePath("/admin/partners/applications");
}

export async function addInternalNote(applicationId: string, note: string) {
  const actor = await requireAdmin();
  const app = await db.partnerApplication.findUnique({ where: { id: applicationId }, select: { internalNotes: true } });
  const stamped = `${new Date().toISOString().slice(0, 10)} · ${actor.email}: ${note.trim()}`;
  await db.partnerApplication.update({
    where: { id: applicationId },
    data: { internalNotes: app?.internalNotes ? `${app.internalNotes}\n${stamped}` : stamped },
  });
  revalidatePath(`/admin/partners/applications/${applicationId}`);
}

/**
 * Request more information. The applicant gets a link that can edit ONLY the
 * fields named here — nothing else on the application is writable.
 */
export async function requestInfo(
  applicationId: string, fields: string[], message: string,
): Promise<OutboundMessage> {
  const actor = await requireAdmin();
  if (fields.length === 0) throw new Error("Name at least one field to request.");
  const app = await db.partnerApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error("Application not found.");

  await db.partnerApplication.update({
    where: { id: applicationId },
    data: { status: "waiting_on_applicant", requestedFields: JSON.stringify(fields) },
  });
  await writeAudit({ actor, entity: "partner_application", entityId: applicationId, action: "info_requested",
    before: { status: app.status }, after: { status: "waiting_on_applicant", fields }, reason: message });

  revalidatePath("/admin/partners/applications");
  // Handed back for the admin to send themselves.
  return infoRequestMessage({ to: app.email, name: app.fullName, token: app.statusToken, message });
}

/**
 * Approve: creates the partner login and writes the FIRST commission rate row.
 * The rate is supplied by the approving admin — there is no default in code.
 */
export async function approveApplication(applicationId: string, terms: {
  rateBp: number;
  rateReason: string;
  markets: string[];
  families: string[];
  protectionDays: number;
  quoteThresholdTier: string;
  legalName: string;
}) {
  const actor = await requireAdmin();
  const app = await db.partnerApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error("Application not found.");
  if (app.convertedPartnerId) throw new Error("This application has already been approved.");
  if (terms.markets.length === 0) throw new Error("Enable at least one market.");
  if (!Number.isInteger(terms.protectionDays) || terms.protectionDays < 1 || terms.protectionDays > 365) {
    throw new Error("Protection days must be between 1 and 365.");
  }

  const email = app.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) {
    throw new Error("A user already exists with that email address.");
  }

  const password = generatePassword();
  const partner = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, role: "partner", name: app.fullName, passwordHash: hashPassword(password) },
    });
    const created = await tx.partner.create({
      data: {
        applicationId: app.id,
        userId: user.id,
        legalName: terms.legalName.trim() || app.fullName,
        entityType: app.entityType,
        contactEmail: email,
        contactPhone: app.phone,
        markets: JSON.stringify(terms.markets),
        families: JSON.stringify(terms.families),
        status: "pending_agreement",
        protectionDays: terms.protectionDays,
        quoteThresholdTier: terms.quoteThresholdTier,
      },
    });
    await tx.partnerApplication.update({
      where: { id: app.id },
      data: { status: "approved", convertedPartnerId: created.id, reviewerId: actor.userId },
    });
    return created;
  });

  // Append-only rate history starts here. Validation and the >30% second-admin
  // rule live in lib/partner/rates.
  const { needsSecondAdmin } = await setRate({
    partnerId: partner.id,
    rateBp: terms.rateBp,
    effectiveFrom: new Date(),
    reason: terms.rateReason,
    actor,
    initial: true,
  });

  await writeAudit({
    actor, entity: "partner_application", entityId: app.id, action: "approved",
    before: { status: app.status }, after: { status: "approved", partnerId: partner.id, rateBp: terms.rateBp },
    reason: terms.rateReason,
  });
  await writeAudit({
    actor, entity: "partner", entityId: partner.id, action: "created",
    after: { legalName: partner.legalName, markets: terms.markets, protectionDays: terms.protectionDays },
  });

  revalidatePath("/admin/partners/applications");
  // The password is shown to the admin ONCE, here. Only its hash is stored, so
  // it cannot be recovered later — use "Reset password" on the partner record.
  return {
    partnerId: partner.id,
    needsSecondAdmin,
    message: partnerWelcomeMessage({
      to: email, name: app.fullName, password, rateBp: terms.rateBp, markets: terms.markets,
    }),
  };
}

/**
 * Reject: reason code is internal only. The applicant's email is short and
 * gracious and never carries the code. The record is retained.
 */
export async function rejectApplication(
  applicationId: string, reasonCode: ReasonCode, internalNote?: string,
): Promise<OutboundMessage> {
  const actor = await requireAdmin();
  if (!REASON_CODES.includes(reasonCode)) throw new Error("Choose a rejection reason.");
  const app = await db.partnerApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error("Application not found.");
  if (app.convertedPartnerId) throw new Error("This application has already been approved.");

  await db.partnerApplication.update({
    where: { id: applicationId },
    data: {
      status: "rejected",
      reasonCode,
      reviewerId: actor.userId,
      internalNotes: internalNote?.trim()
        ? `${app.internalNotes ? `${app.internalNotes}\n` : ""}${new Date().toISOString().slice(0, 10)} · ${actor.email}: ${internalNote.trim()}`
        : app.internalNotes,
    },
  });
  await writeAudit({
    actor, entity: "partner_application", entityId: applicationId, action: "rejected",
    before: { status: app.status }, after: { status: "rejected", reasonCode }, reason: internalNote,
  });

  revalidatePath("/admin/partners/applications");
  return applicationRejectedMessage({ to: app.email, name: app.fullName });
}

/** Bulk actions. Deliberately excludes approve and reject — decisions are one at a time. */
export async function bulkAction(ids: string[], action: "assign" | "low_priority", reviewerId?: string) {
  const actor = await requireAdmin();
  if (ids.length === 0) return;
  if (action === "assign") {
    await db.partnerApplication.updateMany({ where: { id: { in: ids } }, data: { reviewerId: reviewerId ?? null } });
  } else {
    await db.partnerApplication.updateMany({
      where: { id: { in: ids }, status: { in: TRIAGE_STATUSES } },
      data: { status: "low_priority" },
    });
  }
  for (const id of ids) {
    await writeAudit({ actor, entity: "partner_application", entityId: id, action: `bulk_${action}`, after: { reviewerId } });
  }
  revalidatePath("/admin/partners/applications");
}
