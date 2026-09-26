// Business outcomes (GrowthOS v2, brief §I): lead attribution at capture, sales opportunities,
// recorded sales. Attribution is only ever what we can show: a tagged link that matched one of
// this workspace's campaigns (known), what the person told us (self_reported), or unknown.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { assertWritable, WorkError, type WorkActor } from "./work";
import { toMinor } from "./commercial";

export const ATTRIBUTION_LIMITS =
  "Attribution uses the campaign tag on the link a person arrived through when they enquired (single touch). It does not see earlier visits, other devices, offline influence or untagged links, and it is not proof that the content caused the sale.";

const clip = (s: string | undefined | null, n = 120) => (s ? s.slice(0, n) : null);

/** Fields to stamp on a new lead. Only ids that belong to THIS org are ever linked. */
export async function attributionFor(orgId: string, utm: Record<string, string>, formCampaignId: string | null, selfReported: string | null) {
  const code = utm.utm_campaign?.trim();
  const [byCode, variant] = await Promise.all([
    code ? db.cosCampaign.findUnique({ where: { orgId_code: { orgId, code } }, select: { id: true } }) : null,
    utm.utm_content ? db.cosContentVariant.findFirst({ where: { id: utm.utm_content, orgId }, select: { id: true, workItem: { select: { campaignId: true } } } }) : null,
  ]);
  const campaignId = byCode?.id ?? variant?.workItem.campaignId ?? null;
  const known = Boolean(campaignId || variant);
  return {
    // a form that serves a marketing campaign links the lead to it, but says nothing about the SOURCE
    marketingCampaignId: campaignId ?? formCampaignId ?? null,
    variantId: variant?.id ?? null,
    utmSource: clip(utm.utm_source), utmMedium: clip(utm.utm_medium), utmCampaign: clip(utm.utm_campaign), utmContent: clip(utm.utm_content),
    attributionKind: known ? "known" : selfReported?.trim() ? "self_reported" : "unknown",
    selfReportedSource: clip(selfReported?.trim(), 200),
  };
}

export const OPPORTUNITY_STATUSES = ["open", "qualified", "proposal", "won", "lost"] as const;

export async function createOpportunity(actor: WorkActor, input: { leadId: string; title?: string; value?: string; currency?: string }) {
  if (!can(actor.role, "leads.edit")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const lead = await db.losLead.findFirst({ where: { id: input.leadId, orgId: actor.orgId, deletedAt: null } });
  if (!lead) throw new WorkError("Lead not found.");
  if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) throw new WorkError("Currency must be a 3-letter code.");
  const camp = lead.marketingCampaignId ? await db.cosCampaign.findFirst({ where: { id: lead.marketingCampaignId, orgId: actor.orgId }, select: { id: true, engagementId: true } }) : null;
  const opp = await db.cosOpportunity.create({
    data: {
      orgId: actor.orgId, leadId: lead.id, title: input.title?.trim().slice(0, 200) || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Opportunity",
      campaignId: camp?.id ?? null, engagementId: camp?.engagementId ?? null, variantId: lead.variantId,
      valueMinor: input.value ? toMinor(input.value) : null, currency: input.currency ?? null,
      // frozen at creation: later lead edits cannot rewrite where the sale came from
      attributionKind: lead.attributionKind, attributionNote: lead.attributionKind === "known" ? `Tagged link: ${lead.utmSource ?? "?"} / ${lead.utmCampaign ?? "?"}` : lead.selfReportedSource ? `Self-reported: ${lead.selfReportedSource}` : null,
      ownerId: lead.ownerId ?? actor.userId, createdById: actor.userId, demo: lead.demo,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "opportunity.created", entity: "CosOpportunity", entityId: opp.id });
  return opp;
}

/** won = a RECORDED sale: needs amount, currency and close date. Nothing is inferred. */
export async function setOpportunityStatus(actor: WorkActor, id: string, status: string, opts: { value?: string; currency?: string; closeDate?: Date | null; lostReason?: string } = {}) {
  if (!can(actor.role, "leads.edit")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const opp = await db.cosOpportunity.findFirst({ where: { id, orgId: actor.orgId } });
  if (!opp) throw new WorkError("Opportunity not found.");
  if (!(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) throw new WorkError("Unknown status.");
  const valueMinor = opts.value ? toMinor(opts.value) : opp.valueMinor;
  const currency = opts.currency ?? opp.currency;
  const closeDate = opts.closeDate === undefined ? opp.closeDate : opts.closeDate;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new WorkError("Currency must be a 3-letter code.");
  if (status === "won" && (valueMinor == null || !currency || !closeDate)) throw new WorkError("A recorded sale needs the amount, currency and close date.");
  if (status === "lost" && !opts.lostReason?.trim() && !opp.lostReason) throw new WorkError("Say why it was lost.");
  await db.cosOpportunity.update({ where: { id: opp.id }, data: { status, valueMinor, currency, closeDate, lostReason: status === "lost" ? opts.lostReason?.trim().slice(0, 300) ?? opp.lostReason : opp.lostReason } });
  if (opp.leadId && (status === "won" || status === "qualified" || status === "lost")) {
    await db.losLead.updateMany({ where: { id: opp.leadId, orgId: actor.orgId }, data: status === "won" ? { status: "converted", convertedAt: closeDate ?? new Date() } : status === "lost" ? { status: "lost", lostReason: opts.lostReason?.slice(0, 300) } : { status: "qualified" } });
  }
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `opportunity.${status}`, entity: "CosOpportunity", entityId: opp.id });
}

/**
 * Outcomes for a period. Money is grouped BY CURRENCY and never added across currencies.
 * Demo rows are excluded unless the workspace itself is a demo workspace.
 */
export async function businessOutcomes(orgId: string, range: { start: Date; end: Date }, opts: { campaignId?: string; includeDemo: boolean }) {
  const demo = opts.includeDemo ? {} : { demo: false };
  const camp = opts.campaignId ? { marketingCampaignId: opts.campaignId } : {};
  const [byKind, qualified, opps] = await Promise.all([
    db.losLead.groupBy({ by: ["attributionKind"], where: { orgId, deletedAt: null, createdAt: { gte: range.start, lt: range.end }, ...demo, ...camp }, _count: true }),
    db.losLead.count({ where: { orgId, deletedAt: null, createdAt: { gte: range.start, lt: range.end }, status: { in: ["qualified", "converted"] }, ...demo, ...camp } }),
    db.cosOpportunity.findMany({ where: { orgId, ...demo, ...(opts.campaignId ? { campaignId: opts.campaignId } : {}), OR: [{ createdAt: { gte: range.start, lt: range.end } }, { closeDate: { gte: range.start, lt: range.end } }] }, select: { status: true, valueMinor: true, currency: true, closeDate: true, attributionKind: true, createdAt: true } }),
  ]);
  const leads = { known: 0, self_reported: 0, unknown: 0, total: 0 };
  for (const r of byKind) { const k = (r.attributionKind in leads ? r.attributionKind : "unknown") as "known" | "self_reported" | "unknown"; leads[k] += r._count; leads.total += r._count; }
  const wonInRange = opps.filter((o) => o.status === "won" && o.closeDate && o.closeDate >= range.start && o.closeDate < range.end);
  const sales: Record<string, { count: number; valueMinor: bigint; known: bigint; selfReported: bigint; unknown: bigint }> = {};
  for (const o of wonInRange) {
    const c = o.currency!;
    sales[c] ??= { count: 0, valueMinor: 0n, known: 0n, selfReported: 0n, unknown: 0n };
    sales[c].count++; sales[c].valueMinor += o.valueMinor ?? 0n;
    sales[c][o.attributionKind === "known" ? "known" : o.attributionKind === "self_reported" ? "selfReported" : "unknown"] += o.valueMinor ?? 0n;
  }
  return { leads, qualified, opportunitiesOpened: opps.filter((o) => o.createdAt >= range.start && o.createdAt < range.end).length, sales, limitations: ATTRIBUTION_LIMITS };
}
