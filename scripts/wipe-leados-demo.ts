// One-command wipe of ALL demo-flagged LeadOS data (leaves real data alone).
// Run: node --experimental-strip-types --env-file=.env scripts/wipe-leados-demo.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const demoOrgs = (await db.losOrg.findMany({ where: { demo: true }, select: { id: true } })).map((o) => o.id);
  const demoLeads = (await db.losLead.findMany({ where: { OR: [{ demo: true }, { orgId: { in: demoOrgs } }] }, select: { id: true } })).map((l) => l.id);
  const demoDatasets = (await db.losDataset.findMany({ where: { demo: true }, select: { id: true } })).map((d) => d.id);
  const demoPlans = (await db.losLeadPlan.findMany({ where: { OR: [{ demo: true }, { orgId: { in: demoOrgs } }] }, select: { id: true } })).map((p) => p.id);
  const demoCampaigns = (await db.losCampaign.findMany({ where: { OR: [{ demo: true }, { orgId: { in: demoOrgs } }] }, select: { id: true } })).map((c) => c.id);

  const counts: Record<string, number> = {};
  const del = async (name: string, fn: () => Promise<{ count: number }>) => {
    counts[name] = (await fn()).count;
  };

  await del("messageEvents", () => db.losMessageEvent.deleteMany({ where: { message: { leadId: { in: demoLeads } } } }));
  await del("messages", () => db.losOutboundMessage.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("enrollments", () => db.losSequenceEnrollment.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("activities", () => db.losActivity.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("notes", () => db.losNote.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("tasks", () => db.losTask.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("scoreEvents", () => db.losScoreEvent.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("submissions", () => db.losFormSubmission.deleteMany({ where: { campaignId: { in: demoCampaigns } } }));
  await del("attribution", () => db.losAttributionEvent.deleteMany({ where: { campaignId: { in: demoCampaigns } } }));
  await del("trackingLinks", () => db.losTrackingLink.deleteMany({ where: { campaignId: { in: demoCampaigns } } }));
  await del("campaignVersions", () => db.losCampaignVersion.deleteMany({ where: { campaignId: { in: demoCampaigns } } }));
  await del("campaigns", () => db.losCampaign.deleteMany({ where: { id: { in: demoCampaigns } } }));
  await del("replacements", () => db.losLeadReplacement.deleteMany({ where: { allocation: { planId: { in: demoPlans } } } }));
  await del("allocations", () => db.losAllocation.deleteMany({ where: { planId: { in: demoPlans } } }));
  await del("allocationRuns", () => db.losAllocationRun.deleteMany({ where: { planId: { in: demoPlans } } }));
  await del("plans", () => db.losLeadPlan.deleteMany({ where: { id: { in: demoPlans } } }));
  await del("reveals", () => db.losReveal.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("verificationEvents", () => db.losVerificationEvent.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("sourceRecords", () => db.losLeadSourceRecord.deleteMany({ where: { leadId: { in: demoLeads } } }));
  await del("consentEvents", () => db.losConsentEvent.deleteMany({ where: { OR: [{ leadId: { in: demoLeads } }, { orgId: { in: demoOrgs } }] } }));
  await del("leads", () => db.losLead.deleteMany({ where: { id: { in: demoLeads } } }));
  await del("companies", () => db.losCompany.deleteMany({ where: { OR: [{ demo: true }, { orgId: { in: demoOrgs } }] } }));
  await del("inventory", () => db.losInventoryRecord.deleteMany({ where: { OR: [{ demo: true }, { datasetId: { in: demoDatasets } }] } }));
  await del("complianceReviews", () => db.losComplianceReview.deleteMany({ where: { OR: [{ demo: true }, { orgId: { in: demoOrgs } }] } }));
  await del("datasets", () => db.losDataset.deleteMany({ where: { id: { in: demoDatasets } } }));
  await del("dataSources", () => db.losDataSource.deleteMany({ where: { demo: true, datasets: { none: {} } } }));
  await del("privacyRequests", () => db.losPrivacyRequest.deleteMany({ where: { demo: true } }));
  await del("tokenLedger", () => db.losTokenLedger.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("dailyMetrics", () => db.losDailyMetric.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("webhooks", () => db.losWebhook.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("savedSearches", () => db.losSavedSearch.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("exclusions", () => db.losExclusion.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("stages", () => db.losPipelineStage.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("templates", () => db.losMessageTemplate.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("sequences", () => db.losSequence.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("invitations", () => db.losInvitation.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("apiKeys", () => db.losApiKey.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("memberships", () => db.losMembership.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("subscriptions", () => db.losSubscription.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("integrationConfigs", () => db.losIntegrationConfig.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("scoringConfigs", () => db.losScoringConfig.deleteMany({ where: { orgId: { in: demoOrgs } } }));
  await del("orgs", () => db.losOrg.deleteMany({ where: { id: { in: demoOrgs } } }));
  await del("demoUsers", () => db.losUser.deleteMany({ where: { demo: true, memberships: { none: {} } } }));

  console.log("Demo data wiped:");
  for (const [k, v] of Object.entries(counts)) if (v > 0) console.log(`  ${k}: ${v}`);
}

main().finally(() => db.$disconnect());
