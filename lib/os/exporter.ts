// Client data export (handover, brief §B/§J). Client roles get client-visible records only:
// internal notes, time, AI cost and staff-only assets are never included.
import { db } from "@/lib/audit/db";
import { isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import type { WorkActor } from "./work";
import { assetManifest } from "./assets";

export async function buildExport(actor: WorkActor) {
  const orgId = actor.orgId, staff = isStaffRole(actor.role);
  const [org, profile, engagements, contracts, goals, plans, campaigns, items, variants, approvals, revisions, deliverables, publications, reports, claims, sources, opportunities, records, events] = await Promise.all([
    db.losOrg.findUnique({ where: { id: orgId }, select: { name: true, website: true, market: true, industry: true } }),
    db.cosBusinessProfile.findUnique({ where: { orgId } }),
    db.cosEngagement.findMany({ where: { orgId }, include: { events: true, checklist: true, cycles: true } }),
    db.cosContract.findMany({ where: { orgId } }),
    db.cosGoal.findMany({ where: { orgId } }),
    db.cosPlan.findMany({ where: { orgId } }),
    db.cosCampaign.findMany({ where: { orgId } }),
    db.cosWorkItem.findMany({ where: { orgId } }),
    db.cosContentVariant.findMany({ where: { orgId } }),
    db.cosApproval.findMany({ where: { orgId }, select: { id: true, subject: true, subjectId: true, workItemId: true, version: true, contentHash: true, summary: true, status: true, reason: true, decidedById: true, decidedAt: true, createdAt: true } }),
    db.cosRevision.findMany({ where: { orgId } }),
    db.cosDeliverable.findMany({ where: { orgId } }),
    db.cosPublication.findMany({ where: { orgId }, select: { id: true, variantId: true, channel: true, adapter: true, status: true, scheduledAt: true, timezone: true, publishedAt: true, externalId: true, externalUrl: true, variantVersion: true, contentHash: true, evidenceNote: true } }),
    db.cosReport.findMany({ where: { orgId, status: "published" } }),
    db.cosClaim.findMany({ where: { orgId } }),
    db.cosSource.findMany({ where: { orgId } }),
    db.cosOpportunity.findMany({ where: { orgId } }),
    db.cosCommercialRecord.findMany({ where: { orgId }, select: { id: true, engagementId: true, kind: true, description: true, amountMinor: true, currency: true, status: true, invoiceRef: true, dueAt: true, paidMinor: true, paidBasis: true } }),
    db.cosWorkEvent.findMany({ where: { orgId, ...(staff ? {} : { internal: false }) }, select: { workItemId: true, variantId: true, kind: true, fromState: true, toState: true, data: true, createdAt: true, internal: true } }),
  ]);
  // AI Studio drafts and the credit ledger are the client's history too. Only client-paid operations carry credit
  // figures; Catalyst-paid internal runs and provider money costs are internal economics and stay out of a client copy.
  const [aiOperations, creditLedger, creditOrders] = await Promise.all([
    db.cosAiOperation.findMany({ where: { orgId, ...(staff ? {} : { payer: "client_wallet" }) }, select: { id: true, toolKey: true, userId: true, status: true, payer: true, billingPurpose: true, maxCredits: true, chargedCredits: true, inputs: true, output: true, flags: true, savedTo: true, createdAt: true, completedAt: true } }),
    db.cosCreditLedger.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }),
    db.cosCreditOrder.findMany({ where: { orgId }, select: { id: true, credits: true, currency: true, amountMinor: true, status: true, refundedMinor: true, reversedCredits: true, disputeStatus: true, createdAt: true, paidAt: true } }),
  ]);
  await logLosAudit({ orgId, actorUserId: actor.userId, actorType: "user", action: "export.downloaded", entity: "LosOrg", entityId: orgId });
  return {
    exportedAt: new Date().toISOString(), format: "growthos-export-v1", organisation: org, profile, engagements, contracts, goals, plans, campaigns,
    // internal economics (time estimates, internal charges) stay out of a client copy
    workItems: staff ? items : items.map(({ commercial: _commercial, ...rest }) => rest),
    contentVariants: variants, approvals, revisions, deliverables, publications, reports, approvedClaims: claims, sources, opportunities, commercialRecords: records, history: events,
    aiStudio: { operations: aiOperations, creditLedger, creditOrders },
    assets: await assetManifest(actor),
    note: "Asset files are downloaded one by one from assets[].versions[].download while signed in. Leads are exported from Leads → Export.",
  };
}
