// Doctor Digital Presence questionnaire — config-driven, transcribed from the
// "Doctor Digital Presence — Growth & Digital Solutions Questionnaire" PDF.
// Editing this file changes the wizard; no component changes needed.

export type DoctorQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "single" | "multi" | "scale";
  options?: string[];
  required?: boolean;
  maxSelect?: number;
  // show only when another answer matches (predicate over all answers)
  showIf?: { id: string; notIn?: string[]; in?: string[] };
  allowOther?: boolean;
};

export type DoctorSection = { key: string; title: string; questions: DoctorQuestion[] };

export const DOCTOR_SECTIONS: DoctorSection[] = [
  {
    key: "practice",
    title: "Doctor & practice information",
    questions: [
      { id: "name", label: "Doctor's name", type: "text", required: true },
      { id: "clinic", label: "Clinic / hospital name", type: "text", required: true },
      { id: "specialty", label: "Medical specialty", type: "single", required: true, allowOther: true, options: ["General Physician", "Dentist", "Dermatologist", "Gynecologist", "Pediatrician", "Orthopedic", "Cardiologist", "ENT", "Ophthalmologist"] },
      { id: "location", label: "Practice location — city / area", type: "text", required: true },
      { id: "years", label: "Years of practice", type: "single", required: true, options: ["0–2 years", "3–5 years", "6–10 years", "10+ years"] },
      { id: "practiceType", label: "Practice type", type: "single", required: true, allowOther: true, options: ["Individual practice", "Multi-doctor clinic", "Hospital", "Multiple locations"] },
    ],
  },
  {
    key: "online",
    title: "Current online presence",
    questions: [
      { id: "hasWebsite", label: "Do you currently have an official website?", type: "single", required: true, options: ["No website", "Yes — needs improvement", "Yes — satisfied", "Not sure"] },
      { id: "websiteUrl", label: "Website URL (we'll run a real technical scan on it)", type: "text", showIf: { id: "hasWebsite", in: ["Yes — needs improvement", "Yes — satisfied"] } },
      { id: "websiteSatisfaction", label: "How satisfied are you with your current website?", type: "scale", options: ["1 — Very dissatisfied", "2 — Dissatisfied", "3 — Average", "4 — Satisfied", "5 — Very satisfied"], showIf: { id: "hasWebsite", in: ["Yes — needs improvement", "Yes — satisfied"] } },
      { id: "websiteUpdated", label: "When was your website last updated?", type: "single", options: ["Within 6 months", "6–12 months ago", "1–2 years ago", "More than 2 years ago", "Don't know"], showIf: { id: "hasWebsite", in: ["Yes — needs improvement", "Yes — satisfied"] } },
      { id: "websiteFeatures", label: "Which features does your website currently have?", type: "multi", options: ["Doctor profile", "Qualifications / experience", "Services / treatments", "Clinic photos", "Testimonials / reviews", "Appointment booking", "WhatsApp / contact", "Google Maps / location", "FAQ section", "Health / blog content"], showIf: { id: "hasWebsite", in: ["Yes — needs improvement", "Yes — satisfied"] } },
    ],
  },
  {
    key: "google",
    title: "Google & online visibility",
    questions: [
      { id: "hasGbp", label: "Do you have a Google Business Profile?", type: "single", required: true, options: ["Yes", "No", "Not sure"] },
      { id: "googleRating", label: "How would you rate your Google presence?", type: "single", options: ["Excellent", "Good", "Average", "Poor", "Don't know"] },
      { id: "reviewCount", label: "Approximately how many Google reviews does your clinic have?", type: "single", options: ["Less than 50", "50–100", "100–250", "250–500", "500+", "Don't know"] },
      { id: "seoEffort", label: "Are you currently doing anything to improve your Google ranking?", type: "single", options: ["Yes — internally", "Yes — agency/freelancer", "No", "Don't know"] },
    ],
  },
  {
    key: "patients",
    title: "Patient acquisition & appointments",
    questions: [
      { id: "discovery", label: "How do most new patients currently find you?", type: "multi", required: true, allowOther: true, options: ["Google Search / Maps", "Referrals", "Existing patients", "Social media", "Hospital / clinic referrals", "Healthcare platforms", "Advertising"] },
      { id: "enquiries", label: "Approximately how many new online patient enquiries do you receive per month?", type: "single", required: true, options: ["0–10", "11–25", "26–50", "51–100", "100+", "Don't know"] },
      { id: "contactMethods", label: "How do patients usually contact you?", type: "multi", options: ["Phone", "WhatsApp", "Website", "Online booking", "Google Business Profile", "Social media"] },
      { id: "onlineBooking", label: "Do you currently offer online appointment booking?", type: "single", required: true, options: ["Yes", "No", "Planning to introduce it"] },
      { id: "challenge", label: "What is your biggest challenge with online patient enquiries?", type: "single", options: ["Not enough enquiries", "Too many to manage", "Patients don't follow up", "Difficult booking process", "Poor online visibility", "Website issues", "Don't know how patients find me", "No major challenge"] },
    ],
  },
  {
    key: "social",
    title: "Social media & professional brand",
    questions: [
      { id: "channels", label: "Which professional social channels do you currently use?", type: "multi", options: ["Instagram", "Facebook", "YouTube", "LinkedIn", "None"] },
      { id: "contentFrequency", label: "How frequently do you publish healthcare / educational content?", type: "single", options: ["Daily", "Several times a week", "Weekly", "Occasionally", "Never"] },
      { id: "profileAccuracy", label: "Does your current online profile accurately represent your professional reputation?", type: "single", options: ["Yes", "Partially", "No", "Not sure"] },
    ],
  },
  {
    key: "priorities",
    title: "Digital growth priorities",
    questions: [
      { id: "improve", label: "What would you most like to improve? (up to 3)", type: "multi", required: true, maxSelect: 3, options: ["Build a professional website", "Redesign existing website", "Get more patients from Google", "Improve Google ranking", "Get more Google reviews", "Increase online enquiries", "Increase appointment bookings", "Improve WhatsApp enquiries", "Improve social media presence", "Build professional doctor branding", "Create educational content", "Improve patient trust / credibility", "Expand to additional locations"] },
      { id: "biggestChallenge", label: "What is your biggest digital challenge right now?", type: "textarea" },
      { id: "valuedOutcome", label: "If your online presence improved significantly, what would be the most valuable outcome?", type: "single", options: ["More new patients", "More appointments", "Better visibility", "Stronger reputation", "Better patient communication", "More enquiries", "Better brand positioning"] },
    ],
  },
  {
    key: "plans",
    title: "Future plans & priority",
    questions: [
      { id: "plans12mo", label: "Are you planning any of the following in the next 12 months?", type: "multi", options: ["New clinic", "Additional branch", "New service / specialty", "Practice expansion", "Increased patient acquisition", "Online consultation", "New website", "Digital marketing", "None currently planned"] },
      { id: "importance", label: "How important is improving your digital presence over the next 6–12 months?", type: "scale", required: true, options: ["1 — Not important", "2 — Slightly important", "3 — Moderate", "4 — Very important", "5 — Extremely important"] },
    ],
  },
  {
    key: "contact",
    title: "Consultation & contact",
    questions: [
      { id: "invested", label: "Have you previously invested in website development or digital marketing?", type: "single", options: ["Yes", "No", "Currently investing", "Not sure"] },
      { id: "decisionMaker", label: "Who usually makes decisions regarding your clinic's digital presence?", type: "single", required: true, options: ["Doctor / Owner", "Clinic Manager", "Hospital Management", "Marketing Team", "Partner / Family"] },
      { id: "timing", label: "If you identify a suitable digital solution, when would you ideally like to implement it?", type: "single", required: true, options: ["Immediately", "Within 1 month", "Within 3 months", "Within 6 months", "Just exploring"] },
      { id: "assess", label: "What would you like us to assess?", type: "multi", options: ["Website", "Google visibility", "Google Business Profile", "Appointment journey", "Social media", "Overall digital presence", "Everything"] },
      { id: "phone", label: "Contact number (WhatsApp preferred)", type: "text" },
      { id: "email", label: "Email address (your report link is delivered here)", type: "text", required: true },
      { id: "extra", label: "Anything else you would like us to know?", type: "textarea" },
    ],
  },
];

/** Priority score for the admin queue (0–100). Doctor never sees this. */
export function scoreDoctor(a: Record<string, unknown>): { score: number; tag: string } {
  const s = (id: string) => String(a[id] ?? "");
  const importance = { "5 — Extremely important": 25, "4 — Very important": 20, "3 — Moderate": 12, "2 — Slightly important": 6 }[s("importance")] ?? 3;
  const timing = { "Immediately": 25, "Within 1 month": 20, "Within 3 months": 14, "Within 6 months": 8, "Just exploring": 4 }[s("timing")] ?? 4;
  const decision = { "Doctor / Owner": 20, "Partner / Family": 14, "Clinic Manager": 10 }[s("decisionMaker")] ?? 8;
  const invested = ["Yes", "Currently investing"].includes(s("invested")) ? 15 : 8;
  const volume = { "100+": 15, "51–100": 12, "26–50": 10, "11–25": 8 }[s("enquiries")] ?? 5;
  const score = importance + timing + decision + invested + volume;
  return { score, tag: score >= 70 ? "priority" : score >= 45 ? "standard" : "nurture" };
}
