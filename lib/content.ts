// Central content for the marketing site. ponytail: one data module, pages stay presentational.

export const heroTrust = [
  { icon: "person_check", text: "Human-reviewed reports" },
  { icon: "schedule", text: "Delivered in 1 business day" },
  { icon: "handshake", text: "No pitch, no obligation" },
];

export const heroChips = ["High-performing websites", "Google visibility", "Lead generation & marketing", "Automation & AI"];

export const clients = ["Simplilead", "NextGen Sales", "ROASx", "Rochester Power Wash", "BonDébut", "Volta", "Career Champ", "Wonder Math", "Homechow"];

export const problems = [
  { icon: "trending_down", title: "Low Website Conversions", desc: "Traffic arrives but never turns into qualified leads or revenue." },
  { icon: "filter_alt", title: "Poor Lead Quality", desc: "Sales teams waste time chasing prospects who never convert." },
  { icon: "link_off", title: "Disconnected Systems", desc: "Tools, data, and channels operate in silos instead of one engine." },
  { icon: "ssid_chart", title: "Inconsistent Pipeline", desc: "Lead flow spikes and stalls with no predictable rhythm." },
  { icon: "pending_actions", title: "Manual & Slow Processes", desc: "Repetitive work slows the team and limits how fast you scale." },
  { icon: "visibility_off", title: "Lack of Growth Visibility", desc: "No clear view of what is working and where to invest next." },
];

export const services = [
  { icon: "insights", title: "AI Strategy & Growth Consulting", desc: "A clear growth roadmap built on data, market insight, and AI leverage.", slug: "ai-strategy" },
  { icon: "devices", title: "Website Design & Development", desc: "High-converting, fast websites engineered to turn visitors into pipeline.", slug: "website" },
  { icon: "travel_explore", title: "SEO & AI Search Visibility", desc: "Get found across search and AI engines with durable organic growth.", slug: "seo" },
  { icon: "ads_click", title: "Paid Advertising & Performance", desc: "Profitable campaigns across Google, Meta, LinkedIn, and beyond.", slug: "paid-ads" },
  { icon: "share", title: "Social Media & Content Creation", desc: "Consistent, on-brand content that builds audience and demand.", slug: "social" },
  { icon: "edit_note", title: "Content Marketing & Copywriting", desc: "Words that rank, resonate, and move buyers toward a decision.", slug: "content" },
  { icon: "palette", title: "Branding & Creative Services", desc: "A distinct identity that earns trust and stands apart in your market.", slug: "branding" },
  { icon: "smart_toy", title: "AI Automation & AI Solutions", desc: "Automate follow-up, qualification, and workflows with AI-driven systems.", slug: "automation" },
  { icon: "code", title: "Mobile App & Software Development", desc: "Custom apps, SaaS MVPs, and dashboards built to scale with you.", slug: "software" },
  { icon: "shopping_cart", title: "Ecommerce & Marketplace Growth", desc: "Store setup and optimization that lifts revenue per visitor.", slug: "ecommerce" },
  { icon: "monitoring", title: "Data, Analytics & Reporting", desc: "Tracking and dashboards that turn raw data into clear decisions.", slug: "analytics" },
  { icon: "location_on", title: "Reputation & Local Growth", desc: "More reviews, local visibility, and a stronger Google presence.", slug: "local" },
];

export const steps = [
  { num: "01", icon: "search", title: "Understand", desc: "We deep-dive into your business goals, audience, market, tools, and current growth challenges." },
  { num: "02", icon: "fact_check", title: "Audit & Plan", desc: "We audit your current digital system and create a clear roadmap for growth." },
  { num: "03", icon: "groups", title: "Assign Experts", desc: "We match the right strategists, designers, developers, marketers, and analysts to your project." },
  { num: "04", icon: "rocket_launch", title: "Execute & Report", desc: "We build, launch, optimize, and report clearly so you know what is working." },
];

export const homeCases = [
  { title: "Pipeline Growth System", desc: "Improved lead quality through better landing pages, tracking, and follow-up automation.", icon: "conversion_path", bg: "linear-gradient(135deg,#4C1D95,#7C3AED)" },
  { title: "Search Visibility Growth", desc: "Improved organic visibility through technical SEO, content strategy, and AI search optimization.", icon: "travel_explore", bg: "linear-gradient(135deg,#1E3A8A,#3B82F6)" },
  { title: "Marketing Automation System", desc: "Reduced manual follow-up work using CRM automation, AI workflows, and reporting dashboards.", icon: "automation", bg: "linear-gradient(135deg,#5B21B6,#A855F7)" },
];

export const whyPoints = [
  { icon: "strategy", text: "Strategy before execution" },
  { icon: "psychology", text: "AI-enabled but human-led" },
  { icon: "verified_user", text: "Vetted experts for every function" },
  { icon: "trending_up", text: "Built around measurable growth" },
  { icon: "summarize", text: "Clear reporting and communication" },
  { icon: "tune", text: "Flexible project and retainer support" },
];

export const serviceGroups = [
  { title: "Strategy & Growth", sub: "Direction and planning before execution", icon: "strategy", items: [
    { label: "AI Strategy & Growth Consulting", icon: "insights", slug: "ai-strategy" },
    { label: "Go-To-Market Strategy", icon: "rocket_launch", slug: "ai-strategy" },
    { label: "Funnel Strategy", icon: "conversion_path", slug: "ai-strategy" },
    { label: "Competitor Research", icon: "query_stats", slug: "ai-strategy" },
    { label: "Customer Persona Research", icon: "groups", slug: "ai-strategy" },
    { label: "Tech Stack Consulting", icon: "lan", slug: "ai-strategy" },
  ] },
  { title: "Website & Product", sub: "Sites, apps, and platforms that perform", icon: "devices", items: [
    { label: "Website Design & Development", icon: "web", slug: "website" },
    { label: "WordPress Development", icon: "article", slug: "website" },
    { label: "Webflow Development", icon: "dashboard_customize", slug: "website" },
    { label: "Shopify Development", icon: "storefront", slug: "ecommerce" },
    { label: "WooCommerce Development", icon: "shopping_bag", slug: "ecommerce" },
    { label: "Custom Web Apps", icon: "code", slug: "software" },
    { label: "Mobile App Development", icon: "smartphone", slug: "software" },
    { label: "SaaS MVP Development", icon: "rocket", slug: "software" },
    { label: "Admin Dashboards", icon: "space_dashboard", slug: "software" },
    { label: "Customer Portals", icon: "account_circle", slug: "software" },
  ] },
  { title: "Marketing & Visibility", sub: "Be found and chosen across every channel", icon: "campaign", items: [
    { label: "SEO & AI Search Visibility", icon: "travel_explore", slug: "seo" },
    { label: "Local SEO", icon: "pin_drop", slug: "seo" },
    { label: "National SEO", icon: "public", slug: "seo" },
    { label: "Ecommerce SEO", icon: "sell", slug: "seo" },
    { label: "AEO", icon: "forum", slug: "seo" },
    { label: "GEO", icon: "travel_explore", slug: "seo" },
    { label: "AI Search Optimization", icon: "smart_toy", slug: "seo" },
    { label: "Google Ads", icon: "ads_click", slug: "paid-ads" },
    { label: "Meta Ads", icon: "thumb_up", slug: "paid-ads" },
    { label: "LinkedIn Ads", icon: "work", slug: "paid-ads" },
    { label: "YouTube Ads", icon: "play_circle", slug: "paid-ads" },
    { label: "Bing Ads", icon: "search", slug: "paid-ads" },
  ] },
  { title: "Content & Brand", sub: "A voice and identity that builds trust", icon: "palette", items: [
    { label: "Social Media Marketing", icon: "share", slug: "social" },
    { label: "Content Marketing", icon: "edit_note", slug: "content" },
    { label: "Copywriting", icon: "draw", slug: "content" },
    { label: "Thought Leadership", icon: "lightbulb", slug: "content" },
    { label: "Email Copywriting", icon: "mail", slug: "content" },
    { label: "Case Studies", icon: "description", slug: "content" },
    { label: "Whitepapers", icon: "menu_book", slug: "content" },
    { label: "Branding", icon: "auto_awesome", slug: "branding" },
    { label: "Logo Design", icon: "brush", slug: "branding" },
    { label: "Visual Identity", icon: "palette", slug: "branding" },
    { label: "Pitch Deck Design", icon: "slideshow", slug: "branding" },
    { label: "Social Media Brand Kits", icon: "collections", slug: "branding" },
  ] },
  { title: "AI, Automation & Data", sub: "Systems that work while you sleep", icon: "smart_toy", items: [
    { label: "AI Chatbot Development", icon: "chat", slug: "automation" },
    { label: "WhatsApp AI Bot", icon: "forum", slug: "automation" },
    { label: "AI CRM Automation", icon: "sync_alt", slug: "automation" },
    { label: "AI Lead Qualification", icon: "filter_alt", slug: "automation" },
    { label: "AI Email Automation", icon: "outgoing_mail", slug: "automation" },
    { label: "Workflow Automation", icon: "account_tree", slug: "automation" },
    { label: "AI Reporting Dashboard", icon: "monitoring", slug: "analytics" },
    { label: "GA4 Setup", icon: "analytics", slug: "analytics" },
    { label: "Google Tag Manager", icon: "sell", slug: "analytics" },
    { label: "Looker Studio Dashboards", icon: "dashboard", slug: "analytics" },
    { label: "Funnel Tracking", icon: "filter_list", slug: "analytics" },
    { label: "CRM Reporting", icon: "table_chart", slug: "analytics" },
  ] },
  { title: "Ecommerce & Local Growth", sub: "Sell more online and win your local market", icon: "storefront", items: [
    { label: "Ecommerce Store Setup", icon: "add_business", slug: "ecommerce" },
    { label: "Product Page Optimization", icon: "inventory_2", slug: "ecommerce" },
    { label: "Marketplace Consulting", icon: "store", slug: "ecommerce" },
    { label: "Review Generation System", icon: "reviews", slug: "local" },
    { label: "Google Business Profile", icon: "business", slug: "local" },
    { label: "Map Pack SEO", icon: "map", slug: "local" },
    { label: "Online Reputation Management", icon: "verified", slug: "local" },
    { label: "Local Lead Generation", icon: "pin_drop", slug: "local" },
  ] },
  { title: "Retainers", sub: "Ongoing partnership and continuous improvement", icon: "autorenew", items: [
    { label: "Website Care Plan", icon: "health_and_safety", slug: "retainers" },
    { label: "SEO Retainer", icon: "travel_explore", slug: "retainers" },
    { label: "Ads Retainer", icon: "ads_click", slug: "retainers" },
    { label: "Content Retainer", icon: "edit_note", slug: "retainers" },
    { label: "AI Automation Retainer", icon: "smart_toy", slug: "retainers" },
    { label: "Social Media Retainer", icon: "share", slug: "retainers" },
    { label: "Analytics Retainer", icon: "monitoring", slug: "retainers" },
    { label: "Growth Retainer", icon: "trending_up", slug: "retainers" },
  ] },
];

// Every program includes the Growth Audit (/growth-audit) and a Custom
// Tracking Dashboard (/services/analytics), rendered once as a shared strip.
export const bundleBaseline = {
  note: "Every program starts with a Growth Audit and includes a live tracking dashboard — you always see what we're doing and what it's returning.",
  items: [
    { label: "Growth Audit", icon: "fact_check", href: "/growth-audit", desc: "We start by showing you exactly where you stand." },
    { label: "Custom Tracking Dashboard", icon: "monitoring", href: "/services/analytics", desc: "A live dashboard so you see progress and ROI at all times." },
  ],
};

export const industries = [
  { icon: "cloud", title: "SaaS & Technology", desc: "Demand generation, product-led funnels, and content that turns trials into paying, retained customers." },
  { icon: "shopping_cart", title: "Ecommerce", desc: "Store optimization, paid acquisition, and retention systems that grow revenue per visitor and order." },
  { icon: "storefront", title: "Local Businesses", desc: "Local SEO, reviews, and a strong Google presence that turns nearby searches into walk-in customers." },
  { icon: "medical_services", title: "Healthcare & Clinics", desc: "Trust-building websites, local visibility, and compliant lead systems that fill your appointment book." },
  { icon: "gavel", title: "Professional Services", desc: "Authority content, targeted ads, and clear funnels that generate qualified, high-value inquiries." },
  { icon: "self_improvement", title: "Coaches & Consultants", desc: "Personal brand, lead magnets, and nurture automation that fill your calendar with ideal clients." },
  { icon: "home_work", title: "Real Estate", desc: "Lead capture, local SEO, and follow-up automation that keep your pipeline full and responsive." },
  { icon: "school", title: "Education & Training", desc: "Enrollment funnels, content marketing, and ad campaigns that grow student and learner demand." },
  { icon: "rocket_launch", title: "Startups", desc: "Brand, MVP, and go-to-market systems that help you validate, launch, and scale with momentum." },
  { icon: "handshake", title: "B2B Service Companies", desc: "Account-based campaigns, LinkedIn growth, and pipeline systems built for longer sales cycles." },
];

export const useCases = [
  { icon: "web", title: "Launch a New Website", desc: "A fast, on-brand site built around conversion and ready to scale with your business." },
  { icon: "filter_alt", title: "Improve Lead Quality", desc: "Better targeting, qualification, and tracking so sales spends time on the right prospects." },
  { icon: "ad_units", title: "Build a High-Converting Landing Page", desc: "Focused pages engineered to turn campaign traffic into booked calls and leads." },
  { icon: "pin_drop", title: "Generate More Local Leads", desc: "Local SEO, reviews, and a strong Google presence that bring nearby customers in." },
  { icon: "travel_explore", title: "Improve Google Rankings", desc: "Technical fixes and content strategy that lift your visibility for terms that matter." },
  { icon: "ads_click", title: "Run Paid Campaigns Profitably", desc: "Well-tracked campaigns that scale spend only where it returns real revenue." },
  { icon: "sync_alt", title: "Automate Lead Follow-Up", desc: "Instant, consistent follow-up with CRM and AI workflows so no lead goes cold." },
  { icon: "smart_toy", title: "Build an AI Chatbot", desc: "A website or WhatsApp bot that answers, qualifies, and routes leads around the clock." },
  { icon: "rocket", title: "Create a SaaS MVP", desc: "A launch-ready product to validate your idea and start acquiring real users fast." },
  { icon: "shopping_cart", title: "Set Up Ecommerce Growth Systems", desc: "Store setup, optimization, and retention that lift revenue per visitor and order." },
  { icon: "dashboard", title: "Build Dashboards and Reporting", desc: "Clean tracking and live dashboards that turn your data into clear decisions." },
  { icon: "autorenew", title: "Maintain Systems Monthly", desc: "Ongoing care for website, marketing, and AI so performance keeps compounding." },
];

const purple = "linear-gradient(135deg,#4C1D95,#7C3AED)",
  blue = "linear-gradient(135deg,#1E3A8A,#3B82F6)",
  violet = "linear-gradient(135deg,#5B21B6,#A855F7)";

export const resourceCategories = [
  { name: "Digital Growth Strategy", icon: "strategy" },
  { name: "AI Automation", icon: "smart_toy" },
  { name: "Website Conversion", icon: "ads_click" },
  { name: "SEO & AI Search", icon: "travel_explore" },
  { name: "Paid Ads", icon: "campaign" },
  { name: "Social Media Growth", icon: "share" },
  { name: "Ecommerce Growth", icon: "shopping_cart" },
  { name: "Analytics & Reporting", icon: "monitoring" },
  { name: "Local Business Growth", icon: "location_on" },
];

export const posts = [
  { category: "Digital Growth Strategy", icon: "strategy", bg: purple, title: "Why Your Growth Stalls When Your Systems Don't Talk to Each Other", excerpt: "The hidden cost of disconnected tools — and how to think about growth as one system.", read: "7 min read" },
  { category: "AI Automation", icon: "smart_toy", bg: violet, title: "Where AI Actually Adds Leverage in a Growth System", excerpt: "A grounded look at the automation that moves the needle versus the hype that doesn't.", read: "6 min read" },
  { category: "Website Conversion", icon: "ads_click", bg: blue, title: "The Anatomy of a Landing Page That Converts", excerpt: "The structural choices that separate pages that capture leads from ones that lose them.", read: "8 min read" },
  { category: "SEO & AI Search", icon: "travel_explore", bg: purple, title: "Getting Found in the Age of AI Search", excerpt: "How AEO and GEO change the way you should think about organic visibility.", read: "9 min read" },
  { category: "Paid Ads", icon: "campaign", bg: violet, title: "How to Scale Ad Spend Without Lighting Money on Fire", excerpt: "The tracking and testing foundation that makes paid media a predictable investment.", read: "7 min read" },
  { category: "Social Media Growth", icon: "share", bg: blue, title: "Consistency Beats Virality: A Realistic Content System", excerpt: "Why a sustainable content rhythm outperforms chasing the occasional viral hit.", read: "5 min read" },
  { category: "Ecommerce Growth", icon: "shopping_cart", bg: purple, title: "Small Conversion Wins That Compound Into Real Revenue", excerpt: "Where to look first when you want to lift revenue per visitor in your store.", read: "6 min read" },
  { category: "Analytics & Reporting", icon: "monitoring", bg: violet, title: "The Few Metrics That Actually Deserve a Dashboard", excerpt: "Cut through vanity numbers and track what genuinely drives decisions.", read: "5 min read" },
  { category: "Local Business Growth", icon: "location_on", bg: blue, title: "Winning the Local Map Pack: A Practical Playbook", excerpt: "The profile, review, and SEO moves that put local businesses in front of nearby buyers.", read: "7 min read" },
];

export const studies = [
  { label: "Sample Case Study", type: "B2B SaaS", title: "Pipeline Growth System", icon: "conversion_path", bg: "linear-gradient(135deg,#4C1D95,#7C3AED)", challenge: "A SaaS team had traffic but inconsistent, low-quality leads reaching sales.", solution: "Rebuilt landing pages, added conversion tracking, and automated lead routing and follow-up.", outcome: "Improved lead quality and a more predictable, measurable pipeline." },
  { label: "Example Growth System", type: "Professional Services", title: "Search Visibility Growth", icon: "travel_explore", bg: "linear-gradient(135deg,#1E3A8A,#3B82F6)", challenge: "A services firm was invisible for the terms their buyers searched most.", solution: "Fixed technical SEO, built a content strategy, and optimized for AI search answers.", outcome: "Stronger organic visibility and a growing stream of inbound inquiries." },
  { label: "Illustrative Project", type: "Ecommerce", title: "Marketing Automation System", icon: "automation", bg: "linear-gradient(135deg,#5B21B6,#A855F7)", challenge: "A store relied on manual follow-up that didn't scale with order volume.", solution: "Implemented CRM automation, AI workflows, and self-building reporting dashboards.", outcome: "Reduced manual work and more consistent customer follow-up." },
  { label: "Sample Case Study", type: "Local Business", title: "Local Lead Generation System", icon: "pin_drop", bg: "linear-gradient(135deg,#6D28D9,#A855F7)", challenge: "A local business struggled to appear in map results and gather reviews.", solution: "Optimized the Google Business Profile and launched a steady review-generation system.", outcome: "Stronger local visibility and a healthier reputation footprint." },
  { label: "Example Growth System", type: "Startup", title: "SaaS MVP Launch System", icon: "rocket", bg: "linear-gradient(135deg,#3730A3,#6366F1)", challenge: "A founder needed to validate an idea without over-building or overspending.", solution: "Scoped and shipped a focused MVP with analytics and onboarding built in.", outcome: "A launch-ready product positioned to gather real user feedback." },
  { label: "Illustrative Project", type: "B2B Services", title: "Analytics & Reporting System", icon: "monitoring", bg: "linear-gradient(135deg,#155E75,#0891B2)", challenge: "Leadership lacked a clear view of what marketing efforts actually worked.", solution: "Set up GA4, funnel tracking, and live Looker Studio dashboards tied to revenue.", outcome: "Clearer decisions backed by accurate, accessible data." },
];

export const aboutPillars = [
  { icon: "person", label: "Human-led" },
  { icon: "smart_toy", label: "AI-enabled" },
  { icon: "strategy", label: "Strategy-first" },
  { icon: "rocket_launch", label: "Execution-focused" },
  { icon: "trending_up", label: "Built for growth" },
  { icon: "visibility", label: "Designed for clarity" },
];

export const aboutHow = [
  { icon: "strategy", title: "Strategy Before Action", desc: "We never execute on guesswork. Every engagement starts with a clear plan rooted in your goals and data." },
  { icon: "hub", title: "Systems, Not Tactics", desc: "We connect website, marketing, content, automation, and reporting so they reinforce each other." },
  { icon: "psychology", title: "AI-Enabled, Human-Led", desc: "We use AI for leverage and speed, but experienced people own the judgment and the outcomes." },
  { icon: "groups", title: "The Right Experts", desc: "We staff each project with specialists matched to your goals — never stretched generalists." },
  { icon: "summarize", title: "Clear Communication", desc: "You always know what we're doing, why, and what the results mean — no jargon, no smoke." },
  { icon: "trending_up", title: "Measurable Growth", desc: "We define success up front and report against it, so progress is always visible." },
];

export const aboutNetwork = [
  { icon: "strategy", role: "Growth Strategists" },
  { icon: "design_services", role: "Designers" },
  { icon: "code", role: "Developers" },
  { icon: "campaign", role: "Marketers" },
  { icon: "smart_toy", role: "Automation Engineers" },
  { icon: "monitoring", role: "Data Analysts" },
  { icon: "edit_note", role: "Copywriters" },
  { icon: "travel_explore", role: "SEO Specialists" },
];

export const aboutWhy = [
  "A single partner across strategy, systems, and execution",
  "Senior specialists, not stretched generalists",
  "Plans built around measurable growth — not vanity metrics",
  "Clear reporting and honest communication throughout",
  "AI leverage without losing the human judgment",
  "Flexible project and retainer support as you scale",
];

export const contactAssurances = [
  "A clear, practical next step — not a sales pitch",
  "Senior specialists matched to your goals",
  "No pricing pressure; just an honest plan",
];

export const contactServiceOptions = [
  "Select a service…",
  "AI Strategy & Digital Growth Consulting",
  "Website Design & Development",
  "SEO & AI Search Visibility",
  "Paid Advertising & Performance Marketing",
  "Social Media Marketing & Content Creation",
  "Content Marketing & Copywriting",
  "Branding & Creative Services",
  "AI Automation & AI Solutions",
  "Mobile App & Software Development",
  "Ecommerce & Marketplace Growth",
  "Data, Analytics & Reporting",
  "Online Reputation & Local Business Growth",
  "Maintenance Retainers",
  "Program: Patient Pipeline (Healthcare & Clinics)",
  "Program: Authority & Inquiry Engine (Professional Services)",
  "Program: Local Domination (Local Businesses)",
  "Program: B2B Pipeline (B2B Services)",
  "Program: SaaS Growth Engine (SaaS & Technology)",
  "Program: Listing-to-Lead (Real Estate)",
  "Program: Enrollment Growth (Education & Training)",
  "Program: Revenue Stack (Ecommerce)",
  "Program: Calendar-Filling System (Coaches & Consultants)",
  "Program: Launch Kit & Build Studio (Startups)",
  "Strategic Partnership (Tier 4)",
  "Not sure yet — help me decide",
];
