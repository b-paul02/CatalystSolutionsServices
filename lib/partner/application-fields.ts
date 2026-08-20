import { programs } from "@/lib/programs";

// Option lists shared by the apply form, the scorer and the admin queue, so the
// three can never drift apart. Families come from the real programme catalogue.

export const MARKETS = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
] as const;

export const FAMILIES = programs.map((p) => ({ value: p.slug, label: p.name, industry: p.industry }));

export const ENTITY_TYPES = ["Individual", "Sole proprietorship", "Partnership / LLP", "Private limited", "Agency"];

export const DEAL_SIZE_BANDS = [
  "Under ₹50k / $1k",
  "₹50k–₹1.5L / $1k–$5k",
  "₹1.5L–₹4L / $5k–$15k",
  "₹4L–₹10L / $15k–$40k",
  "Above ₹10L / $40k",
];

export const PROSPECT_BANDS = ["0–2", "3–5", "6–10", "11–20", "20+"];

export const EXPECTED_DEALS_BANDS = ["1–2 a quarter", "1–2 a month", "3–5 a month", "5+ a month"];

export const LEAD_SOURCES = [
  "Existing client base",
  "Personal network / referrals",
  "Outbound email or calls",
  "LinkedIn / social",
  "Events and communities",
  "Inbound from my own site",
  "Agency or consultant partnerships",
];

export const INDUSTRIES = [...new Set(programs.map((p) => p.industry))];

// Fields an admin may ask the applicant to revise. The applicant's edit link is
// scoped to exactly these keys — nothing else on the row is writable by them.
export const REQUESTABLE_FIELDS: { key: string; label: string; kind: "text" | "long" | "number" }[] = [
  { key: "phone", label: "Phone", kind: "text" },
  { key: "linkedinUrl", label: "LinkedIn profile", kind: "text" },
  { key: "country", label: "Country", kind: "text" },
  { key: "city", label: "City", kind: "text" },
  { key: "yearsExperience", label: "Years selling services", kind: "number" },
  { key: "hoursPerWeek", label: "Hours a week", kind: "number" },
  { key: "dealExamples", label: "Deals you closed", kind: "long" },
  { key: "whyCatalyst", label: "Why Catalyst", kind: "long" },
];

export const QUOTE_THRESHOLD_TIERS = ["T1", "T2", "T3"];

export const REASON_CODE_LABELS: Record<string, string> = {
  insufficient_track_record: "Insufficient track record",
  no_market_access: "No market access",
  conflict_of_interest: "Conflict of interest",
  competitor: "Competitor",
  incomplete: "Incomplete application",
  geography_not_served: "Geography not served",
  integrity_concern: "Integrity concern",
};

export const REASON_CODES = [
  "insufficient_track_record",
  "no_market_access",
  "conflict_of_interest",
  "competitor",
  "incomplete",
  "geography_not_served",
  "integrity_concern",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

// Plain-language stage copy for the applicant status page. Nothing internal —
// no score, no band, no reviewer, no reason code.
export const APPLICANT_STATUS_COPY: Record<string, { title: string; body: string }> = {
  applied: {
    title: "Application received",
    body: "Thanks — we have your application. Our partnerships team reviews every application by hand, usually within five working days.",
  },
  screening: {
    title: "Under review",
    body: "Your application is with our partnerships team now. If we need anything else from you, we will email you.",
  },
  interview: {
    title: "Conversation scheduled",
    body: "We would like to talk. Check your email for details of the call — if you have not heard from us, reply to our last email.",
  },
  waiting_on_applicant: {
    title: "We need a little more from you",
    body: "We have asked you for a few extra details — check your email for the link to update your application. We will pick it up as soon as you have.",
  },
  low_priority: {
    title: "Under review",
    body: "Your application is with our partnerships team now. If we need anything else from you, we will email you.",
  },
  approved: {
    title: "Approved",
    body: "Welcome aboard. Your partner account is set up — check your email for your sign-in details.",
  },
  rejected: {
    title: "Not moving forward",
    body: "Thank you for your interest in partnering with Catalyst. We are not taking this application further at the moment. We are grateful you thought of us, and you are welcome to apply again in future.",
  },
};
