// Industry programs, add-ons, strategic partnerships and commercial rules.
// Source of truth: CATALYST_COMMERCIAL_SYSTEM.md §2–§5. Prices are verbatim —
// India and US are independent price books, never converted or merged.
// ponytail: plain data module like lib/content.ts — pages stay presentational.

export type Money = { in: string; us: string };

export type Tier = {
  label: string; // "Tier 1" | "Fixed Project" | ...
  name: string;
  positioning: string;
  whoFor: string;
  includesPrior?: boolean; // render "Everything in the previous tier, plus:"
  deliverables?: string[];
  guardrails: string[];
  setup?: Money; // onboarding — the tier price, always shown separate from monthly
  setupLabel?: string; // defaults to "Onboarding"
  monthly?: Money; // optional monthly maintenance plan — opt-in add-on, never bundled into the tier price
  surgeIn?: string; // Education India seasonal surge line
  qualifier?: Money; // Ecommerce T2 GMV qualifier
  priceNote?: string;
};

export type Program = {
  industry: string; // matches lib/content industries[].title
  name: string;
  slug: string;
  tagline: string;
  subIcps?: string;
  tierIntro?: string; // overrides the default "every tier includes the tier below" line
  tiers: Tier[];
  upgradePath: { trigger: string; to: string }[];
  // plain text, India-only (market: "in"), or market-gated dual text (in/us)
  notes?: { text?: string; market?: "in"; in?: string; us?: string }[];
  addOnModules?: { icon: string; name: string; desc: string }[];
  termLine: string;
  scopeNote?: string; // healthcare regulatory scope note
  // Custom plans only (admin-set): % of the price charged at booking. Catalogue programs are always 50.
  upfrontPct?: 50 | 100;
};

export const programs: Program[] = [
  {
    industry: "Healthcare & Clinics",
    name: "Patient Pipeline",
    slug: "patient-pipeline-bundle",
    tagline: "Fill your appointment book with trust-building visibility and reliable follow-up.",
    subIcps: "Solo doctors · dental & implant clinics · med spas · IVF · dermatology · physiotherapy · multi-doctor clinics",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    scopeNote:
      "Clinical records, prescriptions, insurance workflows, custom EHR integrations and regulatory audits require separate discovery and scoping.",
    tiers: [
      {
        label: "Tier 1",
        name: "Digital Presence",
        positioning: "Be found, trusted, and easy to contact.",
        whoFor: "Solo doctors and single-location clinics building their first real digital presence.",
        deliverables: [
          "Custom clinic website",
          "Doctor profile & credentials",
          "Local SEO + Google Business Profile",
          "WhatsApp, call & enquiry pathways",
          "Analytics + monthly report",
          "Managed hosting",
        ],
        guardrails: ["6–8 pages", "1 doctor", "1 location"],
        setup: { in: "₹85,000", us: "$4,500" },
        monthly: { in: "₹9,999/mo", us: "$699/mo" },
      },
      {
        label: "Tier 2",
        name: "Patient Growth",
        positioning: "Turn interest into booked appointments.",
        whoFor: "Clinics ready for online booking, reminders, and a steady enquiry flow — up to 2 locations.",
        includesPrior: true,
        deliverables: [
          "Online booking + payments",
          "Reminders (WhatsApp / SMS / email)",
          "Enquiry dashboard",
          "Review workflow",
          "Monthly content (1 SEO article + 4 social posts)",
        ],
        guardrails: ["10–15 pages", "Up to 2 locations", "2 staff seats", "1 SEO article + 4 social posts/mo"],
        setup: { in: "₹1,75,000", us: "$9,500" },
        monthly: { in: "₹24,999/mo", us: "$1,799/mo" },
      },
      {
        label: "Tier 3",
        name: "Clinic Scale Premium",
        positioning: "The full patient growth system — CRM, retention, and a dedicated account manager.",
        whoFor: "Multi-doctor clinics — up to 5 doctors and 3 locations — that need CRM, campaigns, and dashboards.",
        includesPrior: true,
        deliverables: [
          "Patient CRM",
          "Recall & re-engagement automation",
          "Campaign management",
          "Doctor / clinic / service dashboards",
          "Quarterly strategy",
        ],
        guardrails: ["20–30 pages", "Up to 5 doctors", "3 locations", "10 seats", "CRM", "2 articles + 8 posts/mo", "Dedicated AM"],
        setup: { in: "₹3,50,000", us: "$20,000" },
        monthly: { in: "₹59,999/mo", us: "$3,999/mo" },
      },
    ],
    addOnModules: [
      { icon: "ads_click", name: "Patient Acquisition Ads", desc: "Google & Meta campaigns with dedicated landing pages and call tracking." },
      { icon: "support_agent", name: "AI Front Desk", desc: "WhatsApp AI triage and booking bot that answers and books around the clock." },
    ],
    upgradePath: [
      { trigger: "You want online booking", to: "Tier 2" },
      { trigger: "A 2nd doctor, 3rd location, or CRM need", to: "Tier 3" },
      { trigger: "4+ locations or clinic groups", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "Professional Services",
    name: "Authority & Inquiry Engine",
    slug: "authority-inquiry-engine",
    tagline: "Generate qualified, high-value inquiries with authority content and clear funnels.",
    subIcps: "Law firms · CPA (US) · CA (India) · architecture · interior design",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Authority Foundation",
        positioning: "Look like the authority you are.",
        whoFor: "Firms establishing credibility — one office, up to 4 practice areas.",
        deliverables: [
          "Firm website with partner profiles",
          "Practice-area pages",
          "SEO + Google Business Profile",
          "Review system",
        ],
        guardrails: ["8–12 pages", "1 office", "Up to 4 practice areas", "Up to 6 partner profiles"],
        setup: { in: "₹1,10,000", us: "$6,000" },
        monthly: { in: "₹14,999/mo", us: "$999/mo" },
      },
      {
        label: "Tier 2",
        name: "Inquiry Engine",
        positioning: "Convert authority into qualified inquiries.",
        whoFor: "Firms ready for consultation booking, qualified intake, and paid visibility — up to 2 offices.",
        includesPrior: true,
        deliverables: [
          "Consultation booking",
          "Qualifying intake forms",
          "CRM pipeline",
          "Paid search / LinkedIn ads",
          "Email nurture",
          "LinkedIn content",
        ],
        guardrails: ["15–20 pages", "Up to 2 offices", "1 ad platform", "2 articles/mo", "2 CRM seats"],
        setup: { in: "₹2,25,000", us: "$12,000" },
        monthly: { in: "₹34,999/mo", us: "$2,499/mo" },
      },
      {
        label: "Tier 3",
        name: "Practice Growth System",
        positioning: "A full practice growth system with AI-assisted intake.",
        whoFor: "Multi-office firms — up to 4 offices — scaling intake, content, and AI qualification.",
        includesPrior: true,
        deliverables: [
          "AI intake qualification",
          "Practice-area microsites",
          "AEO / AI-search program",
          "Thought leadership (1 whitepaper/quarter)",
          "Partner-level dashboards",
        ],
        guardrails: ["25–35 pages", "Up to 4 offices", "2 ad platforms", "4 content pieces/mo", "AI intake bot", "10 seats", "Dedicated AM"],
        setup: { in: "₹4,50,000", us: "$25,000" },
        monthly: { in: "₹79,999/mo", us: "$4,999/mo" },
      },
    ],
    upgradePath: [
      { trigger: "You want a real enquiry flow", to: "Tier 2" },
      { trigger: "A new practice area, 3rd office, or intake triage", to: "Tier 3" },
      { trigger: "Merger or multi-city expansion", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "Local Businesses",
    name: "Local Domination",
    slug: "local-domination-pack",
    tagline: "Own your local market with a strong Google presence and steady reviews.",
    subIcps: "Commercial roofing · custom home builders · commercial HVAC · premium renovation · premium local services",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Local Foundation",
        positioning: "Own your local search presence.",
        whoFor: "Single-area operators establishing trust, reviews, and map visibility.",
        deliverables: [
          "Website + project gallery",
          "Map-pack local SEO",
          "Review generation",
          "Citations",
        ],
        guardrails: ["6–10 pages", "1 service area", "Up to 4 services"],
        setup: { in: "₹90,000", us: "$5,000" },
        monthly: { in: "₹12,499/mo", us: "$899/mo" },
      },
      {
        label: "Tier 2",
        name: "Lead Engine",
        positioning: "Turn local searches into booked estimates.",
        whoFor: "Businesses ready for paid lead flow and instant follow-up — up to 2 service areas.",
        includesPrior: true,
        deliverables: [
          "Campaign landing pages",
          "Call & form tracking",
          "CRM with speed-to-lead automation (instant text-back)",
          "Estimate follow-up",
        ],
        guardrails: ["Up to 2 service areas", "1 paid platform pair (Google Ads + LSA)", "2 CRM seats"],
        setup: { in: "₹1,75,000", us: "$9,000" },
        monthly: { in: "₹29,999/mo", us: "$2,299/mo" },
      },
      {
        label: "Tier 3",
        name: "Market Leader System",
        positioning: "The full system to lead your market.",
        whoFor: "Established operators across up to 4 service areas running campaigns year-round.",
        includesPrior: true,
        deliverables: [
          "Meta ads",
          "Seasonal campaigns (4/yr)",
          "Reactivation campaigns",
          "Job-value dashboards",
          "Maintenance-contract renewal automation (HVAC)",
        ],
        guardrails: ["Up to 4 service areas", "2 ad platforms", "AI lead qualification", "6 seats", "Dedicated AM"],
        setup: { in: "₹3,25,000", us: "$18,000" },
        monthly: { in: "₹64,999/mo", us: "$4,499/mo" },
      },
    ],
    upgradePath: [
      { trigger: "You want lead volume", to: "Tier 2" },
      { trigger: "A new crew, service line, or 3rd area", to: "Tier 3" },
      { trigger: "Multi-city or franchise scale", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "B2B Service Companies",
    name: "B2B Pipeline",
    slug: "b2b-pipeline-bundle",
    tagline: "Build a predictable pipeline designed for longer, multi-stakeholder sales cycles.",
    subIcps: "MSPs & managed IT · cybersecurity · software development firms · specialist B2B services",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Credibility Platform",
        positioning: "Credibility that survives due diligence.",
        whoFor: "Firms whose website doesn't yet match the quality of their work — up to 4 services.",
        deliverables: [
          "Positioning workshop",
          "Credibility site with case studies",
          "SEO / AEO foundations",
          "LinkedIn presence",
        ],
        guardrails: ["8–12 pages", "Up to 4 services", "3 case studies"],
        setup: { in: "₹1,25,000", us: "$7,000" },
        monthly: { in: "₹19,999/mo", us: "$1,299/mo" },
      },
      {
        label: "Tier 2",
        name: "Demand Engine",
        positioning: "Generate and nurture demand beyond the founder's network.",
        whoFor: "Firms where founder-led selling has hit its ceiling.",
        includesPrior: true,
        deliverables: [
          "Lead magnets",
          "CRM + lead scoring",
          "Founder ghost-writing",
          "Paid campaigns",
          "Email nurture",
        ],
        guardrails: ["1 ad platform", "3 CRM seats", "1 gated asset/quarter", "2 articles + 8 LinkedIn posts/mo"],
        setup: { in: "₹2,50,000", us: "$14,000" },
        monthly: { in: "₹44,999/mo", us: "$2,999/mo" },
      },
      {
        label: "Tier 3",
        name: "Pipeline System",
        positioning: "A predictable, attributed pipeline system.",
        whoFor: "Firms with a sales team that need ABM, attribution, and AI qualification.",
        includesPrior: true,
        deliverables: [
          "ABM campaigns",
          "Data enrichment",
          "Attribution dashboards",
          "Case-study engine (1/quarter)",
        ],
        guardrails: ["2 ad platforms", "ABM up to 50 accounts", "AI qualification", "10 seats", "Dedicated AM"],
        setup: { in: "₹5,00,000", us: "$28,000" },
        monthly: { in: "₹89,999/mo", us: "$5,999/mo" },
      },
    ],
    upgradePath: [
      { trigger: "Founder-led selling hits its ceiling", to: "Tier 2" },
      { trigger: "A sales team, attribution, or ABM need", to: "Tier 3" },
      { trigger: "Multi-geo or an embedded team", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "SaaS & Technology",
    name: "SaaS Growth Engine",
    slug: "saas-growth-engine",
    tagline: "Turn trials into paying, retained customers with one connected system.",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Launch-Ready Presence",
        positioning: "Positioning and a site that's ready to convert.",
        whoFor: "Early products that need a credible, conversion-focused presence.",
        deliverables: [
          "Positioning sprint",
          "Conversion-focused site",
          "Event tracking",
          "SEO / AEO",
        ],
        guardrails: ["6–10 pages", "1 product"],
        setup: { in: "₹1,50,000", us: "$8,000" },
        monthly: { in: "₹19,999/mo", us: "$1,499/mo" },
      },
      {
        label: "Tier 2",
        name: "Demand & Conversion Engine",
        positioning: "Turn traffic into pipeline.",
        whoFor: "Teams under a post-funding growth mandate — content, paid, and CRO.",
        includesPrior: true,
        deliverables: [
          "Comparison & use-case content",
          "Paid campaigns",
          "CRM + nurture",
          "CRO program",
        ],
        guardrails: ["1 ad platform", "3 editorial pieces/mo", "1 CRO test/mo"],
        setup: { in: "₹3,00,000", us: "$16,000" },
        monthly: { in: "₹49,999/mo", us: "$3,499/mo" },
      },
      {
        label: "Tier 3",
        name: "Full-Funnel Growth System",
        positioning: "Full-funnel growth, attributed to ARR.",
        whoFor: "Scaling teams under CAC scrutiny that need programmatic SEO and board-grade reporting.",
        includesPrior: true,
        deliverables: [
          "Programmatic SEO",
          "PQL scoring",
          "Board reporting",
          "Dedicated account manager",
        ],
        guardrails: ["2 ad platforms + retargeting", "Programmatic SEO", "2 CRO tests/mo", "Attribution to ARR"],
        setup: { in: "₹6,00,000", us: "$30,000" },
        monthly: { in: "₹99,999/mo", us: "$6,999/mo" },
      },
    ],
    upgradePath: [
      { trigger: "A post-funding growth mandate", to: "Tier 2" },
      { trigger: "CAC scrutiny or a scaling sales motion", to: "Tier 3" },
      { trigger: "An embedded pod or multi-product growth", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "Real Estate",
    name: "Listing-to-Lead",
    slug: "listing-to-lead-bundle",
    tagline: "Capture leads and respond instantly so your pipeline never goes cold.",
    subIcps: "Agents & teams · luxury · commercial · developers (per-project launch packages)",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Market Presence",
        positioning: "Be the visible agent in your market.",
        whoFor: "Agents building presence in one market area.",
        guardrails: ["6–10 pages", "1 market area", "20 listings"],
        setup: { in: "₹95,000", us: "$5,000" },
        monthly: { in: "₹12,999/mo", us: "$999/mo" },
      },
      {
        label: "Tier 2",
        name: "Lead Machine",
        positioning: "Your own lead flow with instant AI qualification.",
        whoFor: "Agents and teams tired of portal dependence, ready for paid lead generation.",
        includesPrior: true,
        guardrails: ["1 ad platform", "3 CRM seats", "AI qualification bot"],
        setup: { in: "₹2,00,000", us: "$10,000" },
        monthly: { in: "₹34,999/mo", us: "$2,499/mo" },
      },
      {
        label: "Tier 3",
        name: "Sales Pipeline System",
        positioning: "A full sales pipeline system across areas and projects.",
        whoFor: "Teams and luxury / commercial practices working multiple areas and projects.",
        includesPrior: true,
        guardrails: ["2 ad platforms", "2 project microsites", "10 seats", "Dedicated AM"],
        setup: { in: "₹4,00,000", us: "$20,000" },
        monthly: { in: "₹69,999/mo", us: "$4,999/mo" },
      },
    ],
    notes: [
      {
        market: "in",
        text: "Developer launch packages (India): ₹3,50,000–₹12,00,000 per project — microsite, creative, 2-platform media management, AI qualification, and site-visit automation over a 3–6 month flight. Media budgets client-paid.",
      },
    ],
    upgradePath: [
      { trigger: "Portal frustration — you want your own leads", to: "Tier 2" },
      { trigger: "A team or multi-area operation", to: "Tier 3" },
      { trigger: "Developments or brokerage scale", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "Education & Training",
    name: "Enrollment Growth",
    slug: "enrollment-growth-bundle",
    tagline: "Grow student demand with enrollment funnels and admission-season firepower.",
    subIcps: "Coaching & test-prep institutes · private K-12 · training providers",
    termLine: "12-month standard term (Tier 3: 12–24 months).",
    tiers: [
      {
        label: "Tier 1",
        name: "Institution Presence",
        positioning: "A credible institutional presence.",
        whoFor: "Institutes and schools establishing presence — one campus, up to 4 programs.",
        guardrails: ["8–12 pages", "1 campus", "Up to 4 programs"],
        setup: { in: "₹1,00,000", us: "$5,500" },
        monthly: { in: "₹14,999/mo", us: "$999/mo" },
      },
      {
        label: "Tier 2",
        name: "Enrollment Engine",
        positioning: "An enrollment engine built for admission season.",
        whoFor: "Institutes under admission-target pressure.",
        includesPrior: true,
        deliverables: [
          "Admission landing pages",
          "Counselor CRM",
          "WhatsApp-first enquiry automation",
        ],
        guardrails: ["1 ad platform", "2 seasonal bursts/yr", "3 seats"],
        setup: { in: "₹2,25,000", us: "$11,000" },
        monthly: { in: "₹29,999/mo", us: "$2,299/mo" },
        surgeIn: "+₹50,000/mo across 4 seasonal surge months",
      },
      {
        label: "Tier 3",
        name: "Admissions Growth System",
        positioning: "A full admissions growth system with 24×7 season coverage.",
        whoFor: "Multi-branch institutions — up to 3 branches — with counselor overload.",
        includesPrior: true,
        deliverables: [
          "AI counselor bot (24×7 season coverage)",
          "Program microsites",
          "Cost-per-enrollment dashboards",
        ],
        guardrails: ["Up to 3 branches", "2 ad platforms", "AI counselor bot", "10 seats", "Dedicated AM"],
        setup: { in: "₹4,50,000", us: "$22,000" },
        monthly: { in: "₹59,999/mo", us: "$4,499/mo" },
        surgeIn: "+₹75,000/mo across 4 seasonal surge months",
      },
    ],
    notes: [{ market: "in", text: "Seasonal surge months are contracted at signing." }],
    upgradePath: [
      { trigger: "Admission-target pressure", to: "Tier 2" },
      { trigger: "A new program, branch, or counselor overload", to: "Tier 3" },
      { trigger: "Multi-city or university scale", to: "Strategic Partnership" },
    ],
  },
  {
    industry: "Ecommerce",
    name: "Revenue Stack",
    slug: "ecommerce-revenue-stack",
    tagline: "Grow revenue per visitor with acquisition, conversion, and retention working together.",
    termLine: "12-month standard term.",
    tiers: [
      {
        label: "Tier 1",
        name: "Store Foundation",
        positioning: "A store foundation built to convert.",
        whoFor: "Stores getting their foundation right — one store, styled SKUs, and core email flows.",
        guardrails: ["1 store", "Up to 50 SKUs styled", "3 email flows"],
        setup: { in: "₹1,40,000", us: "$7,500" },
        monthly: { in: "₹14,999/mo", us: "$1,299/mo" },
      },
      {
        label: "Tier 2",
        name: "Revenue Engine",
        positioning: "A revenue engine for proven stores.",
        whoFor: "Established stores past the GMV qualifier, ready for CRO and paid growth.",
        includesPrior: true,
        guardrails: ["1 ad platform", "2 CRO tests/mo", "Up to 300 SKUs"],
        setup: { in: "₹2,75,000", us: "$15,000" },
        monthly: { in: "₹49,999/mo", us: "$3,499/mo" },
        qualifier: { in: "≥₹1Cr annual GMV", us: "≥$500k annual GMV" },
      },
    ],
    notes: [
      { text: "Beyond Tier 2 — replatforming, marketplaces, or international expansion — is a custom-quoted Ecommerce Partnership." },
    ],
    upgradePath: [
      { trigger: "Past the GMV qualifier, ready to scale", to: "Tier 2" },
      { trigger: "Replatform, marketplaces, or international", to: "Ecommerce Partnership (custom quote)" },
    ],
  },
  {
    industry: "Coaches & Consultants",
    name: "Calendar-Filling System",
    slug: "calendar-filling-system",
    tagline: "Build your personal brand and keep your calendar full of ideal clients.",
    tierIntro: "One package, deliberately — no tiers to compare. Pay 50% of onboarding to book; monthly maintenance is optional and can be added at checkout.",
    termLine: "3-month initial term.",
    tiers: [
      {
        label: "Single Package",
        name: "Calendar-Filling System",
        positioning: "One package, one job: fill your calendar with qualified calls.",
        whoFor: "Established high-ticket coaches and consultants only.",
        deliverables: [
          "5–7 page personal-brand site",
          "1 lead magnet",
          "5-email nurture sequence",
          "Booking integration",
          "8 posts/mo across 2 channels",
        ],
        guardrails: ["Established high-ticket practitioners only", "3-month initial term"],
        setup: { in: "₹75,000", us: "$4,000" },
        monthly: { in: "₹9,999/mo", us: "$799/mo" },
      },
    ],
    notes: [{ text: "There is no Tier 3 or Tier 4 for this program — by design." }],
    upgradePath: [],
  },
  {
    industry: "Startups",
    name: "Launch Kit & Build Studio",
    slug: "launch-kit",
    tagline: "Validate, launch, and scale with brand, product, and go-to-market in one place.",
    tierIntro: "A project model, not a tier ladder — pick the stage you're at. An ongoing care plan is available once you've launched.",
    termLine: "Projects are milestone-billed; the Care Plan is billed monthly in advance.",
    tiers: [
      {
        label: "Fixed Project",
        name: "Launch Kit",
        positioning: "Everything you need to launch credibly.",
        whoFor: "Startups that need brand, deck, and site ready for market.",
        deliverables: [
          "Positioning sprint",
          "Brand identity + pitch-deck template",
          "5–8 page website",
          "Analytics",
        ],
        guardrails: ["Fixed-price project"],
        setup: { in: "₹2,95,000", us: "$15,500" },
        setupLabel: "Project price",
      },
      {
        label: "Custom Build",
        name: "MVP / Custom Build",
        positioning: "From blueprint to built product.",
        whoFor: "Founders building an MVP or custom product — blueprint-first, always.",
        guardrails: ["Milestone-billed 40/40/20", "Requires a paid Solution Blueprint first"],
        setup: { in: "from ₹11,00,000", us: "from $55,000" },
        setupLabel: "Build price",
        priceNote: "Solution Blueprint first — 50% of the blueprint fee is credited if the build is signed within 60 days.",
      },
      {
        label: "Retainer",
        name: "Care Plan",
        positioning: "Keep it running and improving.",
        whoFor: "Launched products that need hosting, security, and steady dev capacity.",
        deliverables: ["Hosting", "Security", "Updates", "10 dev-hours/mo"],
        guardrails: ["10 dev-hours/mo"],
        monthly: { in: "₹14,999/mo", us: "$899/mo" },
      },
    ],
    notes: [
      { in: "Solution Blueprint: ₹1,00,000–₹2,50,000 depending on scope.", us: "Solution Blueprint: $6,000–$15,000 depending on scope." },
    ],
    upgradePath: [
      { trigger: "Ready to build the product", to: "MVP / Custom Build" },
      { trigger: "Launched and growing", to: "Care Plan" },
    ],
  },
];

export const programBySlug: Record<string, Program> = Object.fromEntries(programs.map((p) => [p.slug, p]));

// Payment processing fee charged on top of online payments (§5: payment processing is a client-paid pass-through).
// Cost-based: approximates Stripe's real cost per market (INR on a US account runs ~5%; US domestic ~3%).
export const processingFeeRate = { in: 0.05, us: 0.03 } as const;

// Bookable online = fixed onboarding price (no "from" quotes, no monthly-only retainers, no T4).
export const isBookable = (t: Tier): boolean => !!t.setup && !t.setup.in.startsWith("from");
// "₹1,75,000" / "$9,500" → 175000 / 9500. Only valid for isBookable tiers.
export const setupAmount = (s: string): number => Number(s.replace(/\D/g, ""));
export const programByIndustry: Record<string, Program> = Object.fromEntries(programs.map((p) => [p.industry, p]));

// Monthly maintenance is opt-in, never part of the tier price. Added at booking, the
// tier's listed rate is locked for the term; added later it costs 15% more.
// ponytail: one rate + one shared string, no per-tier override until one exists.
export const maintenanceLaterUplift = 0.15;
export const maintenanceNote = `Add maintenance at booking to lock this rate for your term — added later, it costs ${maintenanceLaterUplift * 100}% more.`;

// §3 — Add-on catalogue (all families).
// `in`/`us` are the catalogue display strings. `setup` (one-time) and `monthly`
// are numeric major units used by online booking: setup is charged in full at
// checkout; monthly is billed with the managed service from kickoff. Entries
// with neither (quote-based "from" items) can't be added online.
export type AddOn = {
  name: string;
  in: string;
  us: string;
  setup?: { in: number; us: number };
  monthly?: { in: number; us: number };
};

export const addOns: AddOn[] = [
  { name: "Additional landing page", in: "₹15,000", us: "$750", setup: { in: 15000, us: 750 } },
  { name: "Additional location / service area / branch", in: "₹20,000 + ₹5,000/mo", us: "$1,000 + $250/mo", setup: { in: 20000, us: 1000 }, monthly: { in: 5000, us: 250 } },
  { name: "Website page pack (5)", in: "₹25,000", us: "$1,250", setup: { in: 25000, us: 1250 } },
  { name: "Microsite (practice area / program / service line)", in: "₹50,000", us: "$2,500", setup: { in: 50000, us: 2500 } },
  { name: "Additional SEO article", in: "₹6,000", us: "$300", setup: { in: 6000, us: 300 } },
  { name: "Additional social channel", in: "₹8,000/mo", us: "$400/mo", monthly: { in: 8000, us: 400 } },
  { name: "Additional ad platform (management)", in: "₹15,000/mo", us: "$750/mo", monthly: { in: 15000, us: 750 } },
  { name: "Additional campaign (setup + flight)", in: "₹30,000", us: "$1,500", setup: { in: 30000, us: 1500 } },
  { name: "Automation workflow", in: "₹20,000", us: "$1,000", setup: { in: 20000, us: 1000 } },
  { name: "CRM seat pack (5)", in: "₹5,000/mo", us: "$150/mo", monthly: { in: 5000, us: 150 } },
  { name: "Additional dashboard", in: "₹25,000", us: "$1,200", setup: { in: 25000, us: 1200 } },
  { name: "API integration (from)", in: "₹40,000", us: "$2,000" },
  { name: "Development hours pack (10 hrs)", in: "₹15,000", us: "$1,200", setup: { in: 15000, us: 1200 } },
  { name: "Development hours pack (25 hrs)", in: "₹35,000", us: "$2,750", setup: { in: 35000, us: 2750 } },
  { name: "Development hours pack (50 hrs)", in: "₹65,000", us: "$5,000", setup: { in: 65000, us: 5000 } },
  { name: "AI chatbot (website)", in: "₹60,000 + ₹8,000/mo", us: "$3,000 + $400/mo", setup: { in: 60000, us: 3000 }, monthly: { in: 8000, us: 400 } },
  { name: "WhatsApp AI bot", in: "₹50,000 + ₹6,000/mo", us: "$2,500 + $300/mo", setup: { in: 50000, us: 2500 }, monthly: { in: 6000, us: 300 } },
  { name: "AI agent workflow (from)", in: "₹1,00,000 + ₹10,000/mo", us: "$5,000 + $500/mo" },
  { name: "Gated asset / whitepaper", in: "₹35,000", us: "$2,500", setup: { in: 35000, us: 2500 } },
  { name: "Priority-support SLA uplift", in: "₹10,000/mo", us: "$500/mo", monthly: { in: 10000, us: 500 } },
  { name: "Marketplace channel management", in: "₹25,000/mo", us: "$1,250/mo", monthly: { in: 25000, us: 1250 } },
  { name: "Additional brand", in: "₹75,000 + ₹10,000/mo", us: "$4,000 + $500/mo", setup: { in: 75000, us: 4000 }, monthly: { in: 10000, us: 500 } },
];

export const addOnByName: Record<string, AddOn> = Object.fromEntries(addOns.map((a) => [a.name, a]));
// Add-ons that can be attached to an online booking (have a priced component).
export const bookableAddOns = addOns.filter((a) => a.setup || a.monthly);

// §4 — Strategic Partnerships (Tier 4). Bands shown as "starting from" — no self-serve checkout.
export const strategic = {
  process: [
    { icon: "architecture", title: "Solution Blueprint", desc: "Every partnership starts with a paid blueprint — no unpaid discovery." },
    { icon: "construction", title: "Milestone-Billed Implementation", desc: "The build phase is delivered and billed against agreed milestones." },
    { icon: "autorenew", title: "Managed-Capacity Retainer", desc: "A dedicated capacity engine runs and improves the system." },
    { icon: "add_circle", title: "SOW Expansions + Innovation", desc: "New workstreams via SOWs, with a 10% innovation allowance built in." },
  ],
  governance: "Engagement director · monthly steering · quarterly business reviews · CPI-capped annual uplift (5–8%).",
  bands: [
    { name: "Small Strategic", from: { in: "₹12L", us: "$60k" }, term: "12 months", blueprint: { in: "₹2.5L", us: "$15k" } },
    { name: "Mid Transformation", from: { in: "₹25L", us: "$120k" }, term: "18–24 months", blueprint: { in: "₹4L", us: "$25k" } },
    { name: "Large Transformation", from: { in: "₹60L", us: "$300k" }, term: "24–36 months", blueprint: { in: "₹6L", us: "$35k" } },
    { name: "Enterprise Multi-Year", from: { in: "₹1.5Cr+", us: "$750k+/yr" }, term: "36–60 months", blueprint: { in: "₹8L+", us: "$50k+" } },
  ],
  floors: { in: "No Strategic Partnership below ₹12L annual contract value. No unpaid discovery.", us: "No Strategic Partnership below $60k annual contract value. No unpaid discovery." },
  capacityUnit: { in: "₹1,50,000/mo", us: "$9,000/mo" },
};

// §5 — Commercial rules (client-facing safe). Entries with in/us are market-gated.
export const commercialRules: { text?: string; in?: string; us?: string }[] = [
  { text: "Contract terms: Tier 1–2 run 12 months (Coaches: 3 months); Tier 3 runs 12–24 months; Strategic Partnerships run on a 24–60 month MSA with SOWs." },
  { text: "Billing: onboarding is billed 50/50 (start / launch) on Tier 1–2; Tier 3 builds and all Build Studio work are milestone-billed 40/40/20; optional maintenance plans are billed monthly in advance from kickoff." },
  { text: "Monthly maintenance is optional on every tier. Added with your booking, the listed rate is locked for the term; added later, it costs 15% more." },
  { text: "The only discount: annual prepay = 1 month free." },
  { text: "Always client-paid, never inside Catalyst fees: ad/media budgets, SMS/WhatsApp usage, payment processing, premium domains, stock media, photo/video production, enterprise licences, large API usage, legal/regulatory/security audits, and large data migration." },
  {
    in: "Paid-media management is included up to ₹1,50,000/mo of spend per platform; above that, +10% of incremental spend.",
    us: "Paid-media management is included up to $10,000/mo of spend per platform; above that, +12% of incremental spend.",
  },
  { text: "Requests beyond a tier's guardrails follow a simple ladder: add-on → change request → tier upgrade. No “unlimited” anything." },
  { text: "Healthcare scope: clinical records, prescriptions, insurance workflows, custom EHR integrations and regulatory audits require separate discovery and scoping." },
];

// Short strip shown wherever pricing appears on program pages.
export const termsStrip = [
  { text: "Annual prepay = 1 month free — the only discount." },
  { text: "Ad/media budgets and pass-throughs are always client-paid, never inside Catalyst fees." },
  { text: "Beyond-guardrail requests: add-on → change request → tier upgrade." },
];
