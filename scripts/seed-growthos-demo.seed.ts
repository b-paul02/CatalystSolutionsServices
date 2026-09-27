// Synthetic GrowthOS demo data for the LOCAL development database only (never production).
// Run:  npm run seed:growthos-demo      (vitest is only the runner: it resolves the "@/…" imports)
// Everything is flagged demo:true; publishing uses the explicit TEST account — nothing leaves this machine.
// Sign in at http://localhost:3000/app/login with the accounts printed at the end.
import { activateRateCard, activeRateCard, createRateCard, grantCredits } from "@/lib/os/credits";
import { savePack } from "@/lib/os/creditPurchase";
import { TOOL_KEYS, TOOLS } from "@/lib/os/studio";
import { it } from "vitest";
import { db } from "@/lib/audit/db";
import { hashPassword } from "@/lib/leados/auth";
import { encryptField } from "@/lib/leados/crypto";
import { defaultFormSpec, defaultPageSpec } from "@/lib/leados/campaigns";
import { processSubmission } from "@/lib/leados/submission";
import { createWorkItem, decideApproval, instantiateProject, requestApproval, transitionWorkItem, type WorkActor } from "@/lib/os/work";
import * as E from "@/lib/os/engagement";
import * as C from "@/lib/os/content";
import * as P from "@/lib/os/publishing";
import * as M from "@/lib/os/commercial";
import { syncPublicationMetrics, recordManualSnapshot } from "@/lib/os/metrics";
import { createOpportunity, setOpportunityStatus } from "@/lib/os/outcomes";

const PASSWORD = "GrowthOS-demo-2026!";
const DOMAIN = "growthos-demo.example.com";

async function user(name: string, local: string) {
  const email = `${local}@${DOMAIN}`;
  return db.losUser.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: hashPassword(PASSWORD), emailVerifiedAt: new Date(), demo: true } });
}

async function workspace(name: string, industry: string, people: { id: string; role: string }[], tz: string) {
  const org = await db.losOrg.create({ data: { name, industry, market: "IN", website: "https://example.com", demo: true, termsAcceptedAt: new Date() } });
  await db.cosWorkspace.create({ data: { orgId: org.id, kind: "prospect", demo: true, timezone: tz, currency: "INR" } });
  for (const p of people) await db.losMembership.create({ data: { orgId: org.id, userId: p.id, role: p.role } });
  return org.id;
}

async function sign(orgId: string, engagementId: string, ownerId: string, services: string[], modules: string[], aiTools: string[] = []) {
  const c = await db.cosContract.create({ data: { orgId, engagementId, kind: "project", services: JSON.stringify(services), modules: JSON.stringify(modules), aiTools: JSON.stringify(aiTools), allowances: JSON.stringify({}), scopeDoc: "Synthetic scope for demonstration.", status: "active", signedById: ownerId, signedAt: new Date(), demo: true } });
  await db.cosWorkspace.update({ where: { orgId }, data: { kind: "client" } });
  await E.acceptEngagementBySignature(orgId, engagementId, ownerId);
  await E.seedChecklist(orgId, engagementId, services);
  return c;
}

it("seeds the synthetic GrowthOS demo", { timeout: 300_000 }, async () => {
  // start clean: remove earlier demo workspaces created by this script
  const old = await db.losOrg.findMany({ where: { demo: true, name: { endsWith: "(demo)" } }, select: { id: true } });
  const ids = old.map((o) => o.id);
  if (ids.length) {
    await db.cosWorkItem.deleteMany({ where: { orgId: { in: ids } } });
    await db.losAttributionEvent.deleteMany({ where: { campaignId: { in: (await db.losCampaign.findMany({ where: { orgId: { in: ids } }, select: { id: true } })).map((c) => c.id) } } });
    await db.losCampaignVersion.deleteMany({ where: { campaign: { orgId: { in: ids } } } });
    for (const m of ["losFormSubmission", "losConsentEvent", "losLeadSourceRecord", "losActivity", "losLead", "losCampaign", "cosConnection", "cosContract", "cosGoal", "cosWorkspace", "losAuditEvent", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId: { in: ids } } });
    await db.losOrg.deleteMany({ where: { id: { in: ids } } });
  }

  const [ownerU, leadU, specU] = await Promise.all([user("Asha Owner (demo)", "owner"), user("Dev Account Lead (demo)", "lead"), user("Mira Specialist (demo)", "specialist")]);
  const people = [{ id: ownerU.id, role: "owner" }, { id: leadU.id, role: "cgo_lead" }, { id: specU.id, role: "cgo_specialist" }];

  // ── 1. Visibility + acquisition: content across channels, lead capture, pipeline, recurring, scope change ──
  const orgA = await workspace("Brightside Dental (demo)", "Healthcare", people, "Asia/Kolkata");
  const lead: WorkActor = { orgId: orgA, userId: leadU.id, role: "cgo_lead" }, spec: WorkActor = { orgId: orgA, userId: specU.id, role: "cgo_specialist" }, owner: WorkActor = { orgId: orgA, userId: ownerU.id, role: "owner" };
  const engA = await E.createEngagement(orgA, leadU.id, { name: "2026 patient growth engagement", goalFocus: ["visibility", "acquisition"], readiness: "assets_ready", ownerId: leadU.id, currency: "INR", demo: true });
  await E.moveEngagement(lead, engA.id, "discovery");
  await db.cosBusinessProfile.create({ data: { orgId: orgA, businessModel: "Private dental clinic, two chairs, consult-led treatment plans.", audience: "Adults 28–55 within 8 km who have put off treatment.", offers: "Free first consult; implants; aligners; family check-ups.", geography: "Pune — Baner, Aundh, Balewadi.", salesProcess: "Front desk calls every enquiry within 2 working hours.", brandVoice: "Calm, plain-spoken, never pushy.", contentPillars: ["Patient education", "Behind the scenes", "Results and proof"], constraints: "No before/after photos without written consent.", updatedById: ownerU.id } });
  await E.moveEngagement(lead, engA.id, "proposal");
  // TOOL entitlement is its own list: everything except article drafts and image generation, to show an unentitled tool
  await sign(orgA, engA.id, ownerU.id, ["social", "content", "crm", "analytics"], ["content", "crm", "intelligence"], TOOL_KEYS.filter((k) => !["blog_article", "image"].includes(k)));
  // AI credits: SYNTHETIC rate card + pack (labelled as such everywhere, refused in production) and a starting balance
  if (!(await activeRateCard())) {
    const card = await createRateCard(JSON.stringify(Object.fromEntries(TOOLS.map((t) => [t.key, t.kind === "image" ? { base: 15, perKOutputTokens: 0 } : { base: 2, perKOutputTokens: 10 }]))), "SYNTHETIC demo rates - not a price list", "seed", true);
    await activateRateCard(card.id);
  }
  if (!(await db.cosCreditPack.findFirst({ where: { synthetic: true, active: true } }))) await savePack({ label: "SYNTHETIC demo pack", credits: 100, currency: "INR", amountMinor: 49_900, market: null, synthetic: true }, "seed");
  await grantCredits({ orgId: orgA, kind: "included", amount: 60, expiresAt: new Date(Date.now() + 60 * 86_400_000), sourceRef: `seed:${orgA}:included`, reason: "Included with the engagement (synthetic demo value)", demo: true });
  await E.moveEngagement(lead, engA.id, "onboarding");
  for (const key of ["discovery_profile", "brand_assets", "approved_claims"]) { const it2 = await db.cosChecklistItem.findFirst({ where: { engagementId: engA.id, key } }); if (it2) await E.resolveChecklistItem(owner, it2.id, "available", { note: "Provided during kickoff (synthetic)." }); }
  await E.moveEngagement(lead, engA.id, "active", "Social accounts are not connected yet — publishing work waits, everything else starts.");
  await E.updateEngagement(lead, engA.id, { billingInterval: "monthly", recurringFeeMinor: 7_500_000n, setupFeeMinor: 5_000_000n, reviewCycles: 2, responseHours: 24, renewalAt: new Date(Date.now() + 45 * 86_400_000), renewalMode: "manual" });
  await db.cosEngagement.update({ where: { id: engA.id }, data: { kickoffSummary: await E.buildKickoffSummary(orgA, engA.id) } });

  const goal = await db.cosGoal.create({ data: { orgId: orgA, engagementId: engA.id, focus: "acquisition", metric: "Booked consultations", target: 40, unit: "per month", horizon: "6 months", currentValue: 14, currentLabel: "measured", agreedAt: new Date(), agreedById: ownerU.id } });
  const src = await C.addSource(lead, { title: "Clinic fact sheet 2026", excerpt: "Open six days a week. 1200 patients treated since 2015. Two implantologists on staff." });
  const claim = await C.proposeClaim(lead, "1200 patients treated since 2015", { sourceId: src.id });
  await C.decideClaim(owner, claim.id, "approved");
  await C.proposeClaim(lead, "Most consults are booked within the same week", { evidenceNote: "Needs the front-desk log" });
  const camp = await C.createCampaign(lead, { name: "Consult First", goalId: goal.id, objective: "Book first consultations", audience: "Adults who have delayed treatment", keyMessage: "A calm, no-pressure first consult", cta: "Book a consult", destinationUrl: "https://example.com/book", channels: ["x", "linkedin", "instagram", "youtube", "blog"] });
  await db.cosCampaign.update({ where: { id: camp.id }, data: { status: "active" } });
  await instantiateProject(lead, "social", "Social content programme", true, { engagementId: engA.id, goalId: goal.id, campaignId: camp.id });

  const conn = await db.cosConnection.create({ data: { orgId: orgA, provider: "test", accountType: "user", externalAccountId: "demo-test-ok", accountLabel: "Test account (always succeeds)", status: "verified", capabilities: ["publish", "analytics"], eligibilityNote: "Development only — nothing is posted anywhere.", accessTokenEnc: encryptField("test"), config: JSON.stringify({ mode: "ok" }) } });
  const master = await C.createMaster(lead, { title: "Why the first visit is just a conversation", campaignId: camp.id, brief: "Reduce fear of the first visit; invite a consult.", body: "A first visit is a conversation: we listen, look, and explain options. No treatment is started that day unless you ask for it.", pillar: "Patient education", sourceIds: [src.id], claimIds: [claim.id] });
  const mk = (input: C.VariantInput) => C.createVariant(spec, master.id, input);
  const vPublished = await mk({ channel: "x", format: "post", body: "Your first visit is a conversation, not a commitment. We listen, look and explain — you decide what happens next.", connectionId: conn.id, destinationUrl: "https://example.com/book", cta: "Book a consult" });
  const vReview = await mk({ channel: "linkedin", format: "post", body: "Most people delay the dentist because they expect pressure. Our first visit has one goal: that you leave understanding your options. 1200 patients treated since 2015.", connectionId: conn.id, destinationUrl: "https://example.com/book" });
  const vRevision = await mk({ channel: "x", format: "thread", parts: ["1/ Nervous about the dentist? Here is what actually happens at a first visit.", "2/ We talk first. Then a gentle look. Then options, with costs, in plain words.", "3/ You go home and think about it. That is the whole visit."], connectionId: conn.id });
  await mk({ channel: "youtube", format: "short", title: "What happens at a first visit (30s)", body: "SCRIPT — hook: “Scared of the dentist?” · 3 beats: talk, look, options · CTA: book a consult. (Needs a finished video file before it can be reviewed.)" });
  await mk({ channel: "blog", format: "article", title: "What to expect at your first dental consult", body: "Draft outline: why people delay · what we do in 30 minutes · what it costs · how to book." });

  const approve = async (id: string) => { await C.moveVariant(spec, id, "internal_qa"); await C.moveVariant(lead, id, "client_review"); const a = await db.cosApproval.findFirstOrThrow({ where: { subject: "variant", subjectId: id, status: "requested" } }); return a.id; };
  await C.decideVariantApproval(owner, await approve(vPublished.id), "approved");
  const pub = await P.schedulePublication(spec, vPublished.id, { now: true });
  await P.executePublication(pub.publication.id);
  await syncPublicationMetrics(pub.publication.id);
  await approve(vReview.id); // waits for the client
  await C.decideVariantApproval(owner, await approve(vRevision.id), "rejected", { reason: "Post 2 mentions costs — please remove prices from social." });
  await C.commentOnVariant(lead, vRevision.id, "Agreed — rewriting post 2 without costs.", false);
  await C.commentOnVariant(lead, vRevision.id, "Internal: check the pricing policy with the account lead before next thread.", true);
  await recordManualSnapshot(lead, { provider: "ga4", metric: "sessions", kind: "daily", value: 64, day: new Date(Date.now() - 86_400_000), campaignId: camp.id, grade: "B" });

  const form = await db.losCampaign.create({ data: { orgId: orgA, name: "Book a consult (demo form)", status: "active", marketingCampaignId: camp.id, createdById: leadU.id, demo: true, launchedAt: new Date() } });
  await db.losCampaignVersion.create({ data: { campaignId: form.id, version: 1, formSpec: JSON.stringify(defaultFormSpec()), pageSpec: JSON.stringify(defaultPageSpec("Brightside Dental")) } });
  const enquire = (first: string, n: number, utm: Record<string, string>) => processSubmission({ campaignId: form.id, values: { firstName: first, lastName: "Synthetic", email: `${first.toLowerCase()}@${DOMAIN}`, phone: `+91980000${String(1000 + n)}` }, consentChecked: true, utm });
  await enquire("Ravi", 1, { utm_source: "x", utm_medium: "social", utm_campaign: camp.code, utm_content: vPublished.id });
  await enquire("Neha", 2, { utm_source: "x", utm_medium: "social", utm_campaign: camp.code, utm_content: vPublished.id });
  await enquire("Imran", 3, {});
  const ravi = await db.losLead.findFirstOrThrow({ where: { orgId: orgA, firstName: "Ravi" } });
  const opp = await createOpportunity(owner, { leadId: ravi.id, title: "Implant consult → treatment plan" });
  await setOpportunityStatus(owner, opp.id, "won", { value: "85000", currency: "INR", closeDate: new Date() });
  const neha = await db.losLead.findFirstOrThrow({ where: { orgId: orgA, firstName: "Neha" } });
  await setOpportunityStatus(owner, (await createOpportunity(owner, { leadId: neha.id, title: "Aligners enquiry", value: "120000", currency: "INR" })).id, "qualified");

  await E.generateCycle(orgA, engA.id); // this month's recurring work + fee record, once
  const change = await createWorkItem(lead, { title: "Google Ads pilot for implants", serviceSlug: "paid-ads", engagementId: engA.id, commercial: { incrementalCharge: 30000 }, decision: { problem: "Organic reach is slow for implants", objective: "Test paid demand for 4 weeks" } });
  await transitionWorkItem(lead, change.id, "scoped");
  await requestApproval(lead, change.id, "Scope change: Google Ads pilot (₹30,000)"); // waits for the owner
  const setup = await M.createRecord(lead, { engagementId: engA.id, kind: "setup", description: "Onboarding and setup", amount: "50000", currency: "INR", invoiceRef: "DEMO-INV-001", dueAt: new Date(Date.now() + 7 * 86_400_000) });
  await M.recordExternalPayment(lead, setup.id, "50000", "DEMO-NEFT-7781");

  // ── 2. Website delivery with milestone acceptance, sourced from a partner, access still missing ──
  const orgB = await workspace("Northwind Robotics (demo)", "B2B manufacturing", people, "Europe/Berlin");
  const leadB: WorkActor = { ...lead, orgId: orgB }, ownerB: WorkActor = { ...owner, orgId: orgB };
  const engB = await E.createEngagement(orgB, leadU.id, { name: "New website and product portal", partnerDealId: "demo-partner-deal-001", goalFocus: ["product", "acquisition"], readiness: "foundation_needed", ownerId: leadU.id, currency: "EUR", demo: true });
  await E.moveEngagement(leadB, engB.id, "proposal");
  await sign(orgB, engB.id, ownerU.id, ["website", "software", "branding"], ["projects"]);
  await E.moveEngagement(leadB, engB.id, "onboarding");
  const prof = await db.cosChecklistItem.findFirstOrThrow({ where: { engagementId: engB.id, key: "discovery_profile" } });
  await E.resolveChecklistItem(ownerB, prof.id, "available", { note: "Workshop held (synthetic)." });
  await E.moveEngagement(leadB, engB.id, "active", "Domain access is pending — launch is blocked, design and build continue.");
  await E.setHold(leadB, engB.id, "awaiting_client", "We need DNS access and the legal pages before launch can be scheduled.", ownerU.id);
  const goalB = await db.cosGoal.create({ data: { orgId: orgB, engagementId: engB.id, focus: "product", metric: "Website live with product portal", target: 1, unit: "launch", horizon: "Q4 2026" } });
  const site = await instantiateProject(leadB, "website", "Corporate website rebuild", true, { engagementId: engB.id, goalId: goalB.id });
  const ms = await db.cosWorkItem.findMany({ where: { parentId: site.id } });
  const discovery = ms.find((m) => m.templateKey === "website.discovery")!;
  for (const s of ["scoped", "ready", "in_progress", "internal_qa", "client_review"]) await transitionWorkItem(leadB, discovery.id, s);
  await decideApproval(ownerB, (await db.cosApproval.findFirstOrThrow({ where: { workItemId: discovery.id, status: "requested" } })).id, "approved"); // milestone accepted by the client
  await transitionWorkItem(leadB, discovery.id, "delivered");
  const sitemap = ms.find((m) => m.templateKey === "website.sitemap")!;
  for (const s of ["scoped", "ready", "in_progress", "internal_qa", "client_review"]) await transitionWorkItem(leadB, sitemap.id, s); // waiting for acceptance
  await instantiateProject(leadB, "software", "Customer product portal (MVP)", true, { engagementId: engB.id, goalId: goalB.id });

  console.log(`\nDemo ready. Sign in at /app/login (password for all three: ${PASSWORD})\n  client owner : owner@${DOMAIN}\n  account lead : lead@${DOMAIN}\n  specialist   : specialist@${DOMAIN}\nWorkspaces: Brightside Dental (demo), Northwind Robotics (demo)\n`);
  await db.$disconnect();
});
