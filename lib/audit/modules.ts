// Config-driven service-family question modules (spec Stage 2).
// Adding a module = add an entry here + a rubric section in Context/estimate-rubrics.md. No code changes.

export type Question = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect";
  options?: string[];
  required?: boolean;
};

export type Module = {
  key: string;
  title: string;
  // family slugs (or the special "goal:more leads") that trigger this module
  triggers: string[];
  // section name in Context/estimate-rubrics.md the ModuleAnalyst reads
  rubric: string;
  questions: Question[];
};

export const MODULES: Module[] = [
  {
    key: "leadgen",
    title: "Lead Generation",
    triggers: ["paid-ads", "goal:more leads"],
    rubric: "Lead Generation",
    questions: [
      { id: "LG-1", label: "Are you running ads or outbound today? On which platforms, at roughly what monthly spend?", type: "textarea", required: true },
      { id: "LG-2", label: "What does a lead or sale cost you today, if you know? What would make new lead generation clearly worth it?", type: "textarea" },
      { id: "LG-3", label: "Where do leads land today (page, form, phone), and can we change those pages?", type: "textarea", required: true },
      { id: "LG-4", label: "Is conversion tracking set up, and do you trust it?", type: "select", options: ["Yes, and I trust it", "Yes, but I don't trust it", "No", "Not sure"], required: true },
    ],
  },
  {
    key: "seo",
    title: "SEO & AI Search Visibility",
    triggers: ["seo", "local"],
    rubric: "SEO & AI Search Visibility",
    questions: [
      { id: "SEO-1", label: "What should someone type into Google, or ask ChatGPT, to find you? Do you show up today?", type: "textarea", required: true },
      { id: "SEO-2", label: "Is your market local, national, or international? Which cities or regions matter most?", type: "textarea", required: true },
      { id: "SEO-3", label: "Have you done SEO work before, in-house or with an agency? What happened?", type: "textarea" },
      { id: "SEO-4", label: "Do you publish content today — blog, guides, videos? Who writes it?", type: "textarea" },
    ],
  },
  {
    key: "web",
    title: "Website",
    triggers: ["website", "ecommerce"],
    rubric: "Website Design & Development",
    questions: [
      { id: "WEB-1", label: "Is this a new site, a redesign, or fixes to the current site? What platform is it on, and must we keep it?", type: "textarea", required: true },
      { id: "WEB-2", label: "What is the site's main job?", type: "select", options: ["Leads", "Sales", "Bookings", "Credibility", "Self-service"], required: true },
      { id: "WEB-3", label: "Roughly how many pages or page types, and who provides copy and images? Any integrations (CRM, booking, payments)?", type: "textarea" },
      { id: "WEB-4", label: "Who will update the site after launch, and how technical are they?", type: "textarea" },
    ],
  },
];

/** Pick 1–2 modules from selected service slugs + primary goal. */
export function pickModules(services: string[], goal: string): Module[] {
  const keys = new Set(services);
  if (goal === "More leads") keys.add("goal:more leads");
  return MODULES.filter((m) => m.triggers.some((t) => keys.has(t))).slice(0, 2);
}

// The 13 Catalyst service families (intake Q4 options), matching site slugs.
export const FAMILIES = [
  { slug: "ai-strategy", label: "AI Strategy & Consulting" },
  { slug: "website", label: "Website Design & Development" },
  { slug: "seo", label: "SEO & AI Search Visibility" },
  { slug: "paid-ads", label: "Paid Advertising" },
  { slug: "social", label: "Social Media & Content Creation" },
  { slug: "content", label: "Content Marketing & Copywriting" },
  { slug: "branding", label: "Branding & Creative" },
  { slug: "automation", label: "AI Automation" },
  { slug: "software", label: "Mobile App & Software Development" },
  { slug: "ecommerce", label: "Ecommerce & Marketplace Growth" },
  { slug: "analytics", label: "Data, Analytics & Reporting" },
  { slug: "local", label: "Reputation & Local Growth" },
  { slug: "retainers", label: "Ongoing Maintenance & Retainers" },
  { slug: "not-sure", label: "Not sure — help me decide" },
];
