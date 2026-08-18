// Proof center: fictional demo brands, sample deliverables, demo sites and
// industry blueprints. Everything here is invented to demonstrate what clients
// receive — no real client names or data, ever.
// ponytail: plain data module like lib/programs.ts — pages stay presentational.

export const fictionalNote =
  "This is a fictional brand created by Catalyst to demonstrate exactly what our clients receive. All names, numbers, and results shown are illustrative — not real client data.";

/* ---------------------------------- Sample deliverables ---------------------------------- */

export type SampleBlock =
  | { kind: "kpis"; title?: string; items: { label: string; value: string; delta?: string; down?: boolean }[] }
  | { kind: "table"; title?: string; head: string[]; rows: string[][] }
  | { kind: "bars"; title: string; note?: string; items: { label: string; value: string; pct: number }[] }
  | { kind: "prose"; title?: string; paras: string[] }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "emails"; items: { day: string; subject: string; body: string[] }[] }
  | { kind: "posts"; items: { channel: string; hook: string; body: string; cta: string }[] }
  | { kind: "callout"; text: string };

export type SampleDoc = {
  slug: string;
  title: string;
  type: string; // deliverable type shown on the card
  brand: string;
  industry: string;
  icon: string;
  summary: string;
  blocks: SampleBlock[];
};

export const samples: SampleDoc[] = [
  {
    slug: "monthly-presence-report",
    title: "Monthly Presence Report",
    type: "Tier 1 Deliverable",
    brand: "Lumina Dental & Skin",
    industry: "Healthcare & Clinics",
    icon: "visibility",
    summary:
      "The report every Tier 1 client receives. Tier 1 builds presence, so the reporting covers exactly that: are you being found, is the site healthy, and is anyone contacting you.",
    blocks: [
      { kind: "callout", text: "Reporting period: March · Tier 1 (Digital Presence) · Every program's Tier 1 reports on these same fundamentals." },
      {
        kind: "kpis",
        title: "Are people finding you?",
        items: [
          { label: "Google Business Profile views", value: "3,140", delta: "+26% vs Feb" },
          { label: "Website visitors", value: "1,208", delta: "+19%" },
          { label: "Calls & enquiries", value: "47", delta: "+12" },
          { label: "Direction requests", value: "162", delta: "+31%" },
        ],
      },
      {
        kind: "table",
        title: "Search visibility — tracked terms",
        head: ["Keyword", "Feb", "Mar", "Change"],
        rows: [
          ["dentist [suburb]", "#18", "#9", "▲ 9"],
          ["dental clinic near me", "#22", "#14", "▲ 8"],
          ["teeth cleaning [city]", "not ranked", "#26", "▲ new"],
          ["skin clinic [suburb]", "#31", "#19", "▲ 12"],
        ],
      },
      {
        kind: "bars",
        title: "Site health",
        note: "Tier 1 includes managed hosting — these are the numbers that protect everything built on top later.",
        items: [
          { label: "Uptime", value: "100%", pct: 100 },
          { label: "Mobile performance score", value: "94/100", pct: 94 },
          { label: "Pages indexed by Google", value: "8 of 8", pct: 100 },
          { label: "Security & plugin updates applied", value: "6", pct: 100 },
        ],
      },
      {
        kind: "list",
        title: "What we did this month",
        items: [
          "Published the clinic's Google Business Profile with full service list and 14 photos",
          "Fixed two pages that were slow on mobile (LCP 4.1s → 1.8s)",
          "Added click-to-call and WhatsApp buttons to every page header",
          "Submitted the site to 12 local directories with consistent details",
        ],
      },
      {
        kind: "callout",
        text: "Ready for more? Tier 2 adds online booking, reminders and a review workflow — and this report gains booking, show-rate and cost-per-patient sections.",
      },
    ],
  },
  {
    slug: "monthly-seo-report",
    title: "Monthly SEO & Visibility Report",
    type: "Monthly Report",
    brand: "Lumina Dental & Skin",
    industry: "Healthcare & Clinics",
    icon: "monitoring",
    summary:
      "The report every retainer client receives each month — rankings, traffic, enquiries, and what we're doing next. Shown here for a fictional two-location dental clinic.",
    blocks: [
      { kind: "callout", text: "Reporting period: March · Program: Patient Pipeline Tier 2 · Prepared by your account team" },
      {
        kind: "kpis",
        title: "The month at a glance",
        items: [
          { label: "Organic sessions", value: "4,218", delta: "+18% vs Feb" },
          { label: "Enquiries (calls + forms + WhatsApp)", value: "163", delta: "+22%" },
          { label: "Google Business Profile actions", value: "894", delta: "+11%" },
          { label: "New reviews (4★+)", value: "21", delta: "+6" },
        ],
      },
      {
        kind: "table",
        title: "Keyword movement — top tracked terms",
        head: ["Keyword", "Feb", "Mar", "Change"],
        rows: [
          ["dental implants [city]", "#9", "#4", "▲ 5"],
          ["invisible aligners cost", "#14", "#7", "▲ 7"],
          ["dentist near [suburb]", "#6", "#3", "▲ 3"],
          ["skin clinic [city]", "#11", "#8", "▲ 3"],
          ["root canal treatment [city]", "#5", "#5", "—"],
        ],
      },
      {
        kind: "bars",
        title: "Enquiries by source",
        note: "Every enquiry is tracked to its source — you always know what's producing patients.",
        items: [
          { label: "Google Business Profile", value: "71", pct: 100 },
          { label: "Organic search (website)", value: "48", pct: 68 },
          { label: "WhatsApp click-to-chat", value: "29", pct: 41 },
          { label: "Direct / repeat visitors", value: "15", pct: 21 },
        ],
      },
      {
        kind: "list",
        title: "What we did this month",
        items: [
          "Published 1 SEO article: “Dental implant cost guide” — already ranking on page 1",
          "Rebuilt the implants service page around patient questions (AEO pass)",
          "Added 14 fresh GBP posts and photos across both locations",
          "Review workflow generated 21 new reviews (average rating now 4.8)",
        ],
      },
      {
        kind: "list",
        title: "Next month's plan",
        items: [
          "Target “teeth whitening [city]” cluster — currently page 2, high intent",
          "Launch the aligners comparison page",
          "A/B test the booking widget placement on mobile",
        ],
      },
    ],
  },
  {
    slug: "ads-performance-report",
    title: "Ads Performance Report",
    type: "Monthly Report",
    brand: "Summit Ridge Roofing",
    industry: "Local Businesses",
    icon: "ads_click",
    summary:
      "How we report paid campaigns — spend, cost per lead, and booked estimates, not vanity clicks. Shown for a fictional commercial roofing contractor.",
    blocks: [
      { kind: "callout", text: "Reporting period: June · Program: Local Domination Tier 2 · Platforms: Google Ads + Local Services Ads" },
      {
        kind: "kpis",
        title: "What your spend produced",
        items: [
          { label: "Ad spend (client-paid)", value: "$6,400" },
          { label: "Qualified leads", value: "58", delta: "+16% vs May" },
          { label: "Cost per qualified lead", value: "$110", delta: "−12%", down: true },
          { label: "Booked estimates", value: "31", delta: "+9" },
        ],
      },
      {
        kind: "table",
        title: "Campaign breakdown",
        head: ["Campaign", "Spend", "Leads", "Cost/lead", "Booked"],
        rows: [
          ["Roof replacement — [metro]", "$2,900", "24", "$121", "13"],
          ["Storm damage repair", "$1,700", "19", "$89", "11"],
          ["Local Services Ads", "$1,200", "12", "$100", "6"],
          ["Commercial re-roofing", "$600", "3", "$200", "1"],
        ],
      },
      {
        kind: "bars",
        title: "Speed-to-lead performance",
        note: "Instant text-back means no lead waits. Median first response this month: 42 seconds.",
        items: [
          { label: "Responded under 1 minute", value: "81%", pct: 81 },
          { label: "Responded under 5 minutes", value: "96%", pct: 96 },
          { label: "Reached by phone same day", value: "88%", pct: 88 },
        ],
      },
      {
        kind: "list",
        title: "Optimizations made",
        items: [
          "Paused two underperforming ad groups; reallocated $700 to storm-damage campaign",
          "New landing page variant lifted form conversion from 6.1% → 8.4%",
          "Added negative keywords list (−$310 of wasted spend caught)",
        ],
      },
    ],
  },
  {
    slug: "sample-seo-article",
    title: "SEO Article — as delivered",
    type: "Content Sample",
    brand: "Lumina Dental & Skin",
    industry: "Healthcare & Clinics",
    icon: "article",
    summary:
      "A real example of the monthly SEO article included in Tier 2+ — written to rank, structured for AI answer engines, and reviewed for accuracy before publishing.",
    blocks: [
      { kind: "callout", text: "Deliverable: 1 of the monthly SEO articles in Patient Pipeline Tier 2. Delivered publish-ready with meta title, description, schema and internal links." },
      {
        kind: "prose",
        title: "Dental Implant Cost: What Actually Determines Your Price",
        paras: [
          "If you've searched for dental implant prices, you've seen quotes that vary wildly — sometimes by 2–3× for what sounds like the same procedure. That's not marketing games; it's because “an implant” is really three components and a surgical plan, and each varies with your case.",
          "A single dental implant has three priced parts: the implant fixture placed in the bone, the abutment that connects it, and the crown you actually see. Clinics that advertise a low headline price are usually quoting the fixture alone — the crown and abutment arrive later as “extras”. A trustworthy quote always covers all three, plus imaging.",
          "Your bone condition is the biggest price variable. If bone has receded where the tooth is missing, a graft adds a preparatory procedure and 3–4 months of healing before the implant can be placed. This is also why two patients at the same clinic can be quoted very different totals.",
          "What should you ask any clinic before saying yes? Whether the quote is all-inclusive, which implant system they use and its warranty, who performs the surgery and how many implants they place a year, and what the plan is if an implant fails to integrate.",
        ],
      },
      {
        kind: "list",
        title: "What ships with every article",
        items: [
          "Meta title + description written for click-through",
          "FAQ schema targeting the questions patients actually ask",
          "Internal links to the relevant service and booking pages",
          "A clinical-accuracy review pass before publishing",
        ],
      },
    ],
  },
  {
    slug: "social-post-set",
    title: "Social Media Post Set",
    type: "Content Sample",
    brand: "Verve Botanicals",
    industry: "Ecommerce",
    icon: "thumb_up",
    summary:
      "Four posts from a monthly social set for a fictional skincare brand — each written with a hook, a body that earns the follow, and one clear call to action.",
    blocks: [
      { kind: "callout", text: "Deliverable: part of an 8-post monthly set across 2 channels. Delivered as copy + visual direction, scheduled after your approval." },
      {
        kind: "posts",
        items: [
          {
            channel: "Instagram — carousel",
            hook: "Your moisturiser isn't failing. Your order of application is.",
            body: "Slide-by-slide: thinnest to thickest, why serums go under creams, and the one step almost everyone does at the wrong time (SPF).",
            cta: "Save this for your next routine reset →",
          },
          {
            channel: "Instagram — reel",
            hook: "3 ingredients that don't belong in the same routine",
            body: "15-second cut showing the pairs that cancel each other out — with the simple AM/PM split that fixes it.",
            cta: "Full ingredient guide in bio",
          },
          {
            channel: "Facebook — offer",
            hook: "The restock you asked for is live.",
            body: "Our best-selling night repair oil is back — and this batch ships with the new dropper. First 100 orders get the travel size free.",
            cta: "Shop the restock",
          },
          {
            channel: "Instagram — UGC style",
            hook: "“I finished the bottle. I never finish bottles.”",
            body: "A customer-voice post built from real review themes — the highest-trust format we run, and consistently the best saves-per-reach.",
            cta: "Read 400+ reviews →",
          },
        ],
      },
    ],
  },
  {
    slug: "email-nurture-sequence",
    title: "Email Nurture Sequence",
    type: "Content Sample",
    brand: "Meridian Legal Partners",
    industry: "Professional Services",
    icon: "mail",
    summary:
      "The 5-email consultation nurture we build for professional-services firms — shown for a fictional law firm. Each email has one job: move the enquiry toward a booked consultation.",
    blocks: [
      { kind: "callout", text: "Deliverable: 5-email nurture, triggered when someone downloads a guide or submits an enquiry but doesn't book. Delivered wired into your CRM." },
      {
        kind: "emails",
        items: [
          {
            day: "Day 0 — immediately",
            subject: "Your guide + what happens if you'd like to talk",
            body: [
              "Here's the guide you requested. No pitch — it answers the questions we hear most in first consultations.",
              "If your situation is time-sensitive, you don't need to wait: our calendar link is below, and initial consultations are 30 minutes.",
            ],
          },
          {
            day: "Day 2",
            subject: "The 3 questions to ask any firm (including us)",
            body: [
              "Before you choose representation, ask: who will actually handle my matter, how do you bill and what's excluded, and what does a realistic timeline look like?",
              "We answer all three on this page — so you can compare us honestly.",
            ],
          },
          {
            day: "Day 5",
            subject: "What a first consultation actually covers",
            body: [
              "Thirty minutes: your situation, your options (including the ones that don't involve us), and what we'd do first. You leave with a clear next step either way.",
            ],
          },
          {
            day: "Day 9",
            subject: "A recent matter like yours (anonymised)",
            body: [
              "A short walkthrough of how a similar matter progressed — timeline, key decisions, and outcome — so you know what to expect.",
            ],
          },
          {
            day: "Day 14",
            subject: "Should we close your file?",
            body: [
              "If now isn't the right time, no problem — reply “later” and we'll check in next quarter. If it is, the calendar link below still works.",
              "The polite breakup email consistently gets the highest reply rate of the sequence.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "b2b-case-study",
    title: "Case Study — as delivered",
    type: "Content Sample",
    brand: "Northgate IT",
    industry: "B2B Service Companies",
    icon: "cases",
    summary:
      "The case-study format we produce for B2B firms (3 included in Tier 1, then 1/quarter in Tier 3) — shown for a fictional managed-IT provider.",
    blocks: [
      { kind: "callout", text: "Format: problem → intervention → measurable result, one page, written for a buying committee that skims." },
      {
        kind: "prose",
        title: "How a 140-seat logistics firm cut IT tickets 38% in one quarter",
        paras: [
          "The client — a regional logistics company running 140 seats across 3 depots — came to Northgate IT drowning in repeat tickets: password resets, VPN drops, and a file server that fell over most Mondays.",
          "Instead of adding help-desk hours, Northgate ran a two-week root-cause audit. Result: 61% of tickets traced to four fixable causes. The fix plan was sequenced to tackle the noisiest first.",
          "Quarter one: self-service password resets (−210 tickets), VPN replaced with an always-on tunnel (−140), file server migrated to redundant cloud storage (Monday outages: zero).",
        ],
      },
      {
        kind: "kpis",
        title: "Results after 90 days",
        items: [
          { label: "Monthly tickets", value: "−38%" },
          { label: "Mean time to resolve", value: "9.4h → 3.1h" },
          { label: "Unplanned downtime", value: "0 hrs", delta: "was 11 hrs/qtr" },
          { label: "Contract expanded to", value: "3-year MSA" },
        ],
      },
      {
        kind: "list",
        title: "What ships with every case study",
        items: [
          "Interview-based draft (30 min with your delivery lead — we do the writing)",
          "One-page web version + PDF for sales decks",
          "Pull-quote and stat set for LinkedIn reuse",
        ],
      },
    ],
  },
  {
    slug: "quarterly-business-review",
    title: "Quarterly Business Review Snapshot",
    type: "Tier 3 Deliverable",
    brand: "Lumina Dental & Skin",
    industry: "Healthcare & Clinics",
    icon: "insights",
    summary:
      "Tier 3 clients get a quarterly strategy review with their dedicated account manager. This is the shape of that conversation — shown for a fictional clinic group.",
    blocks: [
      { kind: "callout", text: "Cadence: quarterly, 60 minutes, dedicated account manager + your leadership. This snapshot is the pre-read." },
      {
        kind: "kpis",
        title: "Quarter in numbers",
        items: [
          { label: "New patient enquiries", value: "512", delta: "+27% QoQ" },
          { label: "Cost per new patient", value: "₹1,140", delta: "−15%", down: true },
          { label: "Recall reactivations (CRM)", value: "203" },
          { label: "Revenue attributed to digital", value: "₹38.4L", delta: "+31%" },
        ],
      },
      {
        kind: "table",
        title: "Performance by location",
        head: ["Location", "Enquiries", "Bookings", "Show rate"],
        rows: [
          ["Main clinic", "268", "196", "84%"],
          ["North branch", "154", "112", "79%"],
          ["East branch (opened Q2)", "90", "58", "72%"],
        ],
      },
      {
        kind: "list",
        title: "Strategy decisions on the table",
        items: [
          "East branch show rate lags — proposal: WhatsApp reminder sequence + prepaid booking deposit",
          "Implant campaign CAC beat target by 22% — proposal: scale budget 40% next quarter",
          "Recall automation has paid back 6.2× — proposal: extend to dormant 24-month patients",
        ],
      },
    ],
  },
];

export const sampleBySlug: Record<string, SampleDoc> = Object.fromEntries(samples.map((s) => [s.slug, s]));

/* ---------------------------------- Demo sites ---------------------------------- */
// Each site is a real open-source template, rebranded to a fictional business and
// served statically from public/demo-sites/<slug>/. The wrapper at /proof/sites/[slug]
// frames it, adds the tier switcher, and overlays the systems each tier unlocks.

// A capability the wrapper overlays on the template. Tier 1 is the bare site;
// higher tiers light these up, and anything above the selected tier renders locked.
export type Widget = "enquiry" | "whatsapp" | "reviews" | "chat" | "dashboard" | "locations";

export type SiteTier = {
  label: string; // "Tier 1" — matches the program's tier label
  name: string; // the program's tier name
  blurb: string;
  widgets: Widget[]; // unlocked AT this tier (cumulative when rendered)
  adds: string[]; // plain-language list shown in the tier panel
};

export type DemoSite = {
  slug: string; // also the folder under public/demo-sites/
  brand: string;
  business: string;
  industry: string;
  programSlug: string;
  programName: string;
  accent: string; // hex — used for the wrapper chrome, matches the template's palette
  icon: string;
  tagline: string;
  enquiryLabel: string; // what "book" means for this business
  template: { name: string; source: string; license: string };
  tiers: SiteTier[];
};

// Copy for the overlay widgets, per business type.
export const widgetCopy: Record<Widget, { icon: string; name: string; desc: string }> = {
  enquiry: { icon: "event_available", name: "Online booking", desc: "Visitors pick a slot and get instant confirmation — no phone tag, no missed enquiry." },
  whatsapp: { icon: "chat", name: "WhatsApp auto-reply", desc: "Every missed call and enquiry gets an instant reply that qualifies and books." },
  reviews: { icon: "reviews", name: "Live review feed", desc: "Fresh reviews pulled onto the site automatically as they arrive." },
  chat: { icon: "support_agent", name: "AI assistant", desc: "A 24×7 assistant trained on your services, prices and FAQs." },
  dashboard: { icon: "monitoring", name: "Staff dashboard", desc: "Your team's view: enquiries, bookings, sources and cost per customer." },
  locations: { icon: "pin_drop", name: "Multi-location switcher", desc: "Separate pages, hours and enquiry routing for every location or branch." },
};

export const demoSites: DemoSite[] = [
  {
    slug: "lumina-dental",
    brand: "Lumina Dental & Skin",
    business: "Multi-doctor dental & skin clinic",
    industry: "Healthcare & Clinics",
    programSlug: "patient-pipeline-bundle",
    programName: "Patient Pipeline",
    accent: "#0EA5A6",
    icon: "dentistry",
    tagline: "Gentle, modern dentistry — same-week appointments.",
    enquiryLabel: "Book an appointment",
    template: { name: "DentCare", source: "HTML Codex", license: "CC BY 4.0" },
    tiers: [
      {
        label: "Tier 1",
        name: "Digital Presence",
        blurb: "Be found, trusted, and easy to contact. The site itself — no automation yet.",
        widgets: [],
        adds: ["Treatment pages built for search", "Doctor profiles and credentials", "Google Business Profile + local SEO", "Click-to-call and enquiry form", "Monthly report"],
      },
      {
        label: "Tier 2",
        name: "Patient Growth",
        blurb: "The site starts converting: patients book themselves and nothing goes unanswered.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Online booking with reminders", "WhatsApp enquiry automation", "Review workflow feeding the site", "Enquiry dashboard for the front desk"],
      },
      {
        label: "Tier 3",
        name: "Clinic Scale Premium",
        blurb: "The full growth system — AI front desk, CRM, and per-location reporting.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI assistant answering 24×7", "Patient CRM with recall automation", "Doctor / location dashboards", "Quarterly strategy with your account manager"],
      },
    ],
  },
  {
    slug: "meridian-legal",
    brand: "Meridian Legal Partners",
    business: "Corporate & family law firm",
    industry: "Professional Services",
    programSlug: "authority-inquiry-engine",
    programName: "Authority & Inquiry Engine",
    accent: "#B45309",
    icon: "gavel",
    tagline: "Clear counsel. Measured strategy. No surprises.",
    enquiryLabel: "Request a consultation",
    template: { name: "Lawyer", source: "Colorlib", license: "Attribution" },
    tiers: [
      {
        label: "Tier 1",
        name: "Authority Foundation",
        blurb: "Look like the authority you are — partner profiles, practice areas, credibility.",
        widgets: [],
        adds: ["Practice-area pages with real depth", "Partner profiles that read as credentials", "SEO + Google Business Profile", "Enquiry form and direct contact"],
      },
      {
        label: "Tier 2",
        name: "Inquiry Engine",
        blurb: "Qualify before the calendar — intake triage and consultation booking.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Consultation booking on the partner's calendar", "Qualifying intake forms that triage matters", "Email nurture for enquiries not yet ready", "CRM pipeline so nothing ages silently"],
      },
      {
        label: "Tier 3",
        name: "Practice Growth System",
        blurb: "AI intake, practice-area microsites, and partner-level reporting.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI intake qualification out of hours", "Practice-area microsites", "Partner dashboards by practice area", "Thought leadership programme"],
      },
    ],
  },
  {
    slug: "summit-ridge-roofing",
    brand: "Summit Ridge Roofing",
    business: "Commercial & residential roofing contractor",
    industry: "Local Businesses",
    programSlug: "local-domination-pack",
    programName: "Local Domination",
    accent: "#EA580C",
    icon: "roofing",
    tagline: "Storm-rated roofing. 24-hour estimates.",
    enquiryLabel: "Get a free estimate",
    template: { name: "Roofing", source: "Colorlib", license: "Attribution" },
    tiers: [
      {
        label: "Tier 1",
        name: "Local Foundation",
        blurb: "Own local search — map pack, project gallery, reviews, citations.",
        widgets: [],
        adds: ["Service pages per job type", "Project gallery built for local SEO", "Google Business Profile + citations", "Review generation after every job"],
      },
      {
        label: "Tier 2",
        name: "Lead Engine",
        blurb: "Win the first 60 seconds — instant text-back and tracked estimates.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Instant text-back on every missed call", "Estimate request with scheduling", "Call and form tracking by source", "Estimate follow-up sequences"],
      },
      {
        label: "Tier 3",
        name: "Market Leader System",
        blurb: "Multi-area campaigns, AI lead qualification, and job-value reporting.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI lead qualification and routing", "Service-area pages that rank separately", "Job-value dashboards by lead source", "Seasonal and reactivation campaigns"],
      },
    ],
  },
  {
    slug: "northgate-it",
    brand: "Northgate IT",
    business: "Managed IT & cybersecurity provider",
    industry: "B2B Service Companies",
    programSlug: "b2b-pipeline-bundle",
    programName: "B2B Pipeline",
    accent: "#2563EB",
    icon: "dns",
    tagline: "Managed IT that stops the repeat tickets.",
    enquiryLabel: "Book a discovery call",
    template: { name: "ITSolution", source: "Colorlib", license: "Attribution" },
    tiers: [
      {
        label: "Tier 1",
        name: "Credibility Platform",
        blurb: "Credibility that survives due diligence — case studies and clear positioning.",
        widgets: [],
        adds: ["Positioning workshop applied to the site", "Case studies buyers actually read", "SEO / AEO foundations", "LinkedIn presence"],
      },
      {
        label: "Tier 2",
        name: "Demand Engine",
        blurb: "Demand beyond the founder's network — lead magnets, scoring, nurture.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Gated assets capturing real buyers", "Discovery-call booking", "CRM with lead scoring", "Founder ghost-writing and nurture"],
      },
      {
        label: "Tier 3",
        name: "Pipeline System",
        blurb: "ABM, enrichment, and attribution your sales team can act on.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI qualification before sales time is spent", "ABM campaigns to named accounts", "Attribution dashboards to closed revenue", "Case-study engine, one per quarter"],
      },
    ],
  },
  {
    slug: "flowdesk",
    brand: "Flowdesk",
    business: "B2B SaaS product",
    industry: "SaaS & Technology",
    programSlug: "saas-growth-engine",
    programName: "SaaS Growth Engine",
    accent: "#7C3AED",
    icon: "rocket_launch",
    tagline: "Project management that fits how your team actually works.",
    enquiryLabel: "Book a demo",
    template: { name: "Play", source: "UIdeck", license: "MIT" },
    tiers: [
      {
        label: "Tier 1",
        name: "Launch-Ready Presence",
        blurb: "Positioning and a site built to convert trials — with event tracking from day one.",
        widgets: [],
        adds: ["Positioning sprint", "Conversion-focused product pages", "Signup and trial event tracking", "SEO / AEO foundations"],
      },
      {
        label: "Tier 2",
        name: "Demand & Conversion Engine",
        blurb: "Turn traffic into pipeline — comparison content, demo booking, CRO.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Demo booking wired to your calendar", "Comparison and use-case content", "In-product nurture and CRM", "One CRO test per month"],
      },
      {
        label: "Tier 3",
        name: "Full-Funnel Growth System",
        blurb: "Programmatic SEO, PQL scoring, and reporting attributed to ARR.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI assistant handling pre-sales questions", "Programmatic SEO at scale", "PQL scoring on product signals", "Board-grade reporting to ARR"],
      },
    ],
  },
  {
    slug: "harborview-realty",
    brand: "Harborview Realty",
    business: "Residential & commercial real estate",
    industry: "Real Estate",
    programSlug: "listing-to-lead-bundle",
    programName: "Listing-to-Lead",
    accent: "#0F766E",
    icon: "real_estate_agent",
    tagline: "Homes, listings and honest market advice.",
    enquiryLabel: "Schedule a viewing",
    template: { name: "Property", source: "Untree.co", license: "CC BY 3.0" },
    tiers: [
      {
        label: "Tier 1",
        name: "Market Presence",
        blurb: "Be the visible agent in your market — listings, area pages, credibility.",
        widgets: [],
        adds: ["Listing pages with proper search structure", "Market-area pages", "Agent profiles and reviews", "Enquiry form per listing"],
      },
      {
        label: "Tier 2",
        name: "Lead Machine",
        blurb: "Your own lead flow, qualified instantly — no more portal dependence.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Viewing scheduler on every listing", "Instant WhatsApp qualification", "CRM with buyer/seller pipelines", "Paid campaigns to your listings"],
      },
      {
        label: "Tier 3",
        name: "Sales Pipeline System",
        blurb: "Multi-area teams, project microsites, and pipeline reporting.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI qualification bot on every enquiry", "Project and development microsites", "Team dashboards by agent and area", "Site-visit automation"],
      },
    ],
  },
  {
    slug: "ascent-academy",
    brand: "Ascent Academy",
    business: "Test-prep & coaching institute",
    industry: "Education & Training",
    programSlug: "enrollment-growth-bundle",
    programName: "Enrollment Growth",
    accent: "#DB2777",
    icon: "school",
    tagline: "Test-prep coaching with counselor-led admissions.",
    enquiryLabel: "Apply for admission",
    template: { name: "Educenter", source: "Themefisher", license: "MIT" },
    tiers: [
      {
        label: "Tier 1",
        name: "Institution Presence",
        blurb: "A credible institutional presence — programs, faculty, results.",
        widgets: [],
        adds: ["Program pages with fees and outcomes", "Faculty profiles", "Results and testimonials", "Enquiry form for parents"],
      },
      {
        label: "Tier 2",
        name: "Enrollment Engine",
        blurb: "Built for admission season — landing pages, counselor CRM, WhatsApp-first.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Admission application flow", "WhatsApp-first enquiry automation", "Counselor CRM with follow-up", "Seasonal campaign landing pages"],
      },
      {
        label: "Tier 3",
        name: "Admissions Growth System",
        blurb: "24×7 AI counselor, program microsites, cost-per-enrollment reporting.",
        widgets: ["chat", "dashboard", "locations"],
        adds: ["AI counselor bot through peak season", "Program microsites", "Cost-per-enrollment dashboards", "Multi-branch enquiry routing"],
      },
    ],
  },
  {
    slug: "verve-botanicals",
    brand: "Verve Botanicals",
    business: "Skincare ecommerce brand",
    industry: "Ecommerce",
    programSlug: "ecommerce-revenue-stack",
    programName: "Revenue Stack",
    accent: "#65A30D",
    icon: "storefront",
    tagline: "Clean, effective skincare.",
    enquiryLabel: "Get 10% off your first order",
    template: { name: "EShopper", source: "HTML Codex", license: "CC BY 4.0" },
    tiers: [
      {
        label: "Tier 1",
        name: "Store Foundation",
        blurb: "A store built to convert — styled products, core email flows, clean checkout.",
        widgets: [],
        adds: ["Product pages styled to convert", "Category and collection structure", "Three core email flows", "Checkout optimised for mobile"],
      },
      {
        label: "Tier 2",
        name: "Revenue Engine",
        blurb: "Acquisition, CRO and retention working together on a proven store.",
        widgets: ["enquiry", "whatsapp", "reviews", "dashboard"],
        adds: ["Email capture and win-back popups", "WhatsApp order and support automation", "Review feed on product pages", "Revenue dashboard with two CRO tests a month"],
      },
    ],
  },
  {
    slug: "anika-mehra-coaching",
    brand: "Anika Mehra Coaching",
    business: "Executive coach & consultant",
    industry: "Coaches & Consultants",
    programSlug: "calendar-filling-system",
    programName: "Calendar-Filling System",
    accent: "#9333EA",
    icon: "psychology",
    tagline: "Executive coaching for founders and senior leaders.",
    enquiryLabel: "Book a discovery call",
    template: { name: "LifeCoach", source: "Colorlib", license: "Attribution" },
    tiers: [
      {
        label: "Single Package",
        name: "Calendar-Filling System",
        blurb: "One package, one job: fill the calendar with qualified calls. Everything below is included — there are no tiers to compare.",
        widgets: ["enquiry", "whatsapp", "reviews"],
        adds: ["Personal-brand site", "Lead magnet with a 5-email nurture", "Discovery-call booking integration", "8 posts a month across 2 channels"],
      },
    ],
  },
  {
    slug: "loopwise",
    brand: "Loopwise",
    business: "Early-stage startup",
    industry: "Startups",
    programSlug: "launch-kit",
    programName: "Launch Kit & Build Studio",
    accent: "#0891B2",
    icon: "auto_awesome",
    tagline: "Turn customer feedback into your roadmap.",
    enquiryLabel: "Join the waitlist",
    template: { name: "Agency", source: "Start Bootstrap", license: "MIT" },
    tiers: [
      {
        label: "Fixed Project",
        name: "Launch Kit",
        blurb: "Everything you need to launch credibly — positioning, brand, site, analytics.",
        widgets: [],
        adds: ["Positioning sprint", "Brand identity and pitch-deck template", "5–8 page launch site", "Analytics and event tracking"],
      },
      {
        label: "Retainer",
        name: "Care Plan",
        blurb: "Once launched: hosting, security, updates and steady dev capacity.",
        widgets: ["enquiry", "whatsapp", "dashboard"],
        adds: ["Waitlist and demo capture", "Managed hosting and security", "10 dev-hours a month", "Uptime and traffic reporting"],
      },
    ],
  },
];

export const demoSiteBySlug: Record<string, DemoSite> = Object.fromEntries(demoSites.map((s) => [s.slug, s]));

// Widgets unlocked at or below `tierIndex` — tiers are cumulative.
export const widgetsUpTo = (site: DemoSite, tierIndex: number): Widget[] =>
  [...new Set(site.tiers.slice(0, tierIndex + 1).flatMap((t) => t.widgets))];

// Widgets that exist on a higher tier than the one being viewed — rendered locked.
export const lockedWidgets = (site: DemoSite, tierIndex: number): { widget: Widget; tier: SiteTier }[] =>
  site.tiers.slice(tierIndex + 1).flatMap((t) => t.widgets.filter((w) => !widgetsUpTo(site, tierIndex).includes(w)).map((widget) => ({ widget, tier: t })));


/* ---------------------------------- Blueprints ---------------------------------- */

export type Blueprint = {
  slug: string;
  industry: string;
  programSlug: string;
  programName: string;
  title: string;
  promise: string;
  problem: string[];
  stages: { icon: string; name: string; desc: string; items: string[] }[];
  timeline: { phase: string; weeks: string; items: string[] }[];
  kpis: { label: string; desc: string }[];
};

export const blueprints: Blueprint[] = [
  {
    slug: "patient-pipeline-blueprint",
    industry: "Healthcare & Clinics",
    programSlug: "patient-pipeline-bundle",
    programName: "Patient Pipeline",
    title: "The Patient Pipeline Blueprint",
    promise: "How a 2-doctor clinic gets from invisible to a full appointment book — the exact system, stage by stage.",
    problem: [
      "Most clinics don't have a marketing problem — they have a leakage problem. Patients search, find a thin website or an unmanaged Google profile, and book with whoever answered first. The clinic never even knows it lost them.",
      "The fix isn't “more marketing”. It's a pipeline: be found for every treatment you offer, convert attention into a booked slot within minutes, and never let an existing patient silently lapse.",
    ],
    stages: [
      {
        icon: "search",
        name: "Stage 1 — Be found for every treatment",
        desc: "Patients search for treatments, not clinic names.",
        items: [
          "One page per treatment, written around the questions patients actually ask",
          "Google Business Profile managed weekly — posts, photos, Q&A, categories",
          "Local SEO: rank in the map pack for “[treatment] near me” searches",
          "Structured data so AI search engines cite you as the answer",
        ],
      },
      {
        icon: "event_available",
        name: "Stage 2 — Convert interest in minutes",
        desc: "The clinic that responds first usually wins the patient.",
        items: [
          "WhatsApp, call, and booking pathways on every page — one tap each",
          "Online booking with automated confirmations and reminders",
          "Every enquiry lands in one dashboard, none lost in a front-desk notebook",
          "Review requests triggered automatically after visits",
        ],
      },
      {
        icon: "autorenew",
        name: "Stage 3 — Never lose a patient silently",
        desc: "Reactivating a lapsed patient costs a fraction of acquiring a new one.",
        items: [
          "Patient CRM with recall automation — cleanings, reviews, annual check-ups",
          "Re-engagement campaigns for patients dormant 6–24 months",
          "Doctor and location dashboards: enquiries, bookings, show rates",
          "Quarterly strategy review against cost-per-patient targets",
        ],
      },
    ],
    timeline: [
      { phase: "Weeks 1–2", weeks: "Foundation", items: ["Kickoff + access", "Treatment & keyword mapping", "Site architecture approved"] },
      { phase: "Weeks 3–6", weeks: "Build", items: ["Website built and reviewed", "GBP optimized", "Booking + reminder flows configured"] },
      { phase: "Weeks 7–8", weeks: "Launch", items: ["Site live", "Tracking verified", "Review workflow switched on"] },
      { phase: "Weeks 9–13", weeks: "Momentum", items: ["First month's content live", "First monthly report", "Ranking + enquiry baseline set"] },
    ],
    kpis: [
      { label: "Enquiries / month", desc: "Calls + forms + WhatsApp, each with a tracked source" },
      { label: "Cost per new patient", desc: "The number that decides budget, reviewed monthly" },
      { label: "Show rate", desc: "Reminders and deposits move this more than ads do" },
      { label: "Recall reactivations", desc: "Revenue from patients you already earned" },
    ],
  },
  {
    slug: "authority-engine-blueprint",
    industry: "Professional Services",
    programSlug: "authority-inquiry-engine",
    programName: "Authority & Inquiry Engine",
    title: "The Authority & Inquiry Engine Blueprint",
    promise: "How a professional firm turns expertise into a steady flow of qualified, high-value inquiries.",
    problem: [
      "Professional firms live and die on trust — but most firm websites are brochures that prove nothing. Meanwhile, prospective clients are comparing you against three other firms with the same stock photos and the same claims.",
      "The engine has two halves: authority (proof you're the safe choice) and inquiry flow (a path from “researching” to “booked consultation” that qualifies people before they consume partner time).",
    ],
    stages: [
      {
        icon: "workspace_premium",
        name: "Stage 1 — Build visible authority",
        desc: "Clients hire the firm that looks like it wrote the book.",
        items: [
          "Partner profiles that read like credentials, not bios",
          "Practice-area pages deep enough to answer real questions",
          "Articles targeting the questions clients search before they call",
          "AEO structure so AI assistants cite your answers",
        ],
      },
      {
        icon: "filter_alt",
        name: "Stage 2 — Qualify before the calendar",
        desc: "Partner hours are the scarcest resource in the firm.",
        items: [
          "Qualifying intake forms that triage matter type, urgency, and fit",
          "Consultation booking wired to the right partner's calendar",
          "Email nurture for inquiries that aren't ready yet",
          "CRM pipeline so no inquiry ages silently",
        ],
      },
      {
        icon: "trending_up",
        name: "Stage 3 — Compound with content and paid",
        desc: "Once conversion works, attention becomes an investment.",
        items: [
          "Paid search / LinkedIn for the highest-value practice areas",
          "Thought leadership: whitepapers and LinkedIn presence for partners",
          "AI intake assistant for out-of-hours triage",
          "Partner-level dashboards: inquiries by practice area and source",
        ],
      },
    ],
    timeline: [
      { phase: "Weeks 1–2", weeks: "Foundation", items: ["Positioning workshop", "Practice-area & keyword map", "Intake criteria defined"] },
      { phase: "Weeks 3–7", weeks: "Build", items: ["Firm site + partner profiles", "Intake forms + booking", "CRM pipeline configured"] },
      { phase: "Weeks 8–9", weeks: "Launch", items: ["Site live", "First articles published", "Nurture sequence active"] },
      { phase: "Weeks 10–13", weeks: "Momentum", items: ["Paid campaigns live (Tier 2)", "First monthly report", "Inquiry quality review"] },
    ],
    kpis: [
      { label: "Qualified inquiries / month", desc: "Triage-passed only — volume without fit is noise" },
      { label: "Consultation show rate", desc: "Booking + reminder flow keeps this above 80%" },
      { label: "Cost per qualified inquiry", desc: "Tracked per practice area, not blended" },
      { label: "Inquiry → engagement rate", desc: "The number partners actually care about" },
    ],
  },
  {
    slug: "local-domination-blueprint",
    industry: "Local Businesses",
    programSlug: "local-domination-pack",
    programName: "Local Domination",
    title: "The Local Domination Blueprint",
    promise: "How a contractor owns their service area — map pack, reviews, and a lead machine that responds in seconds.",
    problem: [
      "For a contractor, the entire game is decided in about 10 minutes: someone has a problem, searches, calls two or three companies, and books with whoever responds first and looks most trustworthy. Most contractors lose on both counts — slow response, thin reviews.",
      "Domination means being unavoidable in the map pack, having the review count that ends comparison shopping, and responding to every lead before a competitor picks up the phone.",
    ],
    stages: [
      {
        icon: "map",
        name: "Stage 1 — Own the map",
        desc: "The map pack is the highest-intent real estate in local search.",
        items: [
          "Google Business Profile fully built out and posted weekly",
          "Citations cleaned and consistent across the local ecosystem",
          "Service + area page structure that ranks beyond your suburb",
          "Project gallery with real jobs, geotagged and described",
        ],
      },
      {
        icon: "bolt",
        name: "Stage 2 — Win the first 60 seconds",
        desc: "Speed-to-lead beats ad budget.",
        items: [
          "Instant text-back on every missed call and form submission",
          "Call + form tracking — every lead has a source and a recording",
          "Campaign landing pages for each service (Tier 2)",
          "Google Ads + Local Services Ads with weekly optimization",
        ],
      },
      {
        icon: "reviews",
        name: "Stage 3 — Compound trust and repeat work",
        desc: "Reviews end comparison shopping; reactivation fills slow seasons.",
        items: [
          "Review request after every completed job — automatic",
          "Estimate follow-up sequences so quotes don't die in inboxes",
          "Seasonal campaigns (storm, pre-winter, spring) planned yearly",
          "Job-value dashboards: revenue per lead source, not just lead counts",
        ],
      },
    ],
    timeline: [
      { phase: "Weeks 1–2", weeks: "Foundation", items: ["Kickoff + access", "Service & area mapping", "GBP audit and rebuild plan"] },
      { phase: "Weeks 3–6", weeks: "Build", items: ["Site + project gallery", "Tracking numbers live", "Instant text-back configured"] },
      { phase: "Weeks 7–8", weeks: "Launch", items: ["Site live", "Review engine on", "Citations submitted"] },
      { phase: "Weeks 9–13", weeks: "Momentum", items: ["Ads live (Tier 2)", "First monthly report", "Cost-per-lead baseline set"] },
    ],
    kpis: [
      { label: "Map-pack rankings", desc: "Tracked per service × area, not one vanity keyword" },
      { label: "Median response time", desc: "Target: under 60 seconds, automated" },
      { label: "Cost per booked estimate", desc: "Leads are noise until they're on the calendar" },
      { label: "Review velocity", desc: "New 4★+ reviews per month, every month" },
    ],
  },
];

export const blueprintBySlug: Record<string, Blueprint> = Object.fromEntries(blueprints.map((b) => [b.slug, b]));

/* ---------------------------------- 90-day process ---------------------------------- */

export const process90 = [
  {
    icon: "handshake",
    phase: "Days 1–14",
    title: "Foundation",
    desc: "Kickoff call, access and accounts, keyword and competitor mapping, and an approved plan. You know exactly what's being built and when.",
  },
  {
    icon: "construction",
    phase: "Days 15–45",
    title: "Build",
    desc: "Website, profiles, tracking, and automations built and reviewed with you. Nothing launches without your sign-off.",
  },
  {
    icon: "rocket_launch",
    phase: "Days 46–60",
    title: "Launch",
    desc: "Everything goes live with tracking verified — every call, form, and chat is attributed from day one.",
  },
  {
    icon: "monitoring",
    phase: "Days 61–90",
    title: "Momentum",
    desc: "First content cycles, first optimizations, and your first monthly report: what happened, what it cost, what's next.",
  },
];

/* ---------------------------------- Per-tier proof ---------------------------------- */
// What a prospect can see for one specific tier of one specific program: the demo
// site at that tier, the live demo behind it, and the document they'd receive.

export type ProofLink = { label: string; href: string; icon: string; desc: string };

export const siteForIndustry = (industry: string) => demoSites.find((s) => s.industry === industry);
export const blueprintForIndustry = (industry: string) => blueprints.find((b) => b.industry === industry);

// Which live demo best represents a given tier, by the widgets that tier unlocks.
// Demos live on the bundle page itself, so these are same-page anchors.
const demoForWidgets = (ws: Widget[]): ProofLink | null => {
  if (ws.includes("chat")) return { label: "Try the AI assistant", href: "#demo-chat", icon: "support_agent", desc: "Chat with the 24×7 assistant this tier deploys." };
  if (ws.includes("dashboard")) return { label: "Explore the dashboard", href: "#demo-dashboard", icon: "monitoring", desc: "The reporting view this tier gives you." };
  if (ws.includes("whatsapp")) return { label: "Watch speed-to-lead run", href: "#demo-whatsapp", icon: "chat", desc: "See an enquiry answered and booked with no human involved." };
  if (ws.includes("enquiry")) return { label: "See the qualification demo", href: "#demo-score", icon: "fact_check", desc: "Build a test enquiry and watch it get scored and routed." };
  return null;
};

// The deliverable a tier's monthly reporting produces. T1 = presence reporting;
// T2 = performance reporting; T3 = the quarterly strategy review on top.
const sampleForTier = (industry: string, tierIndex: number, lastTier: boolean): SampleDoc => {
  if (tierIndex === 0) return sampleBySlug["monthly-presence-report"];
  const own = samples.find((s) => s.industry === industry && s.type === "Monthly Report");
  if (lastTier && tierIndex >= 2) return sampleBySlug["quarterly-business-review"];
  return own ?? sampleBySlug["monthly-seo-report"];
};

/** Proof shown on a single tier card of a bundle page. */
export function proofForTier(industry: string, tierIndex: number, tierCount: number): ProofLink[] {
  const site = siteForIndustry(industry);
  const links: ProofLink[] = [];
  if (site && site.tiers[tierIndex]) {
    links.push({
      label: `See the demo site at ${site.tiers[tierIndex].label}`,
      href: `/proof/sites/${site.slug}?tier=${tierIndex + 1}`,
      icon: "language",
      desc: `${site.brand} — a fictional ${site.business.toLowerCase()}, shown with exactly what this tier includes.`,
    });
    const demo = demoForWidgets(widgetsUpTo(site, tierIndex));
    if (demo) links.push(demo);
  }
  const sample = sampleForTier(industry, tierIndex, tierIndex === tierCount - 1);
  links.push({
    label: `Sample: ${sample.title}`,
    href: `/proof/samples/${sample.slug}`,
    icon: "description",
    desc: "The document you'd actually receive at this tier.",
  });
  return links;
}

/** Program-level proof shown once per bundle page. */
export function proofLinksFor(industry: string): ProofLink[] {
  const site = siteForIndustry(industry);
  const blueprint = blueprintForIndustry(industry);
  const links: ProofLink[] = [];
  if (site)
    links.push({
      label: `Demo site: ${site.brand}`,
      href: `/proof/sites/${site.slug}`,
      icon: "language",
      desc: `Browse a full demo website built to this program's spec — for a fictional ${site.business.toLowerCase()}.`,
    });
  if (blueprint)
    links.push({
      label: blueprint.title,
      href: `/bundles/${blueprint.programSlug}#system`,
      icon: "architecture",
      desc: "The full system we run for this industry — stages, 90-day rollout, and the KPIs we report on.",
    });
  const own = samples.filter((s) => s.industry === industry);
  const sample = own[0] ?? sampleBySlug["monthly-seo-report"];
  links.push({
    label: `Sample deliverable: ${sample.title}`,
    href: `/proof/samples/${sample.slug}`,
    icon: "description",
    desc: "See exactly what a delivered report or content piece looks like — before you pay for one.",
  });
  return links;
}
