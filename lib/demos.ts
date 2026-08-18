// Per-industry configuration for the live demos embedded on bundle pages.
// Each industry uses its own fictional demo brand (the same one as its demo site),
// so a prospect never sees a dental chatbot on an education page.
// ponytail: plain data — the four demo components are generic renderers.

export type ChatConfig = {
  brand: string;
  accent: string;
  icon: string;
  status: string;
  intro: string;
  chips: string[];
  // Patterns are strings, not RegExp: these configs cross the server -> client
  // boundary and only plain values survive serialization. ChatDemo compiles them.
  replies: { match: string; answer: string; followUps?: string[] }[];
  fallback: string;
};

export type WaStep = { from: "bot" | "lead" | "event"; text: string; delay: number };
export type WaConfig = { brand: string; accent: string; icon: string; status: string; script: WaStep[] };

export type DashConfig = {
  brand: string;
  accent: string;
  icon: string;
  subtitle: string;
  segments: string[]; // filter pills
  data: Record<string, { kpis: { label: string; value: string; delta: string }[]; months: { m: string; pct: number; v: string }[]; channels: { label: string; pct: number; v: string }[] }>;
  trendTitle: string;
  channelTitle: string;
};

export type ScoreConfig = {
  title: string;
  subtitle: string;
  fields: { key: string; label: string; options: { label: string; pts: number }[] }[];
  disqualify?: { key: string; optionIndex: number; verdict: { grade: string; action: string } };
  verdicts: { min: number; grade: string; color: string; icon: string; action: string }[];
};

/* --------------------------------- chat --------------------------------- */

const FALLBACK = (what: string) =>
  `Good question — I'll make sure a human answers it properly. In a live deployment I'd take your details here, log the enquiry to the ${what} dashboard, and someone would follow up within 15 minutes. (This demo is scripted; your real assistant is trained on your own services, prices and FAQs.)`;

export const chatConfigs: Record<string, ChatConfig> = {
  "Healthcare & Clinics": {
    brand: "Lumina Dental & Skin",
    accent: "#0EA5A6",
    icon: "dentistry",
    status: "AI front desk · replies instantly",
    intro: "Hi! I'm the Lumina Dental & Skin assistant 🦷 I can book you an appointment, check treatment prices, or answer questions — even at 2am. What can I do for you?",
    chips: ["Book an appointment", "Dental implant cost", "I'm in pain — emergency?"],
    replies: [
      { match: "book|appoint|slot|visit", answer: "Happy to help! We have same-week slots at both locations. Main Clinic or North Branch? I'll show you the next three available times and send a WhatsApp confirmation instantly.", followUps: ["What are your timings?", "Dental implant cost"] },
      { match: "implant|cost|price|fee", answer: "Implants at Lumina are quoted all-inclusive — fixture, abutment and crown together, no surprise extras. The exact price depends on your bone condition, so we start with a free 15-minute assessment. Shall I book one?", followUps: ["Book an appointment"] },
      { match: "pain|hurt|emergency|swell", answer: "Sorry you're dealing with that — dental pain is miserable. I've flagged this as urgent: emergencies are seen same-day. Share your name and number and the front desk will call within 15 minutes during clinic hours.", followUps: ["What are your timings?"] },
      { match: "timing|hours|open|sunday", answer: "We're open Mon–Sat 9am–8pm, and Sunday mornings 10am–1pm at the Main Clinic. I can book you now so you only confirm once — want me to?", followUps: ["Book an appointment"] },
    ],
    fallback: FALLBACK("clinic"),
  },
  "Professional Services": {
    brand: "Meridian Legal Partners",
    accent: "#B45309",
    icon: "gavel",
    status: "AI intake assistant · 24×7",
    intro: "Hello — I'm the Meridian Legal intake assistant. I can explain how consultations work, check whether we handle your matter, and book you with the right partner. What brings you here?",
    chips: ["Do you handle my case?", "What does a consultation cost?", "How fast can I speak to someone?"],
    replies: [
      { match: "handle|case|matter|type", answer: "We work across corporate, employment, family and property matters. Tell me roughly what's happened and I'll confirm whether it's in scope — and if it isn't, I'll say so rather than book you a call you don't need.", followUps: ["What does a consultation cost?"] },
      { match: "cost|fee|price|charge", answer: "The initial 30-minute consultation is fixed-fee, and it's credited against your matter if you instruct us. You'll get a written fee estimate before any work begins — no open-ended billing.", followUps: ["How fast can I speak to someone?"] },
      { match: "fast|urgent|soon|quick|when", answer: "Urgent matters are triaged the same day. I'll take a few details now so the partner reads your situation before the call — that way your 30 minutes goes on advice, not paperwork.", followUps: ["Do you handle my case?"] },
      { match: "confidential|privacy|private", answer: "Everything you share here is confidential and covered by our privacy policy. Nothing is shared outside the firm, and the intake record is visible only to the partner handling your matter.", followUps: ["Do you handle my case?"] },
    ],
    fallback: FALLBACK("firm's intake"),
  },
  "SaaS & Technology": {
    brand: "Flowdesk",
    accent: "#7C3AED",
    icon: "rocket_launch",
    status: "AI sales assistant · answers in seconds",
    intro: "Hey! I'm the Flowdesk assistant. I can compare plans, answer technical questions, or get you into a trial or demo. What are you trying to work out?",
    chips: ["How is this different from Jira?", "What does it cost?", "Book a demo"],
    replies: [
      { match: "jira|asana|monday|different|compare|vs", answer: "Short version: Flowdesk is built for teams that plan in outcomes, not tickets. No mandatory sprint ceremony, no six-week configuration project. Most teams are live in a day. Want the full comparison page?", followUps: ["What does it cost?", "Book a demo"] },
      { match: "cost|price|plan|pricing", answer: "Free for up to 5 people, then $9 per user per month, and everything is included — no paywalled reporting or automation tiers. Annual billing saves two months.", followUps: ["Book a demo"] },
      { match: "demo|trial|try", answer: "You can start the 14-day trial without a card, or I can book a 20-minute demo with someone who'll set it up around your actual workflow. Which do you prefer?", followUps: ["What does it cost?"] },
      { match: "integrat|api|slack|github", answer: "We integrate with Slack, GitHub, Linear and Google Workspace out of the box, plus a REST API and webhooks for anything else. Migration from your current tool is a guided import.", followUps: ["Book a demo"] },
    ],
    fallback: FALLBACK("sales"),
  },
  "Education & Training": {
    brand: "Ascent Academy",
    accent: "#DB2777",
    icon: "school",
    status: "AI admission counselor · 24×7 in season",
    intro: "Namaste! I'm the Ascent Academy admissions assistant. I can explain programs, fees and batch timings, or start your application. Which program are you asking about?",
    chips: ["Which program suits me?", "What are the fees?", "When do batches start?"],
    replies: [
      { match: "program|course|suit|which|stream", answer: "We run engineering entrance, medical entrance and foundation programs. Tell me your class and target exam and I'll suggest the right batch — and be honest if a different institute fits you better.", followUps: ["What are the fees?", "When do batches start?"] },
      { match: "fee|cost|price|scholarship|emi", answer: "Fees vary by program length; the two-year integrated program can be paid in three instalments. Scholarships are available on the entrance test — most students who apply qualify for something.", followUps: ["When do batches start?"] },
      { match: "batch|start|when|timing|schedule", answer: "New batches start in April and June, with weekend batches through the year. Class sizes are capped at 30 so counselors know every student by name. Shall I hold a seat for you?", followUps: ["Which program suits me?"] },
      { match: "result|success|rank|selection", answer: "Our last cohort placed 68 students in the top percentile, and we publish full results rather than only the toppers. I can send the detailed results sheet — where should I send it?", followUps: ["Which program suits me?"] },
    ],
    fallback: FALLBACK("counselor"),
  },
  "Coaches & Consultants": {
    brand: "Anika Mehra Coaching",
    accent: "#9333EA",
    icon: "psychology",
    status: "AI assistant · books discovery calls",
    intro: "Hi — I'm Anika's assistant. I can explain how the coaching engagements work, check whether it's a fit, and book a discovery call. What's prompting you to look for a coach right now?",
    chips: ["How does coaching work?", "What does it cost?", "Book a discovery call"],
    replies: [
      { match: "how|work|process|format", answer: "Engagements run six months: fortnightly 60-minute sessions, with async support between them. It starts with a diagnostic on where you actually are, not a generic curriculum.", followUps: ["What does it cost?", "Book a discovery call"] },
      { match: "cost|price|fee|invest", answer: "Engagements are priced per six-month block and shared on the discovery call once we know the scope. Anika takes a limited number of clients at a time, so fit matters more than volume here.", followUps: ["Book a discovery call"] },
      { match: "book|call|discovery|schedule", answer: "The discovery call is 30 minutes, free, and genuinely diagnostic — you'll leave with a view of your situation whether or not you work together. Shall I show you this week's slots?", followUps: ["How does coaching work?"] },
      { match: "fit|right|suitable|who", answer: "Anika works with founders and senior leaders in high-stakes transitions — first exec role, scaling a team, or a hard decision. If you're earlier in your career she'll point you somewhere better suited.", followUps: ["Book a discovery call"] },
    ],
    fallback: FALLBACK("coaching"),
  },
};

/* ------------------------------- whatsapp ------------------------------- */

export const waConfigs: Record<string, WaConfig> = {
  "Local Businesses": {
    brand: "Summit Ridge Roofing",
    accent: "#EA580C",
    icon: "roofing",
    status: "WhatsApp Business · instant text-back",
    script: [
      { from: "event", text: "📞 Missed call from (555) 014-2287 — Tue 6:42 PM, after hours", delay: 400 },
      { from: "bot", text: "Hi, this is Summit Ridge Roofing — sorry we missed your call! I'm the automated assistant. Are you looking for a repair, a full replacement, or storm damage help?", delay: 1400 },
      { from: "lead", text: "Storm damage. Hail last night, I can see dented shingles and there's a wet patch on the ceiling", delay: 2200 },
      { from: "bot", text: "That wet patch means we should move fast — interior leaks get expensive quickly. I can have an inspector out tomorrow. Morning (8–11) or afternoon (1–4)?", delay: 2000 },
      { from: "lead", text: "Morning works", delay: 1500 },
      { from: "bot", text: "Booked ✅ Tomorrow 8–11 AM. You'll get a confirmation with your inspector's name and photo. One more thing — will you be filing an insurance claim? We document everything the adjuster needs.", delay: 2100 },
      { from: "lead", text: "Yes, probably. That would help a lot", delay: 1600 },
      { from: "bot", text: "Perfect, we'll bring the full documentation kit. See you tomorrow morning! 🏠", delay: 1700 },
      { from: "event", text: "✅ Lead qualified & booked in 94 seconds — logged to CRM, owner notified", delay: 1500 },
    ],
  },
  "Real Estate": {
    brand: "Harborview Realty",
    accent: "#0F766E",
    icon: "real_estate_agent",
    status: "WhatsApp Business · qualifies every enquiry",
    script: [
      { from: "event", text: "🏠 Enquiry on 14 Harbor View Way — Sat 9:12 PM, from the listing page", delay: 400 },
      { from: "bot", text: "Hi! Thanks for enquiring about 14 Harbor View Way. I'm Harborview's assistant — I can answer questions and book you a viewing. Are you looking to buy, or just starting to explore?", delay: 1400 },
      { from: "lead", text: "Looking to buy in the next couple of months. Is it still available?", delay: 2100 },
      { from: "bot", text: "It is — one offer fell through last week, so timing is good. Quick one so I match you with the right agent: are you pre-approved for financing, or still arranging that?", delay: 2000 },
      { from: "lead", text: "Pre-approved up to $720k", delay: 1500 },
      { from: "bot", text: "That works comfortably for this listing. I have viewings Sunday 11 AM and Monday 5:30 PM — which suits? Priya handles this street and will meet you there.", delay: 2000 },
      { from: "lead", text: "Sunday 11 works", delay: 1400 },
      { from: "bot", text: "Booked ✅ Sunday 11 AM with Priya. I'm sending the floor plan and the last three comparable sales on this street so you arrive informed. 🔑", delay: 1800 },
      { from: "event", text: "✅ Qualified buyer, pre-approved, viewing booked — assigned to Priya, 88 seconds", delay: 1500 },
    ],
  },
  Ecommerce: {
    brand: "Verve Botanicals",
    accent: "#65A30D",
    icon: "storefront",
    status: "WhatsApp Business · order support & recovery",
    script: [
      { from: "event", text: "🛒 Cart abandoned — ₹2,340, 40 minutes ago", delay: 400 },
      { from: "bot", text: "Hi! Verve Botanicals here 🌿 You left the Night Repair Oil and Vitamin C serum in your bag. Anything I can help with — sizing, ingredients, or delivery?", delay: 1500 },
      { from: "lead", text: "Is the oil ok for oily skin? I've had bad experiences", delay: 2200 },
      { from: "bot", text: "Fair worry — most face oils are too heavy. This one is jojoba-based, which is closest to your own sebum, so it absorbs rather than sitting on top. It's our most-repurchased product among oily-skin customers.", delay: 2200 },
      { from: "lead", text: "Ok that helps. Do you do returns if it doesn't work?", delay: 1800 },
      { from: "bot", text: "30 days, opened or not — if it doesn't suit you, we refund it. I've also applied FIRST10 for 10% off since this is your first order. Want me to send you back to your bag?", delay: 2000 },
      { from: "lead", text: "Yes please", delay: 1300 },
      { from: "bot", text: "Here you go — bag saved with the discount applied ✅ Free shipping is included over ₹999, so you're covered. 🌿", delay: 1700 },
      { from: "event", text: "✅ Cart recovered — ₹2,106 order placed, 2m 14s after the nudge", delay: 1500 },
    ],
  },
};

/* ------------------------------- dashboards ------------------------------- */

const dash = (
  brand: string,
  accent: string,
  icon: string,
  subtitle: string,
  segments: string[],
  trendTitle: string,
  channelTitle: string,
  data: DashConfig["data"]
): DashConfig => ({ brand, accent, icon, subtitle, segments, trendTitle, channelTitle, data });

export const dashConfigs: Record<string, DashConfig> = {
  "Healthcare & Clinics": dash(
    "Lumina Dental & Skin", "#0EA5A6", "dentistry", "March · updated daily · every number links to its source",
    ["All locations", "Main Clinic", "North Branch"], "Enquiries — last 5 months", "Enquiries by channel",
    {
      "All locations": {
        kpis: [{ label: "Enquiries this month", value: "163", delta: "+22%" }, { label: "Bookings", value: "118", delta: "+17%" }, { label: "Show rate", value: "82%", delta: "+3pts" }, { label: "Cost / new patient", value: "₹1,140", delta: "−15%" }],
        months: [{ m: "Nov", pct: 48, v: "89" }, { m: "Dec", pct: 42, v: "78" }, { m: "Jan", pct: 58, v: "107" }, { m: "Feb", pct: 72, v: "134" }, { m: "Mar", pct: 88, v: "163" }],
        channels: [{ label: "Google Business Profile", pct: 100, v: "71" }, { label: "Organic search", pct: 68, v: "48" }, { label: "WhatsApp click-to-chat", pct: 41, v: "29" }, { label: "Direct / repeat", pct: 21, v: "15" }],
      },
      "Main Clinic": {
        kpis: [{ label: "Enquiries this month", value: "98", delta: "+19%" }, { label: "Bookings", value: "74", delta: "+15%" }, { label: "Show rate", value: "84%", delta: "+2pts" }, { label: "Cost / new patient", value: "₹1,050", delta: "−18%" }],
        months: [{ m: "Nov", pct: 52, v: "56" }, { m: "Dec", pct: 46, v: "49" }, { m: "Jan", pct: 61, v: "66" }, { m: "Feb", pct: 76, v: "82" }, { m: "Mar", pct: 91, v: "98" }],
        channels: [{ label: "Google Business Profile", pct: 100, v: "44" }, { label: "Organic search", pct: 64, v: "28" }, { label: "WhatsApp click-to-chat", pct: 39, v: "17" }, { label: "Direct / repeat", pct: 20, v: "9" }],
      },
      "North Branch": {
        kpis: [{ label: "Enquiries this month", value: "65", delta: "+26%" }, { label: "Bookings", value: "44", delta: "+21%" }, { label: "Show rate", value: "79%", delta: "+4pts" }, { label: "Cost / new patient", value: "₹1,290", delta: "−9%" }],
        months: [{ m: "Nov", pct: 40, v: "33" }, { m: "Dec", pct: 35, v: "29" }, { m: "Jan", pct: 50, v: "41" }, { m: "Feb", pct: 63, v: "52" }, { m: "Mar", pct: 79, v: "65" }],
        channels: [{ label: "Google Business Profile", pct: 100, v: "27" }, { label: "Organic search", pct: 74, v: "20" }, { label: "WhatsApp click-to-chat", pct: 44, v: "12" }, { label: "Direct / repeat", pct: 22, v: "6" }],
      },
    }
  ),
  "B2B Service Companies": dash(
    "Northgate IT", "#2563EB", "dns", "Q1 · pipeline attributed to source, not guessed",
    ["All pipeline", "Managed IT", "Cybersecurity"], "Qualified leads — last 5 months", "Pipeline by source",
    {
      "All pipeline": {
        kpis: [{ label: "Qualified leads", value: "41", delta: "+31%" }, { label: "Meetings booked", value: "23", delta: "+15%" }, { label: "Pipeline created", value: "$684k", delta: "+27%" }, { label: "Cost per meeting", value: "$412", delta: "−19%" }],
        months: [{ m: "Nov", pct: 44, v: "18" }, { m: "Dec", pct: 38, v: "15" }, { m: "Jan", pct: 61, v: "25" }, { m: "Feb", pct: 76, v: "31" }, { m: "Mar", pct: 100, v: "41" }],
        channels: [{ label: "Organic / AEO", pct: 100, v: "16" }, { label: "LinkedIn (founder content)", pct: 75, v: "12" }, { label: "Gated asset downloads", pct: 50, v: "8" }, { label: "Paid search", pct: 31, v: "5" }],
      },
      "Managed IT": {
        kpis: [{ label: "Qualified leads", value: "27", delta: "+24%" }, { label: "Meetings booked", value: "16", delta: "+14%" }, { label: "Pipeline created", value: "$402k", delta: "+21%" }, { label: "Cost per meeting", value: "$388", delta: "−22%" }],
        months: [{ m: "Nov", pct: 44, v: "12" }, { m: "Dec", pct: 37, v: "10" }, { m: "Jan", pct: 63, v: "17" }, { m: "Feb", pct: 74, v: "20" }, { m: "Mar", pct: 100, v: "27" }],
        channels: [{ label: "Organic / AEO", pct: 100, v: "11" }, { label: "LinkedIn (founder content)", pct: 73, v: "8" }, { label: "Gated asset downloads", pct: 45, v: "5" }, { label: "Paid search", pct: 27, v: "3" }],
      },
      Cybersecurity: {
        kpis: [{ label: "Qualified leads", value: "14", delta: "+47%" }, { label: "Meetings booked", value: "7", delta: "+17%" }, { label: "Pipeline created", value: "$282k", delta: "+38%" }, { label: "Cost per meeting", value: "$467", delta: "−11%" }],
        months: [{ m: "Nov", pct: 43, v: "6" }, { m: "Dec", pct: 36, v: "5" }, { m: "Jan", pct: 57, v: "8" }, { m: "Feb", pct: 79, v: "11" }, { m: "Mar", pct: 100, v: "14" }],
        channels: [{ label: "Organic / AEO", pct: 100, v: "5" }, { label: "LinkedIn (founder content)", pct: 80, v: "4" }, { label: "Gated asset downloads", pct: 60, v: "3" }, { label: "Paid search", pct: 40, v: "2" }],
      },
    }
  ),
  "SaaS & Technology": dash(
    "Flowdesk", "#7C3AED", "rocket_launch", "March · signups attributed through to revenue",
    ["All plans", "Self-serve", "Sales-assisted"], "Trial signups — last 5 months", "Signups by channel",
    {
      "All plans": {
        kpis: [{ label: "Trial signups", value: "1,284", delta: "+34%" }, { label: "Trial → paid", value: "18.2%", delta: "+2.4pts" }, { label: "New MRR", value: "$21.4k", delta: "+29%" }, { label: "CAC payback", value: "4.1 mo", delta: "−0.8 mo" }],
        months: [{ m: "Nov", pct: 41, v: "528" }, { m: "Dec", pct: 36, v: "462" }, { m: "Jan", pct: 62, v: "796" }, { m: "Feb", pct: 78, v: "1002" }, { m: "Mar", pct: 100, v: "1284" }],
        channels: [{ label: "Programmatic SEO", pct: 100, v: "486" }, { label: "Comparison content", pct: 66, v: "321" }, { label: "Paid search", pct: 49, v: "238" }, { label: "Product referral", pct: 49, v: "239" }],
      },
      "Self-serve": {
        kpis: [{ label: "Trial signups", value: "1,096", delta: "+36%" }, { label: "Trial → paid", value: "15.8%", delta: "+1.9pts" }, { label: "New MRR", value: "$12.9k", delta: "+24%" }, { label: "CAC payback", value: "3.2 mo", delta: "−0.6 mo" }],
        months: [{ m: "Nov", pct: 41, v: "451" }, { m: "Dec", pct: 36, v: "395" }, { m: "Jan", pct: 63, v: "690" }, { m: "Feb", pct: 78, v: "855" }, { m: "Mar", pct: 100, v: "1096" }],
        channels: [{ label: "Programmatic SEO", pct: 100, v: "441" }, { label: "Comparison content", pct: 62, v: "274" }, { label: "Paid search", pct: 41, v: "179" }, { label: "Product referral", pct: 46, v: "202" }],
      },
      "Sales-assisted": {
        kpis: [{ label: "Demo requests", value: "188", delta: "+21%" }, { label: "Demo → paid", value: "31.9%", delta: "+4.1pts" }, { label: "New MRR", value: "$8.5k", delta: "+38%" }, { label: "CAC payback", value: "6.7 mo", delta: "−1.1 mo" }],
        months: [{ m: "Nov", pct: 41, v: "77" }, { m: "Dec", pct: 36, v: "67" }, { m: "Jan", pct: 56, v: "106" }, { m: "Feb", pct: 78, v: "147" }, { m: "Mar", pct: 100, v: "188" }],
        channels: [{ label: "Comparison content", pct: 100, v: "47" }, { label: "Programmatic SEO", pct: 96, v: "45" }, { label: "Paid search", pct: 100, v: "59" }, { label: "Product referral", pct: 79, v: "37" }],
      },
    }
  ),
  "Education & Training": dash(
    "Ascent Academy", "#DB2777", "school", "Admission season · enquiry to enrollment, per branch",
    ["All branches", "Main campus", "West branch"], "Enquiries — last 5 months", "Enquiries by channel",
    {
      "All branches": {
        kpis: [{ label: "Admission enquiries", value: "846", delta: "+41%" }, { label: "Counseling sessions", value: "512", delta: "+33%" }, { label: "Enrollments", value: "187", delta: "+28%" }, { label: "Cost per enrollment", value: "₹3,240", delta: "−17%" }],
        months: [{ m: "Nov", pct: 28, v: "236" }, { m: "Dec", pct: 34, v: "288" }, { m: "Jan", pct: 62, v: "524" }, { m: "Feb", pct: 81, v: "686" }, { m: "Mar", pct: 100, v: "846" }],
        channels: [{ label: "WhatsApp enquiry", pct: 100, v: "371" }, { label: "Paid search", pct: 64, v: "238" }, { label: "Organic search", pct: 41, v: "152" }, { label: "Referral / word of mouth", pct: 23, v: "85" }],
      },
      "Main campus": {
        kpis: [{ label: "Admission enquiries", value: "534", delta: "+38%" }, { label: "Counseling sessions", value: "331", delta: "+30%" }, { label: "Enrollments", value: "124", delta: "+26%" }, { label: "Cost per enrollment", value: "₹2,980", delta: "−19%" }],
        months: [{ m: "Nov", pct: 29, v: "155" }, { m: "Dec", pct: 35, v: "187" }, { m: "Jan", pct: 63, v: "336" }, { m: "Feb", pct: 82, v: "438" }, { m: "Mar", pct: 100, v: "534" }],
        channels: [{ label: "WhatsApp enquiry", pct: 100, v: "241" }, { label: "Paid search", pct: 61, v: "147" }, { label: "Organic search", pct: 40, v: "96" }, { label: "Referral / word of mouth", pct: 21, v: "50" }],
      },
      "West branch": {
        kpis: [{ label: "Admission enquiries", value: "312", delta: "+46%" }, { label: "Counseling sessions", value: "181", delta: "+38%" }, { label: "Enrollments", value: "63", delta: "+32%" }, { label: "Cost per enrollment", value: "₹3,760", delta: "−12%" }],
        months: [{ m: "Nov", pct: 26, v: "81" }, { m: "Dec", pct: 32, v: "101" }, { m: "Jan", pct: 60, v: "188" }, { m: "Feb", pct: 79, v: "248" }, { m: "Mar", pct: 100, v: "312" }],
        channels: [{ label: "WhatsApp enquiry", pct: 100, v: "130" }, { label: "Paid search", pct: 70, v: "91" }, { label: "Organic search", pct: 43, v: "56" }, { label: "Referral / word of mouth", pct: 27, v: "35" }],
      },
    }
  ),
  Ecommerce: dash(
    "Verve Botanicals", "#65A30D", "storefront", "March · revenue per visitor, not just traffic",
    ["All channels", "Direct store", "Marketplace"], "Revenue — last 5 months (₹ lakh)", "Revenue by channel",
    {
      "All channels": {
        kpis: [{ label: "Revenue", value: "₹28.4L", delta: "+36%" }, { label: "Conversion rate", value: "3.1%", delta: "+0.7pts" }, { label: "Average order value", value: "₹1,840", delta: "+12%" }, { label: "Repeat purchase rate", value: "31%", delta: "+6pts" }],
        months: [{ m: "Nov", pct: 46, v: "13.1" }, { m: "Dec", pct: 71, v: "20.2" }, { m: "Jan", pct: 52, v: "14.8" }, { m: "Feb", pct: 73, v: "20.9" }, { m: "Mar", pct: 100, v: "28.4" }],
        channels: [{ label: "Organic + email flows", pct: 100, v: "₹11.2L" }, { label: "Paid social", pct: 76, v: "₹8.5L" }, { label: "Marketplace", pct: 51, v: "₹5.7L" }, { label: "WhatsApp recovery", pct: 27, v: "₹3.0L" }],
      },
      "Direct store": {
        kpis: [{ label: "Revenue", value: "₹22.7L", delta: "+39%" }, { label: "Conversion rate", value: "3.4%", delta: "+0.8pts" }, { label: "Average order value", value: "₹1,920", delta: "+14%" }, { label: "Repeat purchase rate", value: "36%", delta: "+7pts" }],
        months: [{ m: "Nov", pct: 45, v: "10.3" }, { m: "Dec", pct: 70, v: "15.9" }, { m: "Jan", pct: 51, v: "11.6" }, { m: "Feb", pct: 73, v: "16.6" }, { m: "Mar", pct: 100, v: "22.7" }],
        channels: [{ label: "Organic + email flows", pct: 100, v: "₹11.2L" }, { label: "Paid social", pct: 76, v: "₹8.5L" }, { label: "WhatsApp recovery", pct: 27, v: "₹3.0L" }, { label: "Referral", pct: 0, v: "—" }],
      },
      Marketplace: {
        kpis: [{ label: "Revenue", value: "₹5.7L", delta: "+24%" }, { label: "Conversion rate", value: "2.2%", delta: "+0.3pts" }, { label: "Average order value", value: "₹1,540", delta: "+6%" }, { label: "Repeat purchase rate", value: "14%", delta: "+2pts" }],
        months: [{ m: "Nov", pct: 49, v: "2.8" }, { m: "Dec", pct: 75, v: "4.3" }, { m: "Jan", pct: 56, v: "3.2" }, { m: "Feb", pct: 75, v: "4.3" }, { m: "Mar", pct: 100, v: "5.7" }],
        channels: [{ label: "Marketplace search", pct: 100, v: "₹4.1L" }, { label: "Sponsored listings", pct: 39, v: "₹1.6L" }, { label: "Organic + email flows", pct: 0, v: "—" }, { label: "Paid social", pct: 0, v: "—" }],
      },
    }
  ),
  Startups: dash(
    "Loopwise", "#0891B2", "auto_awesome", "Post-launch · the numbers your investors ask about",
    ["All traffic"], "Waitlist signups — since launch", "Signups by source",
    {
      "All traffic": {
        kpis: [{ label: "Waitlist signups", value: "2,140", delta: "+62%" }, { label: "Activated accounts", value: "418", delta: "+44%" }, { label: "Week-4 retention", value: "38%", delta: "+9pts" }, { label: "Uptime", value: "99.98%", delta: "0 incidents" }],
        months: [{ m: "Nov", pct: 18, v: "196" }, { m: "Dec", pct: 31, v: "338" }, { m: "Jan", pct: 55, v: "598" }, { m: "Feb", pct: 74, v: "804" }, { m: "Mar", pct: 100, v: "2140" }],
        channels: [{ label: "Launch coverage", pct: 100, v: "864" }, { label: "Founder social", pct: 71, v: "612" }, { label: "Organic search", pct: 48, v: "417" }, { label: "Referral", pct: 29, v: "247" }],
      },
    }
  ),
};

/* ----------------------------- lead scoring ----------------------------- */

export const scoreConfigs: Record<string, ScoreConfig> = {
  "Local Businesses": {
    title: "AI Lead Qualification",
    subtitle: "Build a test enquiry, watch it get scored & routed",
    fields: [
      { key: "service", label: "What do they need?", options: [{ label: "Full roof replacement", pts: 40 }, { label: "Storm damage repair", pts: 35 }, { label: "Small leak repair", pts: 18 }, { label: "“Just researching”", pts: 6 }] },
      { key: "timeline", label: "How soon?", options: [{ label: "Emergency — this week", pts: 30 }, { label: "Within a month", pts: 22 }, { label: "Next few months", pts: 12 }, { label: "No timeline", pts: 4 }] },
      { key: "area", label: "Where are they?", options: [{ label: "Inside service area", pts: 20 }, { label: "Edge of service area", pts: 10 }, { label: "Outside service area", pts: 0 }] },
      { key: "source", label: "How did they arrive?", options: [{ label: "Called after Google search", pts: 10 }, { label: "Form on landing page", pts: 8 }, { label: "Facebook ad click", pts: 5 }] },
    ],
    disqualify: { key: "area", optionIndex: 2, verdict: { grade: "Not routed", action: "Polite decline sent automatically with a referral suggestion — no sales time spent." } },
    verdicts: [
      { min: 75, grade: "Hot lead", color: "#6EE7B7", icon: "local_fire_department", action: "Instant text-back sent + the owner's phone rings within 60 seconds. Estimate slot offered in-chat." },
      { min: 45, grade: "Qualified", color: "#FBBF24", icon: "verified", action: "Auto-reply with booking link, added to the CRM pipeline, follow-up sequence starts tomorrow morning." },
      { min: 0, grade: "Nurture", color: "#c4b5fd", icon: "schedule", action: "Added to the nurture list — helpful guide sent now, seasonal check-in scheduled. No pressure, no wasted sales time." },
    ],
  },
  "Professional Services": {
    title: "AI Intake Qualification",
    subtitle: "Build a test enquiry, watch it triage before a partner sees it",
    fields: [
      { key: "matter", label: "What's the matter?", options: [{ label: "Commercial dispute", pts: 40 }, { label: "Employment claim", pts: 32 }, { label: "Property transaction", pts: 24 }, { label: "General question", pts: 6 }] },
      { key: "urgency", label: "How urgent?", options: [{ label: "Court date set", pts: 30 }, { label: "Within a month", pts: 22 }, { label: "Exploring options", pts: 12 }, { label: "No timeline", pts: 4 }] },
      { key: "scope", label: "In our practice areas?", options: [{ label: "Core practice area", pts: 20 }, { label: "Adjacent — needs a check", pts: 10 }, { label: "Outside our areas", pts: 0 }] },
      { key: "source", label: "How did they arrive?", options: [{ label: "Referral from a client", pts: 10 }, { label: "Organic search", pts: 8 }, { label: "LinkedIn content", pts: 6 }] },
    ],
    disqualify: { key: "scope", optionIndex: 2, verdict: { grade: "Referred out", action: "Courteous referral sent to a firm that does handle it — reputation protected, zero partner time spent." } },
    verdicts: [
      { min: 75, grade: "Priority intake", color: "#6EE7B7", icon: "local_fire_department", action: "Routed straight to the partner for that practice area, consultation offered same day, intake summary attached." },
      { min: 45, grade: "Qualified", color: "#FBBF24", icon: "verified", action: "Consultation booking link sent, matter summary logged to the CRM, partner briefed before the call." },
      { min: 0, grade: "Nurture", color: "#c4b5fd", icon: "schedule", action: "Sent the relevant guide and added to the nurture sequence — no partner time consumed on an enquiry that isn't ready." },
    ],
  },
  "B2B Service Companies": {
    title: "AI Lead Qualification",
    subtitle: "Build a test enquiry, watch it score and route to sales",
    fields: [
      { key: "need", label: "What do they need?", options: [{ label: "Full managed IT contract", pts: 40 }, { label: "Security assessment", pts: 32 }, { label: "One-off project", pts: 18 }, { label: "Pricing curiosity", pts: 6 }] },
      { key: "size", label: "How big are they?", options: [{ label: "100+ seats", pts: 30 }, { label: "40–99 seats", pts: 24 }, { label: "10–39 seats", pts: 14 }, { label: "Under 10 seats", pts: 4 }] },
      { key: "fit", label: "Do they fit the ICP?", options: [{ label: "Target industry & region", pts: 20 }, { label: "Adjacent fit", pts: 10 }, { label: "Outside ICP", pts: 0 }] },
      { key: "source", label: "How did they arrive?", options: [{ label: "Gated asset download", pts: 10 }, { label: "Organic / AEO", pts: 8 }, { label: "LinkedIn content", pts: 6 }] },
    ],
    disqualify: { key: "fit", optionIndex: 2, verdict: { grade: "Not routed", action: "Auto-declined with a helpful alternative — your sales team never spends an hour discovering it was never a fit." } },
    verdicts: [
      { min: 75, grade: "Sales-ready", color: "#6EE7B7", icon: "local_fire_department", action: "Routed to the account executive with an enrichment summary, meeting link sent within the minute." },
      { min: 45, grade: "Qualified", color: "#FBBF24", icon: "verified", action: "Added to the pipeline with a lead score, nurture sequence starts, AE notified for follow-up this week." },
      { min: 0, grade: "Nurture", color: "#c4b5fd", icon: "schedule", action: "Enters the long-cycle nurture track — content by topic, re-scored automatically when behaviour changes." },
    ],
  },
  "Real Estate": {
    title: "AI Buyer Qualification",
    subtitle: "Build a test enquiry, watch it qualify before an agent calls",
    fields: [
      { key: "intent", label: "What do they want?", options: [{ label: "Ready to buy", pts: 40 }, { label: "Selling and buying", pts: 34 }, { label: "Browsing seriously", pts: 18 }, { label: "Curious about prices", pts: 6 }] },
      { key: "timeline", label: "How soon?", options: [{ label: "This month", pts: 30 }, { label: "Within 3 months", pts: 24 }, { label: "6–12 months", pts: 12 }, { label: "No timeline", pts: 4 }] },
      { key: "finance", label: "Financing?", options: [{ label: "Pre-approved", pts: 20 }, { label: "Applied, awaiting approval", pts: 12 }, { label: "Not started", pts: 3 }] },
      { key: "source", label: "How did they arrive?", options: [{ label: "Listing page enquiry", pts: 10 }, { label: "Paid campaign", pts: 7 }, { label: "Social post", pts: 5 }] },
    ],
    verdicts: [
      { min: 75, grade: "Hot buyer", color: "#6EE7B7", icon: "local_fire_department", action: "Assigned to the agent for that street, viewing slots offered in-chat, comparable sales sent automatically." },
      { min: 45, grade: "Qualified", color: "#FBBF24", icon: "verified", action: "Added to the CRM with a buyer profile, matching listings sent weekly, agent follows up within 24 hours." },
      { min: 0, grade: "Nurture", color: "#c4b5fd", icon: "schedule", action: "Enters the market-update nurture — re-scored automatically the moment they engage with a listing again." },
    ],
  },
};

/* --------------------------- industry → demos --------------------------- */

export type DemoKind = "chat" | "whatsapp" | "score" | "dashboard";

// Which two demos best represent each program. Order matters — the first is the
// headline demo for that industry.
export const demosFor: Record<string, DemoKind[]> = {
  "Healthcare & Clinics": ["chat", "dashboard"],
  "Professional Services": ["score", "chat"],
  "Local Businesses": ["whatsapp", "score"],
  "B2B Service Companies": ["score", "dashboard"],
  "SaaS & Technology": ["dashboard", "chat"],
  "Real Estate": ["whatsapp", "score"],
  "Education & Training": ["chat", "dashboard"],
  Ecommerce: ["whatsapp", "dashboard"],
  "Coaches & Consultants": ["chat"],
  Startups: ["dashboard"],
};
