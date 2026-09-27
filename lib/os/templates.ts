// Delivery templates for every Catalyst service area (GrowthOS v2, brief §E).
// catalog.ts owns WHAT a service is (studio, modules, milestone titles, QA gate); this file owns
// HOW it is delivered: intake, deliverables, milestone roles / dependencies / acceptance, client
// decisions, measures and recurring tasks. Static and versioned with the code, like the catalogue.
// Nothing here is a price, an allowance or a promise — those live on the engagement.
import { serviceBySlug } from "./catalog";

export type Intake = {
  key: string; kind: "access" | "asset" | "input"; label: string;
  provider?: string; // a connector id ⇒ completes itself when that connection verifies
  ownerSide?: "client" | "catalyst"; shared?: boolean; // shared ⇒ asked once per engagement, not per service
  help?: string;
};
export type MilestoneSpec = {
  role: string; acceptance: string;
  after?: string[]; // milestone keys that must be delivered first
  needs?: string[]; // intake keys that must be available first
  responsibility?: "catalyst" | "client" | "shared";
};
export type Measure = { key: string; label: string; source: "connector" | "manual" | "crm" | "evidence" };
export type Recurring = { key: string; title: string; role: string; acceptance?: string; clientReview?: boolean };
export type Template = {
  slug: string;
  // what "done well" means for this service: not every service produces a lead
  outcome: "visibility" | "acquisition" | "retention" | "operations" | "product";
  intake: Intake[]; deliverables: string[]; milestones: Record<string, MilestoneSpec>;
  clientDecisions: string[]; measures: Measure[]; recurring: Recurring[];
  // true ⇒ execution happens outside GrowthOS; we track status + evidence, never claim automation
  manualExecution: boolean;
};

const brand: Intake = { key: "brand_assets", kind: "asset", label: "Logo files, brand colours and fonts", shared: true, help: "Upload in Assets, or tell us there are none yet." };
const profile: Intake = { key: "discovery_profile", kind: "input", label: "Discovery profile completed (business, audience, offers, competitors)", shared: true };
const site: Intake = { key: "website_access", kind: "access", label: "Website / CMS admin access (invite us as a user — never share a password)", shared: true };
const ga: Intake = { key: "analytics_access", kind: "access", label: "Website analytics + Search Console connected", provider: "gsc", shared: true };

const T: Template[] = [
  {
    slug: "ai-strategy", outcome: "operations", manualExecution: false,
    intake: [profile, { key: "targets", kind: "input", label: "Business targets, budget range and constraints" }, { key: "sales_data", kind: "input", label: "Last 6–12 months of sales / lead numbers (totals are enough)" }],
    deliverables: ["ICP and positioning summary", "Competitor review", "Go-to-market and funnel plan", "Quarterly plan review"],
    milestones: {
      goals: { role: "strategist", needs: ["discovery_profile", "targets"], acceptance: "Goals have a metric, target, horizon and an agreed definition.", responsibility: "shared" },
      plan: { role: "strategist", after: ["goals"], acceptance: "Every recommendation cites evidence or is labelled an assumption; budget ranges stated." },
      review: { role: "strategist", after: ["plan"], acceptance: "Plan vs results reviewed with the client; changes recorded as a new plan version." },
    },
    clientDecisions: ["Agree goals", "Approve the growth plan", "Approve material re-allocations (±5 pts)"],
    measures: [{ key: "goal_progress", label: "Progress against agreed goals", source: "manual" }],
    recurring: [{ key: "plan_review", title: "Plan and results review", role: "strategist", clientReview: true, acceptance: "Review held; decisions recorded." }],
  },
  {
    slug: "branding", outcome: "product", manualExecution: true,
    intake: [profile, { key: "existing_brand", kind: "asset", label: "Existing brand material and anything you like / dislike" }, { key: "brand_owner", kind: "input", label: "Named brand owner who signs off" }],
    deliverables: ["Positioning and creative directions", "Logo system", "Brand guidelines", "Asset and collateral pack"],
    milestones: {
      discovery: { role: "brand designer", needs: ["discovery_profile"], acceptance: "Positioning statement and audience agreed in writing." },
      directions: { role: "brand designer", after: ["discovery"], acceptance: "2–3 distinct directions presented; one chosen by the brand owner." },
      system: { role: "brand designer", after: ["directions"], acceptance: "Logo system and guidelines accepted by the brand owner; rights checked." },
      assets: { role: "brand designer", after: ["system"], acceptance: "All source and export files uploaded to Assets with usage notes." },
    },
    clientDecisions: ["Choose a creative direction", "Accept the logo system and guidelines"],
    measures: [{ key: "acceptance", label: "Brand-owner acceptance recorded", source: "evidence" }],
    recurring: [],
  },
  {
    slug: "website", outcome: "acquisition", manualExecution: true,
    intake: [profile, brand, site, ga, { key: "domain_dns", kind: "access", label: "Domain / DNS access (delegate or invite)" }, { key: "site_content", kind: "asset", label: "Existing copy, photos, testimonials and legal pages" }],
    deliverables: ["Sitemap", "Page copy", "Visual design", "Responsive build on staging", "Launch evidence", "Care plan"],
    milestones: {
      discovery: { role: "strategist", needs: ["discovery_profile"], acceptance: "Goals, audiences and must-have pages agreed.", responsibility: "shared" },
      sitemap: { role: "UX designer", after: ["discovery"], acceptance: "Sitemap and page purposes approved by the client." },
      copy: { role: "copywriter", after: ["sitemap"], needs: ["site_content"], acceptance: "Copy for every page approved; claims supported." },
      design: { role: "designer", after: ["sitemap"], needs: ["brand_assets"], acceptance: "Visual design approved on desktop and mobile." },
      build: { role: "developer", after: ["copy", "design"], acceptance: "All pages built on staging; forms deliver to the CRM." },
      qa: { role: "QA reviewer", after: ["build"], acceptance: "Accessibility basics, speed and device checks passed; issues logged and fixed." },
      acceptance: { role: "account lead", after: ["qa"], acceptance: "Client accepts the staging site in writing." },
      launch: { role: "developer", after: ["acceptance"], needs: ["domain_dns", "website_access"], acceptance: "Live URL, launch date and rollback plan recorded as evidence." },
      care: { role: "developer", after: ["launch"], acceptance: "Care plan agreed; backups and updates scheduled." },
    },
    clientDecisions: ["Approve sitemap", "Approve copy", "Approve design", "Accept the staging site", "Authorise launch"],
    measures: [{ key: "sessions", label: "Website sessions", source: "connector" }, { key: "form_submissions", label: "Enquiries from the site", source: "crm" }, { key: "cwv", label: "Core Web Vitals", source: "manual" }],
    recurring: [{ key: "care", title: "Website care: updates, backups, uptime and fixes", role: "developer", acceptance: "Update log and backup evidence attached." }, { key: "cro", title: "Conversion review and one improvement", role: "CRO specialist", clientReview: true, acceptance: "Change shipped or test running; hypothesis and result recorded." }],
  },
  {
    slug: "software", outcome: "product", manualExecution: true,
    intake: [profile, { key: "product_owner", kind: "input", label: "Named product owner with authority to accept work" }, { key: "repo_access", kind: "access", label: "Code repository / hosting access (invite us — never share a password)" }, { key: "existing_specs", kind: "asset", label: "Existing specs, designs or systems to integrate with" }],
    deliverables: ["Requirements", "UX design", "Backlog and estimates", "Working software by milestone", "Test evidence", "Release evidence", "Handover and support plan"],
    milestones: {
      requirements: { role: "product lead", needs: ["product_owner"], acceptance: "Requirements and out-of-scope list signed by the product owner.", responsibility: "shared" },
      ux: { role: "UX designer", after: ["requirements"], acceptance: "Flows and screens approved." },
      backlog: { role: "tech lead", after: ["ux"], acceptance: "Backlog estimated; milestones and acceptance tests agreed." },
      build: { role: "engineer", after: ["backlog"], needs: ["repo_access"], acceptance: "Each implementation milestone demoed; code reviewed." },
      test: { role: "QA engineer", after: ["build"], acceptance: "Test evidence attached; open defects triaged with the client." },
      acceptance: { role: "account lead", after: ["test"], acceptance: "Product owner accepts the release candidate in writing." },
      release: { role: "tech lead", after: ["acceptance"], acceptance: "Release identifier, date, environment and rollback recorded as evidence." },
      support: { role: "tech lead", after: ["release"], acceptance: "Docs, credentials transfer and support plan handed over." },
    },
    clientDecisions: ["Sign requirements", "Approve UX", "Approve backlog and estimates", "Accept the release candidate", "Authorise release"],
    measures: [{ key: "milestones_accepted", label: "Milestones accepted", source: "evidence" }, { key: "defects_open", label: "Open defects after release", source: "manual" }],
    recurring: [{ key: "maintenance", title: "Maintenance: dependency updates, monitoring review, fixes", role: "engineer", acceptance: "Change log attached." }],
  },
  {
    slug: "seo", outcome: "visibility", manualExecution: true,
    intake: [profile, site, ga, { key: "priority_pages", kind: "input", label: "Priority services, locations and pages" }],
    deliverables: ["Baseline", "Technical findings and prioritised fixes", "Keyword and topic map", "Content briefs", "Implementation log", "Monthly search review"],
    milestones: {
      technical: { role: "SEO specialist", needs: ["analytics_access"], acceptance: "Baseline recorded; fixes prioritised by impact and effort." },
      keywords: { role: "SEO specialist", after: ["technical"], needs: ["priority_pages"], acceptance: "Topic map approved; each topic has an intent and a target page." },
      cluster: { role: "content editor", after: ["keywords"], needs: ["website_access"], acceptance: "First cluster live; URLs recorded as evidence." },
      monthly: { role: "SEO specialist", after: ["cluster"], acceptance: "Review compares the same periods; AI-search checks are dated observations." },
    },
    clientDecisions: ["Approve the fixes list", "Approve the topic map", "Approve briefs / pages before publishing"],
    measures: [{ key: "clicks", label: "Search clicks", source: "connector" }, { key: "impressions", label: "Search impressions", source: "connector" }, { key: "ai_citations", label: "AI-answer citations (dated observations)", source: "manual" }],
    recurring: [{ key: "monthly", title: "Search review and next fixes", role: "SEO specialist", clientReview: true, acceptance: "Same-period comparison; limitations stated." }, { key: "brief", title: "Content brief for the next topic", role: "SEO specialist", acceptance: "Brief links to the topic map." }],
  },
  {
    slug: "paid-ads", outcome: "acquisition", manualExecution: true,
    intake: [profile, brand, { key: "ad_account", kind: "access", label: "Ad account access (add us as a partner / user)" }, { key: "budget", kind: "input", label: "Monthly budget ceiling and who approves spend" }, { key: "conversion_tracking", kind: "access", label: "Conversion tracking in place (analytics connected)", provider: "gsc", shared: false }],
    deliverables: ["Objective and budget proposal", "Creative set", "Tracking check", "Launch evidence", "Optimisation notes"],
    milestones: {
      tracking: { role: "analyst", needs: ["conversion_tracking"], acceptance: "A test conversion is recorded end to end." },
      structure: { role: "media buyer", after: ["tracking"], needs: ["budget"], acceptance: "Objective, structure and hard budget caps approved by the named approver." },
      creative: { role: "creative", after: ["structure"], needs: ["brand_assets"], acceptance: "Creative approved; rights cleared." },
      launch: { role: "media buyer", after: ["creative"], needs: ["ad_account"], acceptance: "Campaign IDs, start date and caps recorded as evidence." },
      optimise: { role: "media buyer", after: ["launch"], acceptance: "Weekly notes: what changed, why, and the measured effect." },
    },
    clientDecisions: ["Approve objective and budget", "Approve creative", "Authorise launch", "Approve any budget change"],
    measures: [{ key: "spend", label: "Spend", source: "manual" }, { key: "leads", label: "Leads", source: "crm" }, { key: "cost_per_lead", label: "Cost per lead", source: "manual" }],
    recurring: [{ key: "optimise", title: "Optimisation and spend report", role: "media buyer", clientReview: true, acceptance: "Spend reconciled to the ad platform for the period." }],
  },
  {
    slug: "social", outcome: "visibility", manualExecution: false,
    intake: [profile, brand, { key: "social_accounts", kind: "access", label: "Social accounts connected (Settings → Connections)", provider: "linkedin" }, { key: "approved_claims", kind: "input", label: "Approved claims and source material", shared: true }],
    deliverables: ["Content calendar", "Channel variants per post", "Published posts with links", "Performance review"],
    milestones: {
      calendar: { role: "content strategist", needs: ["discovery_profile"], acceptance: "Calendar approved; every item maps to a pillar and a campaign." },
      produce: { role: "creator", after: ["calendar"], needs: ["brand_assets"], acceptance: "Variants written and media attached; internal QA passed." },
      publish: { role: "community lead", after: ["produce"], needs: ["social_accounts"], acceptance: "Each approved variant is published; link recorded." },
    },
    clientDecisions: ["Approve the calendar", "Approve each variant before it is published"],
    measures: [{ key: "impressions", label: "Impressions", source: "connector" }, { key: "engagements", label: "Engagements", source: "connector" }, { key: "link_clicks", label: "Link clicks", source: "connector" }],
    recurring: [{ key: "calendar", title: "Next content calendar", role: "content strategist", clientReview: true }, { key: "review", title: "Content performance review", role: "content strategist", acceptance: "Suggestions cite the posts and the measurement window." }],
  },
  {
    slug: "content", outcome: "visibility", manualExecution: false,
    intake: [profile, { key: "subject_experts", kind: "input", label: "Who we can interview / who fact-checks" }, { key: "blog_access", kind: "access", label: "Blog connected (WordPress application password)", provider: "wordpress" }, { key: "approved_claims", kind: "input", label: "Approved claims and source material", shared: true }],
    deliverables: ["Briefs and outlines", "Articles / emails / case studies / whitepapers", "Editorial and factual review", "Published pieces with links"],
    milestones: {
      brief: { role: "content strategist", needs: ["discovery_profile"], acceptance: "Brief names the audience, goal, sources and CTA." },
      draft: { role: "writer", after: ["brief"], acceptance: "Draft complete; sources referenced." },
      edit: { role: "editor", after: ["draft"], needs: ["subject_experts"], acceptance: "Facts checked; expertise flags resolved." },
      publish: { role: "editor", after: ["edit"], needs: ["blog_access"], acceptance: "Live URL recorded." },
    },
    clientDecisions: ["Approve the brief", "Approve the final piece"],
    measures: [{ key: "sessions", label: "Page sessions", source: "connector" }, { key: "form_submissions", label: "Enquiries from the piece", source: "crm" }],
    recurring: [{ key: "piece", title: "Long-form piece for this period", role: "writer", clientReview: true }],
  },
  {
    slug: "video", outcome: "visibility", manualExecution: true,
    intake: [profile, brand, { key: "on_camera", kind: "input", label: "Who appears on camera, and recording availability" }, { key: "youtube_access", kind: "access", label: "YouTube channel connected", provider: "youtube" }, { key: "footage", kind: "asset", label: "Existing footage, b-roll and music licences" }],
    deliverables: ["Research and script", "Storyboard / shot list", "Recorded footage", "Edited long-form video", "Short-form cuts", "Captions and thumbnail", "Published videos with links"],
    milestones: {
      research: { role: "producer", needs: ["discovery_profile"], acceptance: "Angle, audience and sources agreed." },
      script: { role: "scriptwriter", after: ["research"], acceptance: "Script approved. A script is not a video." },
      storyboard: { role: "producer", after: ["script"], acceptance: "Shot list covers every script section." },
      recording: { role: "videographer", after: ["storyboard"], needs: ["on_camera"], acceptance: "Raw footage uploaded to Assets.", responsibility: "shared" },
      edit: { role: "video editor", after: ["recording"], needs: ["brand_assets"], acceptance: "Rendered master uploaded to Assets; short-form cuts exported." },
      captions: { role: "video editor", after: ["edit"], acceptance: "Caption file and thumbnail uploaded." },
      qa: { role: "QA reviewer", after: ["captions"], acceptance: "Audio, spelling, rights and brand checks passed." },
      publish: { role: "producer", after: ["qa"], needs: ["youtube_access"], acceptance: "Video URL recorded for each published cut." },
    },
    clientDecisions: ["Approve the script", "Approve the final cut", "Approve each short-form cut"],
    measures: [{ key: "views", label: "Views", source: "connector" }, { key: "watch_time_minutes", label: "Watch time", source: "connector" }, { key: "avg_view_duration_sec", label: "Average view duration", source: "connector" }],
    recurring: [{ key: "video", title: "Video for this period (long-form + cuts)", role: "producer", clientReview: true }],
  },
  {
    slug: "crm", outcome: "acquisition", manualExecution: false,
    intake: [profile, { key: "sales_process", kind: "input", label: "Sales stages, who follows up and how fast" }, { key: "lead_sources", kind: "input", label: "Where leads arrive today (forms, phone, ads, marketplaces)" }, { key: "existing_crm", kind: "access", label: "Existing CRM export or API key (Workflows → Connections)" }],
    deliverables: ["Pipeline and qualification rules", "Lead capture forms", "Follow-up sequences", "Team training", "Pipeline report"],
    milestones: {
      map: { role: "CRM specialist", needs: ["sales_process"], acceptance: "Stages, owners and qualification rules agreed." },
      capture: { role: "CRM specialist", after: ["map"], needs: ["lead_sources"], acceptance: "Every lead source lands in the CRM with consent recorded; a test lead proves it." },
      followup: { role: "CRM specialist", after: ["capture"], acceptance: "Follow-up sequences approved; consent and opt-out respected." },
      training: { role: "account lead", after: ["followup"], acceptance: "Team trained; roles assigned.", responsibility: "shared" },
    },
    clientDecisions: ["Approve pipeline stages", "Approve follow-up messages", "Activate automations"],
    measures: [{ key: "response_time", label: "Time to first contact", source: "crm" }, { key: "qualified", label: "Qualified leads", source: "crm" }, { key: "won_value", label: "Recorded sales", source: "crm" }],
    recurring: [{ key: "pipeline_review", title: "Pipeline hygiene and follow-up review", role: "CRM specialist", acceptance: "Stale leads actioned; numbers reconciled." }],
  },
  {
    slug: "automation", outcome: "operations", manualExecution: false,
    intake: [profile, { key: "process_owner", kind: "input", label: "Process owner and the manual steps today" }, { key: "tool_access", kind: "access", label: "API keys / webhooks for the tools involved (Workflows → Connections)" }],
    deliverables: ["Journey map", "Workflow specification", "Sandbox build", "Test cases and exception protocol", "Live workflow"],
    milestones: {
      map: { role: "automation specialist", needs: ["process_owner"], acceptance: "Current and target journeys agreed." },
      spec: { role: "automation specialist", after: ["map"], acceptance: "Spec lists triggers, steps, data used, failure handling and the manual override." },
      build: { role: "automation specialist", after: ["spec"], needs: ["tool_access"], acceptance: "Built as a draft workflow; least-privilege credentials." },
      test: { role: "QA reviewer", after: ["build"], acceptance: "Test cases pass; failure alerts proven." },
      live: { role: "account lead", after: ["test"], acceptance: "Client activates the workflow; first live runs reviewed.", responsibility: "client" },
    },
    clientDecisions: ["Approve the specification", "Activate the workflow (only the client can)"],
    measures: [{ key: "runs", label: "Successful runs", source: "evidence" }, { key: "hours_saved", label: "Hours saved (estimate, labelled)", source: "manual" }],
    recurring: [{ key: "health", title: "Workflow health check", role: "automation specialist", acceptance: "Failed runs reviewed; fixes logged." }],
  },
  {
    slug: "ecommerce", outcome: "acquisition", manualExecution: true,
    intake: [profile, { key: "store_access", kind: "access", label: "Store admin / marketplace seller access (staff invitation)" }, { key: "catalogue", kind: "asset", label: "Product data, images and pricing owner" }, ga],
    deliverables: ["Store / product assessment", "Improved product pages", "Marketplace listings", "Checkout QA", "Sales measurement"],
    milestones: {
      setup: { role: "commerce specialist", needs: ["store_access"], acceptance: "Assessment ranks issues by revenue impact." },
      catalogue: { role: "commerce specialist", after: ["setup"], needs: ["catalogue"], acceptance: "Product data validated; pages approved by the price owner." },
      listings: { role: "commerce specialist", after: ["catalogue"], acceptance: "Listing URLs recorded as evidence." },
      analytics: { role: "analyst", after: ["listings"], needs: ["analytics_access"], acceptance: "Test order passes; revenue tracking reconciles to the store." },
    },
    clientDecisions: ["Approve product page changes", "Approve prices / inventory changes"],
    measures: [{ key: "orders", label: "Orders", source: "manual" }, { key: "revenue", label: "Store revenue (store's own figure)", source: "manual" }, { key: "conversion_rate", label: "Store conversion rate", source: "manual" }],
    recurring: [{ key: "merch", title: "Merchandising and listing improvements", role: "commerce specialist", clientReview: true }],
  },
  {
    slug: "analytics", outcome: "operations", manualExecution: false,
    intake: [ga, { key: "kpi_owner", kind: "input", label: "Who owns each KPI and its definition" }, { key: "data_sources", kind: "access", label: "Other data sources (ads, store, CRM) — connected or exported" }],
    deliverables: ["Tracking plan", "Instrumentation", "Dashboard", "Monthly review"],
    milestones: {
      instrument: { role: "analyst", needs: ["analytics_access", "kpi_owner"], acceptance: "Each KPI has a definition, source and owner; test events recorded." },
      dashboard: { role: "analyst", after: ["instrument"], acceptance: "Numbers reconcile to source; limitations disclosed." },
      monthly: { role: "analyst", after: ["dashboard"], acceptance: "Measured / estimated / unavailable labelled on every figure." },
    },
    clientDecisions: ["Approve KPI definitions", "Accept the dashboard"],
    measures: [{ key: "data_freshness", label: "Data freshness", source: "connector" }],
    recurring: [{ key: "report", title: "Monthly report", role: "analyst", clientReview: true, acceptance: "Grounded in stored figures only." }],
  },
  {
    slug: "local", outcome: "visibility", manualExecution: true,
    intake: [profile, { key: "gbp_access", kind: "access", label: "Google Business Profile manager access (invite us as a manager)" }, { key: "locations", kind: "input", label: "Locations, opening hours, services and photos" }, { key: "review_policy", kind: "input", label: "Who may reply to reviews, and tone" }],
    deliverables: ["Profile readiness audit", "Profile and content tasks", "Review-request flow", "Response drafts and log", "Local page improvements"],
    milestones: {
      audit: { role: "local specialist", needs: ["locations"], acceptance: "Every location checked for name, address, phone, hours and categories." },
      gbp: { role: "local specialist", after: ["audit"], needs: ["gbp_access"], acceptance: "Changes made; before/after evidence attached." },
      reviews: { role: "local specialist", after: ["gbp"], acceptance: "Only genuine customers are asked; consent respected." },
      replies: { role: "community lead", after: ["reviews"], needs: ["review_policy"], acceptance: "Each reply approved before it is posted; sensitive ones human-written." },
      pages: { role: "content editor", after: ["audit"], acceptance: "Local page URLs recorded." },
    },
    clientDecisions: ["Approve the review-request message", "Approve each public reply"],
    measures: [{ key: "reviews_count", label: "New reviews", source: "manual" }, { key: "avg_rating", label: "Average rating", source: "manual" }, { key: "replies_sent", label: "Replies posted", source: "evidence" }],
    recurring: [{ key: "reputation", title: "Review replies and profile posts", role: "community lead", clientReview: true }],
  },
];

export const TEMPLATES: Record<string, Template> = Object.fromEntries(T.map((t) => [t.slug, t]));
export const templateFor = (slug: string | null | undefined): Template | null => (slug ? TEMPLATES[slug] ?? null : null);

/** Engagement-level closing checklist (not a contractable service). */
export const HANDOVER_STEPS: { key: string; label: string; side: "client" | "catalyst" }[] = [
  { key: "export", label: "Export delivered: work history, approvals, content, assets and reports", side: "catalyst" },
  { key: "assets", label: "Source files and brand assets confirmed in the client's possession", side: "client" },
  { key: "access", label: "Catalyst access removed from client accounts (ads, CMS, analytics, profiles)", side: "client" },
  { key: "connections", label: "Connected accounts disconnected in GrowthOS (tokens destroyed)", side: "catalyst" },
  { key: "automations", label: "Workflows reviewed: kept running by the client, or paused", side: "client" },
  { key: "commercial", label: "Final invoice reference and payment status recorded", side: "catalyst" },
];

/** Template problems (used by tests): every milestone in the catalogue has a spec, every reference resolves. */
export function templateProblems(): string[] {
  const out: string[] = [];
  for (const t of T) {
    const svc = serviceBySlug[t.slug];
    if (!svc) { out.push(`${t.slug}: not in the catalogue`); continue; }
    const keys = new Set(svc.milestones.map((m) => m.key));
    const intake = new Set(t.intake.map((i) => i.key));
    for (const k of keys) if (!t.milestones[k]) out.push(`${t.slug}.${k}: no spec`);
    for (const [k, spec] of Object.entries(t.milestones)) {
      if (!keys.has(k)) out.push(`${t.slug}.${k}: not a catalogue milestone`);
      for (const a of spec.after ?? []) if (!keys.has(a)) out.push(`${t.slug}.${k}: after "${a}" unknown`);
      for (const n of spec.needs ?? []) if (!intake.has(n)) out.push(`${t.slug}.${k}: needs "${n}" unknown`);
      if (!spec.acceptance || !spec.role) out.push(`${t.slug}.${k}: acceptance and role required`);
    }
    if (!t.deliverables.length || !t.measures.length || !t.clientDecisions.length) out.push(`${t.slug}: deliverables, measures and client decisions required`);
  }
  for (const slug of Object.keys(serviceBySlug)) if (!TEMPLATES[slug]) out.push(`${slug}: no template`);
  return out;
}
