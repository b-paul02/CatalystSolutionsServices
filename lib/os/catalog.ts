// CatalystGrowthOS catalogue: modules, the twelve service lines → studios, and
// studio delivery templates (milestones + QA gates). Static and in code, like
// the RBAC matrix — versioned with the features that use it. Commercial program
// definitions (tiers, deliverables, prices) stay in lib/programs.ts.
import { programs } from "@/lib/programs";

// A module is a nav-level area a workspace can be entitled to (blueprint §4.1).
// "core" modules are always on; the rest come from active contracts.
export const MODULES = {
  overview: { label: "Overview", core: true },
  audit: { label: "Growth Audit", core: true },
  approvals: { label: "Approvals", core: true },
  // v2 core areas: every workspace sees its engagement, assets and results
  engagement: { label: "Engagement", core: true },
  assets: { label: "Assets", core: true },
  results: { label: "Results", core: true },
  strategy: { label: "Strategy", core: false },
  content: { label: "Content Studio", core: false },
  search: { label: "Search Studio", core: false },
  ads: { label: "Ads Studio", core: false },
  projects: { label: "Projects", core: false },
  crm: { label: "CRM", core: false }, // LeadOS leads / pipeline / outreach / campaigns
  lead_supply: { label: "Lead Supply", core: false }, // LeadOS discover / deliveries (token economy)
  intelligence: { label: "Intelligence", core: false },
  automations: { label: "Workflows", core: false }, // every paying workspace (any active contract)
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const CORE_MODULES = MODULE_KEYS.filter((k) => MODULES[k].core);

export type ChecklistItem = { key: string; label: string };
export type Milestone = { key: string; title: string; clientReview: boolean; riskTier: 0 | 1 | 2 | 3 };

export type ServiceDef = {
  slug: string; // matches lib/services.ts
  title: string;
  studio: string;
  modules: ModuleKey[];
  aiRole: string;
  humanRole: string;
  milestones: Milestone[];
  qa: ChecklistItem[]; // release / review gate — all must be checked to pass internal QA
};

const m = (key: string, title: string, clientReview = false, riskTier: 0 | 1 | 2 | 3 = 1): Milestone => ({ key, title, clientReview, riskTier });
const q = (key: string, label: string): ChecklistItem => ({ key, label });

export const SERVICES: ServiceDef[] = [
  {
    slug: "ai-strategy", title: "AI Strategy & Growth Consulting", studio: "Strategy", modules: ["strategy", "intelligence"],
    aiRole: "Explores plans and assumptions", humanRole: "Growth strategist reviews; client authorizes",
    milestones: [m("goals", "Goals, constraints and budget agreed", true), m("plan", "Growth plan v1", true), m("review", "Quarterly plan review", true)],
    qa: [q("evidence", "Every recommendation cites evidence or is labelled an assumption"), q("budget", "Budget ranges and dependencies stated"), q("no_guarantee", "No guaranteed revenue / ranking claims")],
  },
  {
    slug: "website", title: "Website Design & Development", studio: "Website", modules: ["projects"],
    aiRole: "Briefs and QA suggestions", humanRole: "Designer / developer implement and test",
    milestones: [m("discovery", "Discovery", true), m("sitemap", "Sitemap", true), m("copy", "Page copy", true), m("design", "Visual design", true), m("build", "Responsive build on staging"), m("qa", "Accessibility, speed and device QA"), m("acceptance", "Client acceptance of staging", true), m("launch", "Launch", true, 3), m("care", "Handover & care plan")],
    qa: [q("design_signoff", "Client design sign-off recorded"), q("staging", "Staging QA passed on mobile + desktop"), q("a11y", "Accessibility basics checked"), q("speed", "Core Web Vitals measured"), q("deploy_auth", "Deployment authorized by named approver"), q("rollback", "Rollback plan documented")],
  },
  {
    slug: "seo", title: "SEO & AI Search Visibility", studio: "Search", modules: ["search", "content", "intelligence"],
    aiRole: "Opportunities and briefs", humanRole: "SEO specialist validates and executes",
    milestones: [m("technical", "Technical audit & fixes list", true), m("keywords", "Keyword & topic map", true), m("cluster", "First topic cluster live"), m("monthly", "Monthly search review", true)],
    qa: [q("validated", "Technical changes validated by specialist before implementation"), q("dated", "AI-citation checks recorded as dated observations"), q("no_rank_promise", "No ranking guarantees in copy or reports")],
  },
  {
    slug: "paid-ads", title: "Paid Advertising", studio: "Ads", modules: ["ads", "intelligence"],
    aiRole: "Reads and recommends", humanRole: "Media buyer executes; client governs spend",
    milestones: [m("tracking", "Conversion tracking verified"), m("structure", "Objective, structure & budget proposal", true, 3), m("creative", "Creative", true), m("launch", "Campaign launch", true, 3), m("optimise", "Weekly optimisation notes")],
    qa: [q("caps", "Hard spend caps set"), q("approval", "Spend change approved by named client approver"), q("no_auto_increase", "No automated budget increase configured"), q("pause_rule", "Pre-authorized pause rules documented")],
  },
  {
    slug: "social", title: "Social Media & Content Creation", studio: "Content", modules: ["content"],
    aiRole: "Planning, drafting and scheduling", humanRole: "Creative / community lead reviews",
    milestones: [m("calendar", "Two-week calendar", true), m("produce", "Assets produced"), m("publish", "Published / scheduled", false, 2)],
    qa: [q("brand", "On-brand voice and visuals"), q("claims", "Claims supported; no fabricated proof"), q("rights", "Image / music rights cleared"), q("links", "Links valid and UTM-stamped where eligible")],
  },
  {
    slug: "content", title: "Content Marketing & Copywriting", studio: "Content", modules: ["content"],
    aiRole: "Brief to article / email draft", humanRole: "Editor owns expertise and factual QA",
    milestones: [m("brief", "Brief & outline"), m("draft", "Draft"), m("edit", "Editorial + factual review"), m("publish", "Published", true, 2)],
    qa: [q("facts", "Facts and statistics sourced"), q("expertise", "Human-expertise flags resolved"), q("seo", "SEO review done"), q("claims", "No unsupported performance claims")],
  },
  {
    slug: "video", title: "Video Production", studio: "Content", modules: ["content"],
    aiRole: "Research, script and shot-list drafts — never a finished video", humanRole: "Producer, videographer and editor record, edit and render",
    milestones: [m("research", "Research & angle"), m("script", "Script", true), m("storyboard", "Storyboard / shot list"), m("recording", "Recording / footage upload"), m("edit", "Editing & rendering"), m("captions", "Captions & thumbnail"), m("qa", "Video QA"), m("publish", "Published", true, 2)],
    qa: [q("rights", "Music, footage and likeness rights cleared"), q("captions", "Captions checked by a person"), q("brand", "On-brand titles, lower thirds and thumbnail"), q("claims", "Claims supported; no fabricated proof")],
  },
  {
    slug: "crm", title: "CRM, Qualification & Follow-up", studio: "CRM", modules: ["crm"],
    aiRole: "Drafts follow-ups and classifies replies", humanRole: "CRM specialist configures; the client's team owns the conversations",
    milestones: [m("map", "Pipeline & qualification rules", true), m("capture", "Lead capture wired"), m("followup", "Follow-up sequences", true, 2), m("training", "Team training")],
    qa: [q("consent", "Consent captured on every form"), q("optout", "Opt-out tested"), q("test_lead", "Test lead flows end to end"), q("owners", "Every stage has an owner")],
  },
  {
    slug: "branding", title: "Branding & Creative", studio: "Brand", modules: ["projects"],
    aiRole: "Moodboards and iterations", humanRole: "Brand designer; rights checks",
    milestones: [m("discovery", "Discovery & positioning", true), m("directions", "Creative directions", true), m("system", "Logo system & guidelines", true), m("assets", "Asset & collateral pack")],
    qa: [q("rights", "Font / image rights checked"), q("distinct", "Distinctiveness research done where warranted"), q("owner", "Brand-owner acceptance recorded")],
  },
  {
    slug: "automation", title: "AI Automation", studio: "Automation", modules: ["projects"],
    aiRole: "Workflow proposals", humanRole: "Specialist integrates and failure-tests",
    milestones: [m("map", "Journey map", true), m("spec", "Workflow specification", true), m("build", "Build in sandbox"), m("test", "Test cases & exception protocol"), m("live", "Go live", true, 3)],
    qa: [q("least_priv", "Least-privilege credentials"), q("sandbox", "Sandbox tests passed"), q("override", "Manual override documented"), q("alerts", "Failure alerts configured")],
  },
  {
    slug: "software", title: "Mobile App & Software", studio: "Product", modules: ["projects"],
    aiRole: "Specs / code / test assistance", humanRole: "Engineers own development, QA and releases",
    milestones: [m("requirements", "Requirements", true), m("ux", "UX", true), m("backlog", "Backlog & estimates", true), m("build", "Implementation milestones"), m("test", "Test evidence"), m("acceptance", "Client acceptance", true), m("release", "Release", true, 3), m("support", "Handover & support plan")],
    qa: [q("security", "Security review done"), q("code_review", "Code review done"), q("tests", "Test evidence attached"), q("release_owner", "Release owner named"), q("acceptance", "Client acceptance recorded")],
  },
  {
    slug: "ecommerce", title: "Ecommerce & Marketplace Growth", studio: "Commerce", modules: ["projects", "intelligence"],
    aiRole: "Product insights and copy", humanRole: "Commerce expert validates store operations",
    milestones: [m("setup", "Store setup / audit", true), m("catalogue", "Catalogue & product pages"), m("listings", "Marketplace listings"), m("analytics", "Analytics & checkout QA")],
    qa: [q("product_data", "Product data validated"), q("checkout", "Checkout test order passed"), q("price_owner", "Inventory / price owner approval")],
  },
  {
    slug: "analytics", title: "Data, Analytics & Reporting", studio: "Intelligence", modules: ["intelligence"],
    aiRole: "Narrative and alerts", humanRole: "Analyst owns instrumentation and data assurance",
    milestones: [m("instrument", "Tracking plan & instrumentation"), m("dashboard", "Dashboard live", true), m("monthly", "Monthly review", true)],
    qa: [q("reconciled", "Metrics reconciled against source"), q("limits", "Limitations disclosed"), q("labels", "Measured / estimated / unavailable labelled")],
  },
  {
    slug: "local", title: "Online Reputation & Local Growth", studio: "Local", modules: ["projects"],
    aiRole: "Monitoring and reply drafts", humanRole: "Approved human edits and public replies",
    milestones: [m("audit", "Location audit"), m("gbp", "GBP tasks"), m("reviews", "Review-request flow", true, 2), m("replies", "Response drafts", true, 2), m("pages", "Local page improvements")],
    qa: [q("access", "Authorized account access"), q("truthful", "Only genuine reviews requested"), q("sensitive", "Sensitive replies human-reviewed")],
  },
];

export const serviceBySlug: Record<string, ServiceDef> = Object.fromEntries(SERVICES.map((s) => [s.slug, s]));

/** Modules a set of contracted services unlocks (plus the always-on core). */
export function modulesForServices(slugs: string[]): ModuleKey[] {
  const out = new Set<ModuleKey>(CORE_MODULES);
  for (const slug of slugs) for (const mod of serviceBySlug[slug]?.modules ?? []) out.add(mod);
  return [...out];
}

// Default service bundle per commercial program — a STARTING POINT the account
// lead edits when proposing a contract; the signed contract is the source of truth.
const PROGRAM_SERVICES: Record<string, string[]> = {
  "patient-pipeline-bundle": ["website", "seo", "local", "paid-ads", "analytics"],
  "authority-inquiry-engine": ["website", "seo", "content", "analytics"],
  "local-domination-pack": ["local", "seo", "social", "analytics"],
  "b2b-pipeline-bundle": ["ai-strategy", "seo", "content", "social", "analytics"],
  "saas-growth-engine": ["ai-strategy", "seo", "content", "paid-ads", "analytics"],
  "listing-to-lead-bundle": ["website", "paid-ads", "local", "analytics"],
  "enrollment-growth-bundle": ["website", "paid-ads", "content", "analytics"],
  "ecommerce-revenue-stack": ["ecommerce", "paid-ads", "seo", "analytics"],
  "calendar-filling-system": ["website", "content", "social", "automation"],
  "launch-kit": ["branding", "website", "ai-strategy"],
};

export const TIERS = ["foundation", "growth", "scale"] as const;
export type TierKey = (typeof TIERS)[number];

// Placeholder allowances — owner sets real numbers with the price book.
const TIER_ALLOWANCES: Record<TierKey, { deliverablesPerMonth: number; reviewCycles: number; aiCredits: number; responseHours: number }> = {
  foundation: { deliverablesPerMonth: 8, reviewCycles: 1, aiCredits: 200, responseHours: 48 },
  growth: { deliverablesPerMonth: 16, reviewCycles: 2, aiCredits: 500, responseHours: 24 },
  scale: { deliverablesPerMonth: 30, reviewCycles: 3, aiCredits: 1200, responseHours: 8 },
};

export function programDefaults(programSlug: string, tier: TierKey) {
  const program = programs.find((p) => p.slug === programSlug);
  if (!program) return null;
  const services = PROGRAM_SERVICES[programSlug] ?? [];
  // every program gets the CRM module — lead capture is part of every offer
  const modules = [...new Set<ModuleKey>([...modulesForServices(services), "crm"])];
  const tierDef = program.tiers[TIERS.indexOf(tier)] ?? program.tiers[0];
  return {
    programName: program.name,
    services,
    modules,
    allowances: TIER_ALLOWANCES[tier],
    deliverables: tierDef?.deliverables ?? [],
    exclusions: tierDef?.guardrails ?? [],
  };
}

export const PROGRAM_OPTIONS = programs.map((p) => ({ slug: p.slug, name: p.name, industry: p.industry }));
