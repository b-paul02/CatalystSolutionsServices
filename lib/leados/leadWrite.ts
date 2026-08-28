// The single write path for new leads — manual form, import commit, and the
// REST API all come through here so dedupe, normalization, provenance and
// verification behave identically everywhere.
import { db } from "@/lib/audit/db";
import { normalizeDomain, normalizeEmail, normalizePhone } from "./leads";
import { verifyEmail, verifyPhone } from "./verify";
import { contactHashes, isSuppressed } from "./suppression";

export type LeadInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  language?: string;
  // b2b
  companyName?: string;
  companyDomain?: string;
  jobTitle?: string;
  department?: string;
  seniority?: string;
  // b2c
  productInterest?: string;
  budgetBand?: string;
  purchaseTimeline?: string;
  preferredChannel?: string;
  tags?: string; // comma/semicolon separated
};

export type LawfulUse = {
  purposes: string[];
  channels: string[];
  evidenceNote?: string;
  noticeVersion?: string;
  retentionDays?: number;
};

export type CreateLeadResult =
  | { outcome: "created"; leadId: string }
  | { outcome: "duplicate"; leadId: string }
  | { outcome: "invalid"; problem: string };

export async function createLead(opts: {
  orgId: string;
  leadType: "b2b" | "b2c";
  input: LeadInput;
  source: string; // manual | import | api | webhook | form
  sourceRef?: string;
  lawfulUse?: LawfulUse; // required for b2c
  verify?: boolean;
  demo?: boolean;
  rawForProvenance?: unknown;
}): Promise<CreateLeadResult> {
  const { orgId, leadType, input } = opts;
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhone(input.phone);
  if (!normalizedEmail && !normalizedPhone) {
    return { outcome: "invalid", problem: "A valid email or phone is required." };
  }
  if (leadType === "b2c" && (!opts.lawfulUse || opts.lawfulUse.purposes.length === 0)) {
    return { outcome: "invalid", problem: "B2C leads require lawful-use metadata (permitted purposes)." };
  }

  // Suppressed contacts are never (re)acquired as B2C leads.
  if (leadType === "b2c") {
    const suppressed = await isSuppressed(contactHashes(normalizedEmail, normalizedPhone), orgId);
    if (suppressed) return { outcome: "invalid", problem: "This contact is on the suppression list." };
  }

  // Dedupe: one normalized contact point per org+type scope.
  const dup = await db.losLead.findFirst({
    where: {
      orgId,
      leadType,
      deletedAt: null,
      OR: [
        ...(normalizedEmail ? [{ normalizedEmail }] : []),
        ...(normalizedPhone ? [{ normalizedPhone }] : []),
      ],
    },
    select: { id: true },
  });
  if (dup) return { outcome: "duplicate", leadId: dup.id };

  // Company (b2b): find-or-create within the org by domain, else by name.
  let companyId: string | null = null;
  if (leadType === "b2b" && (input.companyName || input.companyDomain)) {
    const domain = normalizeDomain(input.companyDomain);
    const existing = await db.losCompany.findFirst({
      where: domain
        ? { orgId, domain }
        : { orgId, name: input.companyName ?? "" },
      select: { id: true },
    });
    companyId =
      existing?.id ??
      (
        await db.losCompany.create({
          data: { orgId, name: input.companyName ?? domain ?? "Unknown", domain, demo: opts.demo ?? false },
        })
      ).id;
  }

  // Verification (async-fast: MX + format only; paid providers via waterfall).
  let emailStatus = "unverified";
  let phoneStatus = "unverified";
  let emailDetail: unknown = null;
  let phoneDetail: unknown = null;
  if (opts.verify !== false) {
    if (normalizedEmail) {
      const r = await verifyEmail(normalizedEmail);
      emailStatus = r.result === "unknown" ? "unverified" : r.result;
      emailDetail = r;
    }
    if (normalizedPhone) {
      const r = await verifyPhone(normalizedPhone);
      phoneStatus = r.result === "unknown" ? "unverified" : r.result;
      phoneDetail = r;
    }
    // A lead whose only contact point is invalid is not acceptable.
    if (normalizedEmail && !normalizedPhone && emailStatus === "invalid") {
      return { outcome: "invalid", problem: "Email failed verification and no phone was provided." };
    }
    if (normalizedPhone && !normalizedEmail && phoneStatus === "invalid") {
      return { outcome: "invalid", problem: "Phone failed verification and no email was provided." };
    }
  }

  const lu = opts.lawfulUse;
  const lead = await db.losLead.create({
    data: {
      orgId,
      leadType,
      source: opts.source,
      sourceRef: opts.sourceRef ?? null,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      email: normalizedEmail ? input.email!.trim() : null,
      normalizedEmail,
      emailStatus,
      phone: normalizedPhone,
      normalizedPhone,
      phoneStatus,
      city: input.city || null,
      state: input.state || null,
      country: input.country || null,
      language: input.language || null,
      companyId,
      demo: opts.demo ?? false,
      verifiedAt: emailStatus === "valid" || phoneStatus === "valid" ? new Date() : null,
      ...(leadType === "b2b"
        ? {
            b2b: {
              create: {
                jobTitle: input.jobTitle || null,
                department: input.department || null,
                seniority: input.seniority || null,
                workEmail: normalizedEmail,
              },
            },
          }
        : {
            b2c: {
              create: {
                productInterest: input.productInterest || null,
                budgetBand: input.budgetBand || null,
                purchaseTimeline: input.purchaseTimeline || null,
                preferredChannel: input.preferredChannel || null,
                permittedPurposes: JSON.stringify(lu!.purposes),
                permittedChannels: JSON.stringify(lu!.channels),
                consentRef: lu!.evidenceNote || null,
                noticeVersion: lu!.noticeVersion || null,
                retentionExpiresAt: lu!.retentionDays
                  ? new Date(Date.now() + lu!.retentionDays * 86_400_000)
                  : null,
              },
            },
          }),
    },
  });

  // B2C: record the lawful-use evidence in the append-only consent ledger.
  if (leadType === "b2c" && lu) {
    for (const contactHash of contactHashes(normalizedEmail, normalizedPhone)) {
      await db.losConsentEvent.create({
        data: {
          contactHash, orgId, leadId: lead.id, kind: "import_evidence",
          purpose: lu.purposes.join(","), channel: lu.channels.join(","),
          noticeVersion: lu.noticeVersion ?? null,
          sourceApp: opts.sourceRef ?? opts.source,
          evidenceRef: lu.evidenceNote ?? null,
        },
      });
    }
  }

  // Tags
  const tagNames = (input.tags ?? "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  for (const name of tagNames) {
    const tag = await db.losTag.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name },
    });
    await db.losLeadTag.create({ data: { leadId: lead.id, tagId: tag.id } }).catch(() => {});
  }

  // Provenance + verification events
  await db.losLeadSourceRecord.create({
    data: {
      orgId,
      leadId: lead.id,
      kind: opts.source,
      ref: opts.sourceRef ?? null,
      raw: opts.rawForProvenance === undefined ? null : JSON.stringify(opts.rawForProvenance).slice(0, 8000),
    },
  });
  if (emailDetail) {
    await db.losVerificationEvent.create({
      data: { orgId, leadId: lead.id, channel: "email", provider: (emailDetail as { provider: string }).provider, result: emailStatus, detail: JSON.stringify(emailDetail) },
    });
  }
  if (phoneDetail) {
    await db.losVerificationEvent.create({
      data: { orgId, leadId: lead.id, channel: "phone", provider: (phoneDetail as { provider: string }).provider, result: phoneStatus, detail: JSON.stringify(phoneDetail) },
    });
  }
  // Integrations: outbound webhooks + Slack ping (fire-and-forget).
  import("./webhooksOut").then(({ dispatchWebhookEvent, notifySlack }) => {
    dispatchWebhookEvent(orgId, "lead.created", {
      id: lead.id, leadType, source: opts.source,
      firstName: lead.firstName, lastName: lead.lastName,
      email: lead.email, phone: lead.phone, city: lead.city,
    }).catch(() => {});
    notifySlack(orgId, `New ${leadType.toUpperCase()} lead: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || lead.phone} (${opts.source})`).catch(() => {});
  }).catch(() => {});

  return { outcome: "created", leadId: lead.id };
}
