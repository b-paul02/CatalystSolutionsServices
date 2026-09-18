// Seed a demo CatalystGrowthOS workspace for two existing LeadOS users.
// Run: node --experimental-strip-types --env-file=.env scripts/seed-os-demo.ts owner@x.com lead@x.com
// Everything is flagged demo:true (wipe: scripts/wipe-leados-demo.ts).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const [ownerEmail, leadEmail] = process.argv.slice(2);

async function main() {
  if (!ownerEmail || !leadEmail) throw new Error("usage: seed-os-demo.ts <owner email> <staff email>");
  const [owner, lead] = await Promise.all([db.losUser.findUnique({ where: { email: ownerEmail } }), db.losUser.findUnique({ where: { email: leadEmail } })]);
  if (!owner || !lead) throw new Error("register both users first (/app/register)");
  await db.losUser.updateMany({ where: { id: { in: [owner.id, lead.id] } }, data: { demo: true } });

  const org = await db.losOrg.create({ data: { name: "Acme Dental (demo)", website: "https://acmedental.example", industry: "Healthcare & Clinics", market: "IN", demo: true } });
  await db.cosWorkspace.create({ data: { orgId: org.id, kind: "prospect", demo: true } });
  await db.losMembership.createMany({ data: [{ orgId: org.id, userId: owner.id, role: "owner" }, { orgId: org.id, userId: lead.id, role: "cgo_lead" }] });

  const observedAt = new Date("2026-09-10T09:00:00.000Z");
  const run = await db.cosAuditRun.create({
    data: {
      orgId: org.id, url: "https://acmedental.example", kind: "initial", scoringVersion: "scorecard-v2", demo: true,
      scores: JSON.stringify({
        visibility: { score: 48, label: "verified", confidence: "high" }, content: { score: 35, label: "detected", confidence: "medium" },
        conversion: { score: 52, label: "verified", confidence: "high" }, analytics: { score: 20, label: "assumed", confidence: "low" },
        ai: { score: null, label: "unavailable" }, speed: { score: 61, label: "verified", confidence: "high" },
      }),
      summary: JSON.stringify({
        businessName: "Acme Dental", overall: 43,
        snapshot: "A well-reviewed clinic whose website is invisible for the treatments patients actually search for, with no way to measure which enquiries turn into appointments.",
        keyPoints: ["No treatment pages rank; competitors own 'invisalign <city>'", "Booking form has 7 fields and no confirmation", "Analytics installed but no conversion events"],
        routes: [
          { name: "Local search first", involves: "GBP, treatment pages, reviews flow", effort: "Medium", tradeoffs: "Slower (8–12 weeks) but compounding" },
          { name: "Paid + landing pages", involves: "Google Ads, 2 landing pages, call tracking", effort: "Low", tradeoffs: "Fast but stops when spend stops" },
        ],
        icps: [{ name: "Adults 28–45 seeking aligners", body: "Price-sensitive, research 2–3 clinics, decide on reviews + convenience", hypothesis: true }],
        quickWins: ["Add a 3-field booking form", "Claim and complete the Google Business Profile"],
        assumptions: ["Appointment value assumed ₹4,000 — confirm with the clinic"],
        limitations: ["AI-search readiness: not measured (data unavailable)."],
      }),
    },
  });
  await db.cosFinding.createMany({
    data: [
      { orgId: org.id, auditRunId: run.id, pillar: "visibility", text: "No XML sitemap found", severity: "medium", label: "verified", evidence: "GET /sitemap.xml → 404", sourceUrl: "https://acmedental.example/sitemap.xml", observedAt },
      { orgId: org.id, auditRunId: run.id, pillar: "content", text: "No dedicated pages for the top 5 treatments", severity: "high", label: "detected", evidence: "Crawl found 6 pages; treatments only listed on the homepage", sourceUrl: "https://acmedental.example", observedAt },
      { orgId: org.id, auditRunId: run.id, pillar: "analytics", text: "No conversion events configured", severity: "high", label: "assumed", evidence: "GA4 tag present; owner says 'we don't track cost per lead'", sourceUrl: null, observedAt },
      { orgId: org.id, auditRunId: run.id, pillar: "conversion", text: "Booking form asks 7 fields with no confirmation page", severity: "medium", label: "verified", evidence: "Form at /book: 7 required inputs; submit reloads page", sourceUrl: "https://acmedental.example/book", observedAt },
    ],
  });

  const services = ["website", "seo", "local", "analytics"];
  await db.cosContract.create({
    data: {
      orgId: org.id, kind: "program", programSlug: "patient-pipeline-bundle", tier: "growth", demo: true,
      services: JSON.stringify(services), modules: JSON.stringify(["overview", "audit", "approvals", "projects", "search", "content", "intelligence", "crm"]),
      allowances: JSON.stringify({ deliverablesPerMonth: 16, reviewCycles: 2, aiCredits: 500, responseHours: 24 }),
      scopeDoc: "Treatment pages (5), Google Business Profile setup, review-request flow, conversion tracking, monthly report.",
      exclusions: "Paid advertising; video production; new brand identity.",
      pricing: JSON.stringify({ note: "Placeholder — price book pending" }),
      proposedBy: lead.id,
    },
  });
  console.log(`seeded org ${org.id} (${org.name}); sign in as ${ownerEmail} to sign the proposed scope`);
}

main().finally(() => db.$disconnect());
