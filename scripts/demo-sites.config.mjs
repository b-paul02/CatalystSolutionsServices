// Demo-site build config: which downloaded template becomes which fictional brand.
// Templates are NOT committed — they're downloaded to a scratch dir (see README below)
// and transformed into public/demo-sites/<slug>/ by scripts/build-demo-sites.mjs.
//
// Every template's license requires its footer attribution link to stay. The build
// deliberately does not touch those; it replaces identity strings only.
//
// Source templates (download to <scratch>/templates/ before running the build):
//   dentcare-main               github.com/technext/dentcare        CC BY 4.0 (HTML Codex)
//   lawyer-master               github.com/technext/lawyer          Colorlib (attribution)
//   roofing-master              github.com/technext/roofing         Colorlib (attribution)
//   itsolution-master           github.com/technext/itsolution      Colorlib (attribution)
//   play-bootstrap-main         github.com/uideck/play-bootstrap    MIT
//   property-main               github.com/technext/property        CC BY 3.0 (Untree.co)
//   educenter-bootstrap-main    github.com/themefisher/educenter-bootstrap  MIT
//   eshopper-main               github.com/technext/eshopper        CC BY 4.0 (HTML Codex)
//   lifecoach-master            github.com/technext/lifecoach       Colorlib (attribution)
//   startbootstrap-agency-master  github.com/StartBootstrap/startbootstrap-agency  MIT

// Folders/files that are build tooling or vendor docs, not the site itself.
export const PRUNE = [
  "scss", "source", "screenshots", "src", "scripts", "211 Lawyer DOC",
  "package.json", "package-lock.json", "gulpfile.js", "netlify.toml",
  "prepros-6.config", "prepros.config", ".gitattributes", ".gitignore",
  "README.md", "readme.md", "CHANGELOG.md",
];

// CDN assets to pull local. Key = URL as it appears in the HTML.
export const VENDOR = [
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.4.1/font/bootstrap-icons.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.0.0/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.10.0/css/all.min.css",
  "https://code.jquery.com/jquery-3.4.1.min.js",
  "https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/js/bootstrap.bundle.min.js",
  "https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css",
  "https://use.fontawesome.com/releases/v6.3.0/js/all.js",
];

const CONTACT = {
  clinic: { phone: "+91 80 4567 2200", email: "hello@luminadental.demo", addr: "48 MG Road, Bengaluru 560001" },
  legal: { phone: "+91 22 6789 4400", email: "consult@meridianlegal.demo", addr: "12 Fort Street, Mumbai 400001" },
  roof: { phone: "(555) 014-2287", email: "estimates@summitridgeroofing.demo", addr: "1420 Ridge Court, Denver, CO 80205" },
  it: { phone: "(555) 026-8100", email: "hello@northgateit.demo", addr: "300 Harbor Park Drive, Columbus, OH 43215" },
  saas: { phone: "(555) 031-7700", email: "hello@flowdesk.demo", addr: "215 Market Street, San Francisco, CA 94105" },
  realty: { phone: "(555) 048-9120", email: "agents@harborviewrealty.demo", addr: "90 Harbor View Way, Seattle, WA 98101" },
  edu: { phone: "+91 11 4567 8800", email: "admissions@ascentacademy.demo", addr: "27 Nehru Nagar, New Delhi 110065" },
  shop: { phone: "+91 22 4488 1200", email: "care@vervebotanicals.demo", addr: "8 Linking Road, Mumbai 400050" },
  coach: { phone: "+91 98 7654 3210", email: "hello@anikamehra.demo", addr: "Coaching sessions worldwide — online" },
  startup: { phone: "(555) 052-3400", email: "hello@loopwise.demo", addr: "1 Innovation Way, Austin, TX 78701" },
};

/** @type {{slug:string,src:string,brand:string,title:string,desc:string,contact:object,replace:[RegExp|string,string][]}[]} */
export const SITES = [
  {
    slug: "lumina-dental",
    src: "dentcare-main",
    brand: "Lumina Dental & Skin",
    title: "Lumina Dental & Skin — Gentle, modern dentistry in Bengaluru",
    desc: "Dental implants, invisible aligners, and dermatology at a doctor-led clinic. Same-week appointments across two locations.",
    contact: CONTACT.clinic,
    replace: [
      [/DentCare/g, "Lumina Dental &amp; Skin"],
      [/Dental Clinic Website Template/g, "Dental &amp; Skin Clinic"],
      [/Free HTML Templates/g, "Lumina Dental &amp; Skin"],
      [/Free HTML Template/g, "Lumina Dental &amp; Skin"],
    ],
  },
  {
    slug: "meridian-legal",
    src: "lawyer-master",
    brand: "Meridian Legal Partners",
    title: "Meridian Legal Partners — Clear counsel, measured strategy",
    desc: "Corporate, employment, family and property law. Structured 30-minute consultations with partner-led matters.",
    contact: CONTACT.legal,
    replace: [
      [/\bLawyer\b(?!s)/g, "Meridian Legal"],
      [/Free Bootstrap \d+ Template by Colorlib/g, "Meridian Legal Partners"],
    ],
  },
  {
    slug: "summit-ridge-roofing",
    src: "roofing-master",
    brand: "Summit Ridge Roofing",
    title: "Summit Ridge Roofing — Storm-rated roofing, 24-hour estimates",
    desc: "Roof replacement, storm damage restoration and commercial roofing across the metro. Written estimates in 24 hours.",
    contact: CONTACT.roof,
    replace: [
      [/Free Bootstrap \d+ Template by Colorlib/g, "Summit Ridge Roofing"],
      [/\bRoofing Co\.?\b/g, "Summit Ridge Roofing"],
    ],
  },
  {
    slug: "northgate-it",
    src: "itsolution-master",
    brand: "Northgate IT",
    title: "Northgate IT — Managed IT that stops the repeat tickets",
    desc: "Managed IT, cybersecurity and cloud for mid-market operations teams. Root-cause first, not more help-desk hours.",
    contact: CONTACT.it,
    replace: [
      [/ITSolution/g, "Northgate IT"],
      [/Free Bootstrap \d+ Template by Colorlib/g, "Northgate IT"],
    ],
  },
  {
    slug: "flowdesk",
    src: "play-bootstrap-main",
    brand: "Flowdesk",
    title: "Flowdesk — Project management that fits how your team actually works",
    desc: "Plan, track and ship work in one place. Free 14-day trial, no card required.",
    contact: CONTACT.saas,
    replace: [
      [/\bPlay\b(?!er|ing|ed|s\b)/g, "Flowdesk"],
      [/Free Startup and SaaS Landing Page Template by UIdeck/g, "Project management, simplified"],
      [/UIdeck/g, "Flowdesk"],
    ],
  },
  {
    slug: "harborview-realty",
    src: "property-main",
    brand: "Harborview Realty",
    title: "Harborview Realty — Homes, listings and honest market advice",
    desc: "Residential and commercial listings across the metro, with agents who answer the phone.",
    contact: CONTACT.realty,
    replace: [
      [/>Property<span/g, ">Harborview<span"],
      [/Free Bootstrap \d+ Template by (Colorlib|Untree\.co)/g, "Harborview Realty"],
    ],
  },
  {
    slug: "ascent-academy",
    src: "educenter-bootstrap-main/theme",
    brand: "Ascent Academy",
    title: "Ascent Academy — Test-prep coaching with counselor-led admissions",
    desc: "Engineering, medical and foundation programs with small batches and 24×7 admission counseling.",
    contact: CONTACT.edu,
    replace: [
      [/Educenter/gi, "Ascent Academy"],
      [/Themefisher/g, "Ascent Academy"],
    ],
  },
  {
    slug: "verve-botanicals",
    src: "eshopper-main",
    brand: "Verve Botanicals",
    title: "Verve Botanicals — Clean, effective skincare",
    desc: "Plant-led serums, oils and moisturisers formulated without the guesswork. Free shipping over ₹999.",
    contact: CONTACT.shop,
    replace: [
      [/EShopper/g, "Verve Botanicals"],
      [/Bootstrap Shop Template/g, "Skincare Store"],
      [/Free HTML Templates?/g, "Verve Botanicals"],
    ],
  },
  {
    slug: "anika-mehra-coaching",
    src: "lifecoach-master",
    brand: "Anika Mehra Coaching",
    title: "Anika Mehra — Executive coaching for founders and senior leaders",
    desc: "One-to-one coaching for high-stakes transitions. Limited engagements, application-based.",
    contact: CONTACT.coach,
    replace: [
      [/Life\s*Coach/gi, "Anika Mehra"],
      [/Free Bootstrap \d+ Template by Colorlib/g, "Anika Mehra Coaching"],
    ],
  },
  {
    slug: "loopwise",
    src: "startbootstrap-agency-master/dist",
    brand: "Loopwise",
    title: "Loopwise — Turn customer feedback into your roadmap",
    desc: "An early-stage product that collects, clusters and ranks customer feedback so teams build what matters.",
    contact: CONTACT.startup,
    replace: [
      [/Start Bootstrap/g, "Loopwise"],
      [/StartBootstrap/g, "Loopwise"],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Tier layer: per-site content for the widgets injected INTO the site */
/* Widget sets per tier mirror lib/proof.ts demoSites[].tiers.         */

const T3 = (labels) => [
  { label: labels[0], short: "T1", widgets: [] },
  { label: labels[1], short: "T2", widgets: ["enquiry", "whatsapp", "reviews"] },
  { label: labels[2], short: "T3", widgets: ["chat", "dashboard", "locations"] },
];

export const tierLayers = {
  "lumina-dental": {
    tiers: T3(["Tier 1 — Digital Presence", "Tier 2 — Patient Growth", "Tier 3 — Clinic Scale Premium"]),
    hello: "Free implant assessment this month — 15 minutes with a doctor, no obligation.",
    locations: ["Main Clinic — MG Road", "North Branch"],
    dashHref: "/bundles/patient-pipeline-bundle#demos",
    bookLabel: "Book an appointment", bookCta: "See available slots",
    chatIntro: "Hi! I'm the Lumina assistant 🦷 I can book you in, check prices, or flag an emergency — even at 2am.",
    chatLabel: "Ask the AI front desk",
    chat: [
      { q: "Book an appointment", a: "Happy to help! Same-week slots at both locations. Main Clinic or North Branch? You'll get a WhatsApp confirmation instantly." },
      { q: "Dental implant cost", a: "Implants are quoted all-inclusive — fixture, abutment and crown, no surprise extras. It starts with a free 15-minute assessment. Shall I book one?" },
      { q: "I'm in pain — emergency?", a: "Sorry you're dealing with that. I've flagged this urgent — emergencies are seen same-day. Share your number and the front desk calls within 15 minutes." },
    ],
    wa: [
      { f: "e", t: "📞 Missed call — Tue 9:12 PM, after hours" },
      { f: "b", t: "Hi, Lumina Dental & Skin here — sorry we missed you! Are you looking to book, ask about a treatment, or is this urgent?" },
      { f: "u", t: "Wisdom tooth pain since yesterday, getting worse" },
      { f: "b", t: "That needs a same-day slot. I have tomorrow 9:40 AM at Main Clinic — shall I hold it? You'll get a confirmation right here." },
      { f: "u", t: "Yes please" },
      { f: "b", t: "Booked ✅ Tomorrow 9:40 AM with Dr. Rao. A reminder will arrive an hour before. Feel better soon! 🦷" },
      { f: "e", t: "✅ Booked in 74 seconds — logged to clinic dashboard" },
    ],
    reviews: [
      { n: "Priya M.", t: "Booked on WhatsApp at 9pm, confirmed by morning, seen the same week." },
      { n: "Rahul S.", t: "Root canal done in one sitting — back at work the next day." },
      { n: "Ananya K.", t: "Reminders meant I never missed an aligner review. The clinic runs on an actual system." },
    ],
  },

  "meridian-legal": {
    tiers: T3(["Tier 1 — Authority Foundation", "Tier 2 — Inquiry Engine", "Tier 3 — Practice Growth System"]),
    hello: "New guide: what to ask any law firm before you engage one — free download.",
    locations: ["Fort Street — Mumbai", "BKC Office"],
    dashHref: "/bundles/authority-inquiry-engine#demos",
    bookLabel: "Request a consultation", bookCta: "See available times",
    chatIntro: "Hello — I'm the Meridian intake assistant. I can check whether we handle your matter and book you with the right partner.",
    chatLabel: "Ask the intake assistant",
    chat: [
      { q: "Do you handle my case?", a: "We cover corporate, employment, family and property matters. Tell me roughly what's happened and I'll confirm scope — honestly, either way." },
      { q: "What does a consultation cost?", a: "The initial 30-minute consultation is fixed-fee and credited against your matter if you instruct us. Written fee estimate before any work begins." },
      { q: "How fast can I speak to someone?", a: "Urgent matters are triaged same-day. I'll take details now so the partner reads your situation before the call — your 30 minutes goes on advice, not paperwork." },
    ],
    wa: [
      { f: "e", t: "📩 Enquiry from the employment-law page — Sun 8:40 PM" },
      { f: "b", t: "Hello, Meridian Legal Partners. I can take the key details now so a partner can review before calling you. Is this an employment matter?" },
      { f: "u", t: "Yes — I've been asked to resign and sign a release by Friday" },
      { f: "b", t: "Understood — that deadline matters. Please don't sign anything yet. I can book a priority consultation tomorrow 10 AM or 4 PM. Which works?" },
      { f: "u", t: "10 AM" },
      { f: "b", t: "Confirmed ✅ Tomorrow 10 AM with our employment partner. I've noted the Friday deadline so the advice is deadline-first." },
      { f: "e", t: "✅ Priority intake, partner briefed — 81 seconds" },
    ],
    reviews: [
      { n: "V. Sharma, Director", t: "The intake meant our first call started at the real issue, not the paperwork." },
      { n: "J. Thomas", t: "They told me upfront which route was cheaper without them. I hired them anyway." },
      { n: "R. Iyer, Founder", t: "Fixed-fee phases and a partner who answers email. Rare combination." },
    ],
  },

  "summit-ridge-roofing": {
    tiers: T3(["Tier 1 — Local Foundation", "Tier 2 — Lead Engine", "Tier 3 — Market Leader System"]),
    hello: "Storm season inspection — free 20-point roof check, booked in 60 seconds.",
    locations: ["Denver Metro", "Boulder County"],
    dashHref: "/bundles/local-domination-pack#demos",
    bookLabel: "Get a free estimate", bookCta: "Pick an inspection slot",
    chatIntro: "Hi! Summit Ridge assistant here. Repair, replacement, or storm damage — I can get an inspector booked right now.",
    chatLabel: "Ask about your roof",
    chat: [
      { q: "How fast can someone come out?", a: "Storm damage gets same-day or next-morning slots. Standard estimates within 48 hours — and the written estimate follows within 24 hours of the visit." },
      { q: "Do you handle insurance claims?", a: "Yes — we document everything the adjuster needs: photos, measurements, and a line-item scope. Most storm claims we support go through without a second visit." },
      { q: "What does a new roof cost?", a: "Depends on size, pitch and material — the honest answer needs a 20-minute inspection, which is free. The estimate is written, itemised, and holds for 30 days." },
    ],
    wa: [
      { f: "e", t: "📞 Missed call — Tue 6:42 PM, after hours" },
      { f: "b", t: "Hi, Summit Ridge Roofing — sorry we missed your call! Repair, full replacement, or storm damage?" },
      { f: "u", t: "Hail last night. Dented shingles and a wet patch on the ceiling" },
      { f: "b", t: "That wet patch means we should move fast. Inspector tomorrow — morning (8–11) or afternoon (1–4)?" },
      { f: "u", t: "Morning" },
      { f: "b", t: "Booked ✅ 8–11 AM tomorrow. We'll bring the insurance documentation kit too. 🏠" },
      { f: "e", t: "✅ Qualified & booked in 94 seconds — owner notified" },
    ],
    reviews: [
      { n: "Dana W.", t: "Texted the number on the site, reply in under a minute, estimate next morning." },
      { n: "Mike R.", t: "They documented everything for our insurance claim. Zero back-and-forth." },
      { n: "Carla T.", t: "Crew showed at 7am like they said, cleaned up like they were never there." },
    ],
  },

  "northgate-it": {
    tiers: T3(["Tier 1 — Credibility Platform", "Tier 2 — Demand Engine", "Tier 3 — Pipeline System"]),
    hello: "New: the 4 root causes behind 61% of IT tickets — free teardown for ops leaders.",
    locations: ["Columbus HQ", "Cleveland office"],
    dashHref: "/bundles/b2b-pipeline-bundle#demos",
    bookLabel: "Book a discovery call", bookCta: "See open slots",
    chatIntro: "Hi — Northgate assistant. I can answer scoping questions or get you a discovery call with an engineer, not a salesperson.",
    chatLabel: "Ask about managed IT",
    chat: [
      { q: "How is onboarding handled?", a: "A two-week root-cause audit first — we find what's actually generating tickets before touching anything. Then a sequenced fix plan, noisiest first." },
      { q: "What size companies do you support?", a: "Sweet spot is 40–250 seats, multi-site. Below that we'll say so honestly and point you somewhere better suited." },
      { q: "Book a discovery call", a: "Sure — 30 minutes with an engineer who's seen your stack before. You'll leave with two or three concrete findings even if we never work together." },
    ],
    wa: [
      { f: "e", t: "📥 Gated download: the IT ticket root-cause teardown — Thu 7:20 AM" },
      { f: "b", t: "Morning! You grabbed the ticket teardown — good read before coffee. Quick one: roughly how many seats are you running?" },
      { f: "u", t: "About 140 across 3 depots. Ticket volume is drowning us" },
      { f: "b", t: "That's exactly the profile in the case study on page 4 — 38% ticket drop in a quarter. Want a 30-min call with the engineer who ran it?" },
      { f: "u", t: "Yes, next week works" },
      { f: "b", t: "Done ✅ Tuesday 11 AM with our lead engineer. Calendar invite and a 3-question prep note are on the way." },
      { f: "e", t: "✅ 140-seat ICP match — routed to senior AE, enriched, briefed" },
    ],
    reviews: [
      { n: "Ops Director, logistics", t: "Tickets down 38% in a quarter. They fixed causes, not symptoms." },
      { n: "CFO, distribution", t: "First IT partner that reported in business numbers, not jargon." },
      { n: "IT Manager", t: "Monday file-server outages: zero since migration. That was our whole year's headache." },
    ],
  },

  flowdesk: {
    tiers: T3(["Tier 1 — Launch-Ready Presence", "Tier 2 — Demand & Conversion Engine", "Tier 3 — Full-Funnel Growth System"]),
    hello: "Flowdesk 2.0 is out — outcome boards and a 2-minute import from Jira.",
    locations: ["flowdesk.demo", "app.flowdesk.demo"],
    dashHref: "/bundles/saas-growth-engine#demos",
    bookLabel: "Book a demo", bookCta: "Pick a 20-min slot",
    chatIntro: "Hey! Flowdesk assistant here. Plans, technical questions, or a trial — what are you working out?",
    chatLabel: "Ask about Flowdesk",
    chat: [
      { q: "How is this different from Jira?", a: "Built for teams that plan in outcomes, not tickets. No sprint ceremony, no six-week config project — most teams are live in a day." },
      { q: "What does it cost?", a: "Free up to 5 people, then $9/user/month with everything included. No paywalled reporting tiers. Annual saves two months." },
      { q: "Start a trial", a: "14 days, no card. Or book a 20-minute demo and we'll set it up around your actual workflow — your call." },
    ],
    wa: [
      { f: "e", t: "🔔 Trial signup: 12-person product team — day 3 of 14" },
      { f: "b", t: "Hey! Saw your team imported 240 tasks from Jira — nice. Anything blocking you from inviting the rest of the team?" },
      { f: "u", t: "Honestly — we can't tell if the reporting covers OKR rollups" },
      { f: "b", t: "It does — outcome boards roll up to objectives natively. I just enabled the OKR template on your workspace. Want a 15-min walkthrough tomorrow?" },
      { f: "u", t: "That would help, 10am PT" },
      { f: "b", t: "Booked ✅ 10 AM PT with a product specialist. Meanwhile the template is live on your sidebar." },
      { f: "e", t: "✅ PQL score 84 — routed to sales-assist, expansion flag set" },
    ],
    reviews: [
      { n: "Head of Product, 40-person SaaS", t: "Migrated from Jira on a Tuesday. The team thanked me by Friday." },
      { n: "Engineering lead", t: "First tool where reporting did not need a dedicated admin." },
      { n: "COO", t: "The outcome boards ended our weekly what-are-we-even-building meeting." },
    ],
  },

  "harborview-realty": {
    tiers: T3(["Tier 1 — Market Presence", "Tier 2 — Lead Machine", "Tier 3 — Sales Pipeline System"]),
    hello: "Just listed: 3 new waterfront properties — viewings open this weekend.",
    locations: ["Downtown office", "Harbor East office"],
    dashHref: "/bundles/listing-to-lead-bundle#demos",
    bookLabel: "Schedule a viewing", bookCta: "See viewing times",
    chatIntro: "Hi! Harborview assistant. I can check availability, book viewings, or send comparable sales for any listing.",
    chatLabel: "Ask about a listing",
    chat: [
      { q: "Is 14 Harbor View Way still available?", a: "It is — one offer fell through last week, so timing is good. I can book you Sunday 11 AM or Monday 5:30 PM with Priya, who handles that street." },
      { q: "What are prices doing in this area?", a: "Median sale price is up 6% year-on-year, with waterfront moving fastest — average 11 days on market. I can send the last three comparable sales." },
      { q: "Do you handle sales too?", a: "Yes — and if you're selling and buying, we coordinate both so you're never carrying two mortgages. Free valuation to start." },
    ],
    wa: [
      { f: "e", t: "🏠 Enquiry on 14 Harbor View Way — Sat 9:12 PM" },
      { f: "b", t: "Hi! Thanks for enquiring about 14 Harbor View Way. Are you looking to buy, or just starting to explore?" },
      { f: "u", t: "Buying in the next couple of months. Still available?" },
      { f: "b", t: "It is. Quick one so I match you with the right agent — are you pre-approved for financing?" },
      { f: "u", t: "Pre-approved up to $720k" },
      { f: "b", t: "Perfect fit. Sunday 11 AM viewing with Priya? I'll send the floor plan and last three comparable sales so you arrive informed. 🔑" },
      { f: "e", t: "✅ Pre-approved buyer, viewing booked — assigned to Priya, 88s" },
    ],
    reviews: [
      { n: "The Kapoors", t: "Enquired at 9pm Saturday, viewing booked by 9:03. Bought the house." },
      { n: "D. Okafor", t: "They sent comparable sales before we even asked. No pressure, all signal." },
      { n: "M. Reyes", t: "Sold and bought through them — never carried two mortgages for a day." },
    ],
  },

  "ascent-academy": {
    tiers: T3(["Tier 1 — Institution Presence", "Tier 2 — Enrollment Engine", "Tier 3 — Admissions Growth System"]),
    hello: "Admissions open — scholarship entrance test this Sunday, seats capped at 30 per batch.",
    locations: ["Main campus — Nehru Nagar", "West branch"],
    dashHref: "/bundles/enrollment-growth-bundle#demos",
    bookLabel: "Book a counseling session", bookCta: "Pick a time",
    chatIntro: "Namaste! Ascent admissions assistant here. Programs, fees, batch timings — or I can start your application.",
    chatLabel: "Ask the admission counselor",
    chat: [
      { q: "Which program suits me?", a: "Tell me your class and target exam — engineering, medical or foundation — and I'll suggest the right batch. Honestly, including if another institute fits better." },
      { q: "What are the fees?", a: "Varies by program; the two-year integrated program can be paid in three instalments. Most students who take the entrance test qualify for some scholarship." },
      { q: "When do batches start?", a: "April and June, plus weekend batches year-round. Classes capped at 30 so counselors know every student by name. Shall I hold a seat?" },
    ],
    wa: [
      { f: "e", t: "📥 Enquiry from the JEE program page — Sun 10:05 PM" },
      { f: "b", t: "Namaste! Thanks for your interest in the JEE program. Is this for the student or a parent enquiring?" },
      { f: "u", t: "Parent. My son is in class 11, we're comparing institutes" },
      { f: "b", t: "Good time to compare — ask every institute for full batch results, not just toppers. Ours are published. Want a campus visit + counselor session this week?" },
      { f: "u", t: "Yes, Saturday if possible" },
      { f: "b", t: "Booked ✅ Saturday 11 AM with our senior counselor. I'm sending the full results sheet and fee structure now so you can compare beforehand." },
      { f: "e", t: "✅ Counseling booked, results sheet sent — logged to counselor CRM" },
    ],
    reviews: [
      { n: "Parent of JEE 2025 student", t: "The counselor called back in 10 minutes on a Sunday night. That decided it." },
      { n: "Sneha, class 12", t: "Batch of 28. My doubts actually got answered, by name." },
      { n: "Parent, foundation program", t: "They published full results, not just toppers. Only institute that did." },
    ],
  },

  "verve-botanicals": {
    tiers: [
      { label: "Tier 1 — Store Foundation", short: "T1", widgets: [] },
      { label: "Tier 2 — Revenue Engine", short: "T2", widgets: ["enquiry", "whatsapp", "reviews", "dashboard"] },
    ],
    hello: "The Night Repair restock is live — first 100 orders get the travel size free.",
    locations: [],
    dashHref: "/bundles/ecommerce-revenue-stack#demos",
    bookLabel: "Get 10% off your first order", bookCta: "Claim the code",
    chatIntro: "Hi! Verve assistant 🌿 Ingredients, shipping, or your order — how can I help?",
    chatLabel: "Ask about products",
    chat: [
      { q: "Is the face oil ok for oily skin?", a: "Fair worry — most face oils are too heavy. Ours is jojoba-based, closest to your own sebum, so it absorbs instead of sitting on top. Most-repurchased product among oily-skin customers." },
      { q: "What is your returns policy?", a: "30 days, opened or not. If it does not suit your skin, we refund it — no photos, no interrogation." },
      { q: "Where is my order?", a: "In production I would look it up from your number automatically. Orders ship within 24h and tracking arrives on WhatsApp." },
    ],
    wa: [
      { f: "e", t: "🛒 Cart abandoned — ₹2,340, 40 minutes ago" },
      { f: "b", t: "Hi! Verve here 🌿 You left the Night Repair Oil in your bag. Anything I can help with — ingredients, sizing, delivery?" },
      { f: "u", t: "Is the oil ok for oily skin? Bad experiences before…" },
      { f: "b", t: "Fair worry. It is jojoba-based — closest to your skin's own sebum, absorbs instead of sitting on top. And returns are 30 days, opened or not." },
      { f: "u", t: "Ok, that helps" },
      { f: "b", t: "I have applied FIRST10 for 10% off too. Your bag is saved — free shipping over ₹999 included ✅" },
      { f: "e", t: "✅ Cart recovered — ₹2,106 order, 2m 14s after the nudge" },
    ],
    reviews: [
      { n: "Aisha R.", t: "I finished the bottle. I never finish bottles." },
      { n: "Neha T.", t: "Asked about ingredients on WhatsApp at 11pm — got a real answer in seconds." },
      { n: "Kavya S.", t: "Returned one product, no questions. Ordered three more since." },
    ],
  },

  "anika-mehra-coaching": {
    tiers: [{ label: "Calendar-Filling System", short: "All-in", widgets: ["enquiry", "whatsapp", "reviews"] }],
    locations: [],
    dashHref: "/bundles/calendar-filling-system#demos",
    bookLabel: "Book a discovery call", bookCta: "See this week's slots",
    chatIntro: "Hi — Anika's assistant. I can explain how engagements work, check fit, and book a discovery call.",
    chatLabel: "Ask about coaching",
    chat: [
      { q: "How does coaching work?", a: "Six-month engagements: fortnightly 60-minute sessions with async support between. Starts with a diagnostic on where you actually are, not a generic curriculum." },
      { q: "Am I the right fit?", a: "Anika works with founders and senior leaders in high-stakes transitions. Earlier in your career? She will point you somewhere better suited — honestly." },
      { q: "Book a discovery call", a: "30 minutes, free, genuinely diagnostic — you leave with a view of your situation either way. Want this week's slots?" },
    ],
    wa: [
      { f: "e", t: "📥 Lead magnet downloaded: the first 90 days as a first-time exec" },
      { f: "b", t: "Hi! You grabbed the first-90-days guide — is this for a transition you are in right now?" },
      { f: "u", t: "Yes — I step into a VP role next month and honestly it is daunting" },
      { f: "b", t: "That is exactly the transition Anika coaches. The discovery call is free and diagnostic — you leave with a plan sketch either way. Thursday 5 PM?" },
      { f: "u", t: "Thursday works" },
      { f: "b", t: "Booked ✅ Thursday 5 PM. Two short prep questions are on the way so the call starts at depth, not introductions." },
      { f: "e", t: "✅ Discovery call booked — nurture sequence paused automatically" },
    ],
    reviews: [
      { n: "VP Engineering, fintech", t: "The discovery call alone reframed my first-90-days plan." },
      { n: "Founder, seed stage", t: "Fortnightly sessions became the calmest hour of my week." },
      { n: "New CPO", t: "She declined to coach me at first and told me why. I came back a year later." },
    ],
  },

  loopwise: {
    tiers: [
      { label: "Launch Kit output", short: "Launch", widgets: [] },
      { label: "Care Plan active", short: "Care", widgets: ["enquiry", "whatsapp", "dashboard"] },
    ],
    hello: "Loopwise beta is live — feedback clustering now supports 12 languages.",
    locations: [],
    dashHref: "/bundles/launch-kit#demos",
    bookLabel: "Join the waitlist", bookCta: "Get early access",
    chatIntro: "Hey! Loopwise assistant. Questions about the beta, pricing, or the roadmap — fire away.",
    chatLabel: "Ask about Loopwise",
    chat: [
      { q: "What does Loopwise do?", a: "It collects customer feedback from every channel, clusters it by theme, and ranks it by revenue impact — so the roadmap builds what matters." },
      { q: "When do I get access?", a: "Waitlist invites go out weekly. Early users get founding pricing locked for life." },
      { q: "How is this different from a spreadsheet?", a: "The clustering is automatic and it links feedback to the revenue behind it. Your spreadsheet cannot tell you which complaint costs you $40k a year." },
    ],
    wa: [
      { f: "e", t: "🔔 Waitlist signup #2,141 — from the launch page" },
      { f: "b", t: "Hey! You are on the Loopwise waitlist 🎉 Quick one so we prioritise the right invites: what does your team use for feedback today?" },
      { f: "u", t: "A very cursed spreadsheet" },
      { f: "b", t: "The classic. You are exactly who we built this for — bumped you to next week's invite batch. Watch for the email." },
      { f: "e", t: "✅ Qualified signup — tagged spreadsheet-migrator, invite scheduled" },
    ],
    reviews: [
      { n: "PM, beta user", t: "It found a churn theme in week one that we had argued about for a quarter." },
      { n: "Founder", t: "Investor asked how we prioritise. I just shared the Loopwise board." },
      { n: "Head of Support", t: "Tickets finally count for something beyond closing them." },
    ],
  },
};
