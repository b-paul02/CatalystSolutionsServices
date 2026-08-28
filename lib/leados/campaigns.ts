// Campaign domain: spec types, field library, and the pre-launch validation
// gate (blueprint §5.7 step 6). Pure — UI and actions both use it.
import { isSensitiveFieldName } from "./compliance";

export type FormField = {
  key: string;
  label: string;
  kind: "text" | "email" | "phone" | "select" | "textarea" | "checkbox";
  required: boolean;
  options?: string[]; // for select
};

export type FormSpec = {
  fields: FormField[];
  qualifying: FormField[];
  otpVerify: boolean; // phone OTP before accept
  emailVerify: boolean; // double opt-in style email confirm
  consentPurposes: string[];
  consentChannels: string[];
};

export type PageSpec = {
  template: "clean" | "split" | "compact";
  headline: string;
  body: string;
  cta: string;
  brandColor: string;
  thankYouMessage: string;
  thankYouRedirect?: string;
  whatsappNumber?: string;
  calendarUrl?: string;
};

export type Distribution = {
  mode: "round_robin" | "fixed";
  userIds: string[];
  slaMinutes: number;
  ackEmail: boolean;
  ackTemplate?: string;
};

export const CAMPAIGN_TYPES = [
  { value: "hosted_page", label: "Hosted landing page" },
  { value: "embedded_form", label: "Embedded website form" },
  { value: "meta_ads", label: "Meta lead ads" },
  { value: "google_ads", label: "Google ads" },
  { value: "whatsapp", label: "WhatsApp click-to-chat" },
  { value: "qr_offline", label: "QR / offline event" },
  { value: "referral", label: "Referral / partner links" },
] as const;

export const OBJECTIVES = [
  { value: "generate_inquiries", label: "Generate inquiries" },
  { value: "book_consultations", label: "Book consultations" },
  { value: "request_quotes", label: "Request quotations" },
  { value: "collect_registrations", label: "Collect registrations" },
  { value: "build_waitlist", label: "Build a waitlist" },
  { value: "request_demos", label: "Request product demos" },
] as const;

// Standard contact fields every form starts from.
export const BASE_FIELDS: FormField[] = [
  { key: "firstName", label: "First name", kind: "text", required: true },
  { key: "lastName", label: "Last name", kind: "text", required: false },
  { key: "phone", label: "Phone / WhatsApp", kind: "phone", required: true },
  { key: "email", label: "Email", kind: "email", required: false },
  { key: "city", label: "City", kind: "text", required: false },
];

export function defaultFormSpec(): FormSpec {
  return {
    fields: BASE_FIELDS,
    qualifying: [],
    otpVerify: false,
    emailVerify: false,
    consentPurposes: ["sales_contact"],
    consentChannels: ["call", "whatsapp"],
  };
}

export function defaultPageSpec(orgName: string): PageSpec {
  return {
    template: "clean",
    headline: `Get in touch with ${orgName}`,
    body: "Tell us what you're looking for and our team will reach out.",
    cta: "Request a callback",
    brandColor: "#6d28d9",
    thankYouMessage: "Thanks! We received your details and will contact you shortly.",
  };
}

// Claims a form may never make (§5.7 review). Deliberately blunt keyword list.
const PROHIBITED_CLAIM_PATTERNS = [
  /guaranteed (returns|profit|income)/i,
  /risk[- ]free investment/i,
  /100% (approval|guaranteed)/i,
  /cure[sd]?\b/i,
  /no documents? (needed|required)/i,
];

export type ReviewProblem = { severity: "error" | "warning"; message: string };

/** The step-6 validation gate. Errors block submission for review. */
export function validateCampaign(opts: {
  name: string;
  formSpec: FormSpec;
  pageSpec: PageSpec;
  offerText: string;
}): ReviewProblem[] {
  const problems: ReviewProblem[] = [];
  const f = opts.formSpec;
  if (!f.fields.some((x) => (x.kind === "phone" || x.kind === "email") && x.required)) {
    problems.push({ severity: "error", message: "The form must require at least one contact point (phone or email)." });
  }
  if (f.consentPurposes.length === 0) {
    problems.push({ severity: "error", message: "Pick at least one consent purpose — leads without a permitted purpose can never be contacted." });
  }
  if (f.consentChannels.length === 0) {
    problems.push({ severity: "error", message: "Pick at least one consent channel." });
  }
  for (const field of [...f.fields, ...f.qualifying]) {
    if (isSensitiveFieldName(`${field.key} ${field.label}`)) {
      problems.push({ severity: "error", message: `Field "${field.label}" collects sensitive data and is not allowed.` });
    }
  }
  const copy = `${opts.name} ${opts.pageSpec.headline} ${opts.pageSpec.body} ${opts.offerText}`;
  for (const p of PROHIBITED_CLAIM_PATTERNS) {
    if (p.test(copy)) {
      problems.push({ severity: "error", message: `Copy contains a prohibited claim (${p.source.slice(0, 30)}…).` });
    }
  }
  if (!opts.pageSpec.headline.trim()) problems.push({ severity: "error", message: "Add a headline." });
  if (f.qualifying.length > 6) problems.push({ severity: "warning", message: "More than 6 qualifying questions hurts conversion." });
  return problems;
}

/** Sanitize a client-posted FormSpec (drop unknown kinds, cap sizes). */
export function sanitizeFormSpec(raw: unknown): FormSpec {
  const d = defaultFormSpec();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<FormSpec>;
  const clean = (fields: unknown): FormField[] =>
    (Array.isArray(fields) ? fields : [])
      .slice(0, 20)
      .filter((x): x is FormField => Boolean(x && typeof x === "object" && (x as FormField).key && (x as FormField).label))
      .map((x) => ({
        key: String(x.key).slice(0, 40).replace(/[^a-zA-Z0-9_]/g, ""),
        label: String(x.label).slice(0, 120),
        kind: ["text", "email", "phone", "select", "textarea", "checkbox"].includes(x.kind) ? x.kind : "text",
        required: Boolean(x.required),
        options: Array.isArray(x.options) ? x.options.slice(0, 12).map((o) => String(o).slice(0, 80)) : undefined,
      }));
  return {
    fields: clean(r.fields).length ? clean(r.fields) : d.fields,
    qualifying: clean(r.qualifying),
    otpVerify: Boolean(r.otpVerify),
    emailVerify: Boolean(r.emailVerify),
    consentPurposes: (Array.isArray(r.consentPurposes) ? r.consentPurposes : d.consentPurposes).slice(0, 6).map(String),
    consentChannels: (Array.isArray(r.consentChannels) ? r.consentChannels : d.consentChannels).slice(0, 6).map(String),
  };
}
