"use server";

// LeadOS platform-admin actions (marketing-domain /admin area). Every action
// re-checks the platform role — the /admin middleware alone is not enough.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { suppressContact } from "@/lib/leados/suppression";
import { normalizeEmail, normalizePhone } from "@/lib/leados/leads";
import type { FormState } from "@/app/app/(auth)/actions";

const COMPLIANCE_ROLES = ["super_admin", "compliance_admin"];

// ── privacy requests ─────────────────────────────────────────────────────────

export async function markIdentityVerified(id: string): Promise<void> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  await db.losPrivacyRequest.updateMany({
    where: { id, identityVerifiedAt: null },
    data: { identityVerifiedAt: new Date(), status: "in_progress", handledById: admin.userId ?? admin.email },
  });
  revalidatePath("/admin/leados/privacy-requests");
}

export async function completeAccessRequest(id: string): Promise<void> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  const req = await db.losPrivacyRequest.findUnique({ where: { id } });
  if (!req || !req.identityVerifiedAt || req.completedAt) return;
  const hashes = JSON.parse(req.contactHashes) as string[];
  const email = normalizeEmail(req.email);
  const phone = normalizePhone(req.phone);
  const leads = await db.losLead.findMany({
    where: {
      deletedAt: null,
      OR: [...(email ? [{ normalizedEmail: email }] : []), ...(phone ? [{ normalizedPhone: phone }] : [])],
    },
    include: { b2c: true, b2b: true, org: { select: { name: true } } },
  });
  const events = await db.losConsentEvent.findMany({ where: { contactHash: { in: hashes } }, orderBy: { createdAt: "asc" } });
  const pkg = {
    generatedAt: new Date().toISOString(),
    records: leads.map((l) => ({
      heldBy: l.org.name,
      leadType: l.leadType,
      firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone,
      city: l.city, state: l.state, country: l.country,
      status: l.status, source: l.source, createdAt: l.createdAt.toISOString(),
      permissions: l.b2c ? { purposes: l.b2c.permittedPurposes, channels: l.b2c.permittedChannels } : null,
    })),
    consentHistory: events.map((e) => ({ kind: e.kind, purpose: e.purpose, channel: e.channel, at: e.createdAt.toISOString() })),
  };
  await db.losPrivacyRequest.update({
    where: { id },
    data: { status: "completed", completedAt: new Date(), resultPackage: JSON.stringify(pkg), handledById: admin.userId ?? admin.email },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "privacy.access_completed", entity: "LosPrivacyRequest", entityId: id, data: { records: leads.length } });
  revalidatePath("/admin/leados/privacy-requests");
}

export async function completeDeletionRequest(id: string): Promise<void> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  const req = await db.losPrivacyRequest.findUnique({ where: { id } });
  if (!req || !req.identityVerifiedAt || req.completedAt) return;
  const email = normalizeEmail(req.email);
  const phone = normalizePhone(req.phone);
  const hashes = JSON.parse(req.contactHashes) as string[];

  const leads = await db.losLead.findMany({
    where: {
      leadType: "b2c",
      OR: [...(email ? [{ normalizedEmail: email }] : []), ...(phone ? [{ normalizedPhone: phone }] : [])],
    },
    select: { id: true },
  });
  const ids = leads.map((l) => l.id);
  if (ids.length > 0) {
    // Hard erase: personal data goes; the consent ledger (hash-keyed) stays as
    // the record that we honored the request.
    await db.$transaction([
      db.losVerificationEvent.deleteMany({ where: { leadId: { in: ids } } }),
      db.losLeadSourceRecord.deleteMany({ where: { leadId: { in: ids } } }),
      db.losLead.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }
  await suppressContact({
    email, phone, scope: "global", reason: "privacy_request",
    note: `DSR ${id}`, createdById: admin.userId,
  });
  for (const contactHash of hashes) {
    await db.losConsentEvent.create({
      data: { contactHash, kind: "deletion", data: JSON.stringify({ requestId: id, leadsDeleted: ids.length }) },
    });
  }
  await db.losPrivacyRequest.update({
    where: { id },
    data: {
      status: "completed", completedAt: new Date(), handledById: admin.userId ?? admin.email,
      resolutionNote: `${ids.length} record(s) erased; contact globally suppressed.`,
      // The request row itself keeps only what's needed to evidence completion.
      details: null,
    },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "privacy.deletion_completed", entity: "LosPrivacyRequest", entityId: id, data: { leadsDeleted: ids.length } });
  revalidatePath("/admin/leados/privacy-requests");
}

export async function resolvePrivacyRequest(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  const id = String(form.get("id"));
  const outcome = String(form.get("outcome")); // completed | rejected
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!["completed", "rejected"].includes(outcome)) return { error: "Pick an outcome." };
  if (outcome === "rejected" && !note) return { error: "A rejection requires a documented reason." };
  await db.losPrivacyRequest.updateMany({
    where: { id, completedAt: null },
    data: { status: outcome, completedAt: new Date(), resolutionNote: note || null, handledById: admin.userId ?? admin.email },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: `privacy.${outcome}`, entity: "LosPrivacyRequest", entityId: id });
  revalidatePath("/admin/leados/privacy-requests");
  return { ok: "Updated." };
}

// ── suppression ──────────────────────────────────────────────────────────────

export async function addSuppression(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || undefined;
  if (!email && !phone) return { error: "Enter an email or phone to suppress." };
  const { suppressed } = await suppressContact({
    email, phone, scope: "global", reason: "admin", note, createdById: admin.userId,
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "suppression.add", entity: "LosSuppressionEntry", data: { leadsAffected: suppressed } });
  revalidatePath("/admin/leados/suppressions");
  return { ok: `Suppressed globally. ${suppressed} existing lead(s) marked.` };
}

// ── compliance reviews ───────────────────────────────────────────────────────

export async function decideReview(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...COMPLIANCE_ROLES);
  const id = String(form.get("id"));
  const status = String(form.get("status")); // approved | rejected | quarantined
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!["approved", "rejected", "quarantined"].includes(status)) return { error: "Pick a decision." };
  if (status !== "approved" && !note) return { error: "Rejections and quarantines need a reason." };
  const review = await db.losComplianceReview.findUnique({ where: { id } });
  await db.losComplianceReview.updateMany({
    where: { id, status: "pending" },
    data: { status, note: note || null, reviewedById: admin.userId ?? admin.email },
  });
  // Campaign reviews drive the campaign state machine.
  if (review?.subjectKind === "campaign" && review.status === "pending") {
    await db.losCampaign.updateMany({
      where: { id: review.subjectId, status: "in_review" },
      data: { status: status === "approved" ? "approved" : "rejected", reviewNote: note || null },
    });
  }
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: `compliance.review_${status}`, entity: "LosComplianceReview", entityId: id });
  revalidatePath("/admin/leados/reviews");
  return { ok: "Decision recorded." };
}
