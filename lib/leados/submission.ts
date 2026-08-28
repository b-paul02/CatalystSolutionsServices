// Public form submission pipeline (blueprint §5.8): rate-limit/bot-check are
// done by the route; this module validates, persists consent evidence, matches
// identity, creates/updates the lead, scores, assigns, and acknowledges.
import { db } from "@/lib/audit/db";
import type { FormSpec, Distribution, PageSpec } from "./campaigns";
import { normalizeEmail, normalizePhone } from "./leads";
import { createLead } from "./leadWrite";
import { contactHashes, isSuppressed } from "./suppression";
import { sendLosMail } from "./email";
import { logLosAudit } from "./audit";

export type SubmissionResult =
  | { outcome: "accepted"; submissionId: string; message: string }
  | { outcome: "invalid"; problem: string };

export async function processSubmission(opts: {
  campaignId: string;
  values: Record<string, string>;
  consentChecked: boolean;
  utm: Record<string, string>;
  trackingCode?: string | null;
  ip?: string | null;
}): Promise<SubmissionResult> {
  const campaign = await db.losCampaign.findUnique({ where: { id: opts.campaignId } });
  if (!campaign || campaign.status !== "active") return { outcome: "invalid", problem: "This campaign is not accepting submissions." };
  const version = await db.losCampaignVersion.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: "desc" },
  });
  if (!version) return { outcome: "invalid", problem: "Campaign is not published." };
  const formSpec = JSON.parse(version.formSpec) as FormSpec;
  const pageSpec = JSON.parse(version.pageSpec) as PageSpec;
  const distribution = campaign.distribution ? (JSON.parse(campaign.distribution) as Distribution) : null;

  // 2. schema validation + normalization
  const values: Record<string, string> = {};
  for (const field of [...formSpec.fields, ...formSpec.qualifying]) {
    const raw = (opts.values[field.key] ?? "").trim().slice(0, 500);
    if (field.required && !raw) return { outcome: "invalid", problem: `${field.label} is required.` };
    if (raw) values[field.key] = raw;
  }
  const email = normalizeEmail(values.email);
  const phone = normalizePhone(values.phone);
  if (!email && !phone) return { outcome: "invalid", problem: "A valid phone number or email is required." };
  if (!opts.consentChecked) return { outcome: "invalid", problem: "Consent is required to submit this form." };

  // Suppressed contacts: politely accept nothing.
  if (await isSuppressed(contactHashes(email, phone), campaign.orgId)) {
    return { outcome: "invalid", problem: "This contact cannot be processed." };
  }

  // 3. consent evidence FIRST — before any lead write.
  const consentRecord = {
    purposes: formSpec.consentPurposes,
    channels: formSpec.consentChannels,
    noticeVersion: campaign.noticeVersion,
  };
  for (const contactHash of contactHashes(email, phone)) {
    await db.losConsentEvent.create({
      data: {
        contactHash, orgId: campaign.orgId,
        kind: "consent_given",
        purpose: formSpec.consentPurposes.join(","),
        channel: formSpec.consentChannels.join(","),
        noticeVersion: campaign.noticeVersion,
        sourceApp: campaign.id,
        data: JSON.stringify({ campaignName: campaign.name, ip: opts.ip ?? null }),
      },
    });
  }

  // 5-6. identity match within tenant: update instead of duplicate.
  const existing = await db.losLead.findFirst({
    where: {
      orgId: campaign.orgId, leadType: "b2c", deletedAt: null,
      OR: [...(email ? [{ normalizedEmail: email }] : []), ...(phone ? [{ normalizedPhone: phone }] : [])],
    },
    include: { b2c: true },
  });

  let leadId: string;
  let status: string;
  if (existing) {
    // Merge permissions upward (never downgrade), refresh interest, re-open if lost.
    const oldPurposes = existing.b2c ? (JSON.parse(existing.b2c.permittedPurposes ?? "[]") as string[]) : [];
    const oldChannels = existing.b2c ? (JSON.parse(existing.b2c.permittedChannels ?? "[]") as string[]) : [];
    await db.losLeadB2c.update({
      where: { leadId: existing.id },
      data: {
        permittedPurposes: JSON.stringify([...new Set([...oldPurposes, ...formSpec.consentPurposes])]),
        permittedChannels: JSON.stringify([...new Set([...oldChannels, ...formSpec.consentChannels])]),
        productInterest: values.productInterest ?? existing.b2c?.productInterest,
        noticeVersion: campaign.noticeVersion,
        withdrawnAt: null, // fresh affirmative consent supersedes an old withdrawal
      },
    });
    await db.losLead.update({
      where: { id: existing.id },
      data: { intentScore: Math.min(100, (existing.intentScore ?? 40) + 20) },
    });
    leadId = existing.id;
    status = "duplicate_updated";
  } else {
    const created = await createLead({
      orgId: campaign.orgId,
      leadType: "b2c",
      source: "form",
      sourceRef: campaign.id,
      input: {
        firstName: values.firstName, lastName: values.lastName,
        email: values.email, phone: values.phone, city: values.city,
        productInterest: values.productInterest,
      },
      lawfulUse: {
        purposes: formSpec.consentPurposes,
        channels: formSpec.consentChannels,
        noticeVersion: campaign.noticeVersion,
        evidenceNote: `Form submission, campaign "${campaign.name}"`,
      },
      demo: campaign.demo,
      rawForProvenance: values,
    });
    if (created.outcome === "invalid") return { outcome: "invalid", problem: created.problem };
    leadId = created.leadId;
    status = "accepted";
    // 7. score + assign
    const qualifyingAnswered = formSpec.qualifying.filter((q) => values[q.key]).length;
    const intentScore = Math.min(100, 50 + qualifyingAnswered * 10 + (values.email && values.phone ? 10 : 0));
    let ownerId: string | null = null;
    if (distribution && distribution.userIds.length > 0) {
      if (distribution.mode === "fixed") {
        ownerId = distribution.userIds[0];
      } else {
        // round robin: least-recently-assigned member of the pool
        const counts = await db.losLead.groupBy({
          by: ["ownerId"],
          where: { orgId: campaign.orgId, ownerId: { in: distribution.userIds }, sourceRef: campaign.id },
          _count: true,
        });
        ownerId = [...distribution.userIds].sort(
          (a, b) => (counts.find((c) => c.ownerId === a)?._count ?? 0) - (counts.find((c) => c.ownerId === b)?._count ?? 0),
        )[0];
      }
    }
    await db.losLead.update({
      where: { id: leadId },
      data: { intentScore, ownerId, status: ownerId ? "assigned" : "new" },
    });
  }

  // 4. store the submission with full evidence context
  const submission = await db.losFormSubmission.create({
    data: {
      campaignId: campaign.id, orgId: campaign.orgId,
      data: JSON.stringify(values),
      consent: JSON.stringify(consentRecord),
      utm: Object.keys(opts.utm).length ? JSON.stringify(opts.utm) : null,
      trackingCode: opts.trackingCode ?? null,
      ip: opts.ip ?? null,
      status, leadId,
    },
  });
  await db.losAttributionEvent.create({
    data: { campaignId: campaign.id, kind: "submit", trackingCode: opts.trackingCode ?? null, utm: Object.keys(opts.utm).length ? JSON.stringify(opts.utm) : null },
  });

  // 8. acknowledgement (email only until outreach channels land)
  if (distribution?.ackEmail && email) {
    sendLosMail({
      to: email,
      subject: `We received your inquiry`,
      text: distribution.ackTemplate?.slice(0, 2000) || `Hi ${values.firstName ?? ""},\n\nThanks for reaching out. Our team will contact you shortly.\n\n— ${campaign.name}`,
    }).catch(() => {});
  }
  await logLosAudit({ orgId: campaign.orgId, actorType: "system", action: "form.submission", entity: "LosFormSubmission", entityId: submission.id, data: { campaignId: campaign.id, status } });

  return { outcome: "accepted", submissionId: submission.id, message: pageSpec.thankYouMessage };
}
