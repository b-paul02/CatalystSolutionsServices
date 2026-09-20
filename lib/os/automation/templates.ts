// Workflow template gallery. Ideas adapted from enescingoz/awesome-n8n-templates
// (© 2024-2026 Enes Cingoz, CC BY 4.0) — rebuilt from GrowthOS blocks, not
// imported. Mapping and sources: docs/os/automation-inventory.md (T01–T31).
// Every template must pass validateDefinition (tests/os/automation.test.ts).
import type { Definition, Edge, Node } from "./definition";

type S = [type: string, config?: Record<string, string>];
export type Template = { key: string; category: string; name: string; description: string; definition: Definition };

/** Linear main path; an optional condition at `at` continues on Yes and runs `no` on No. */
function wf(main: S[], branch?: { at: number; no: S[] }): Definition {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  main.forEach(([type, config], i) => nodes.push({ id: `n${i + 1}`, type, config: config ?? {}, position: { x: 40 + i * 300, y: 80 } }));
  main.slice(1).forEach((_s, i) => edges.push({ from: `n${i + 1}`, to: `n${i + 2}`, ...(main[i][0] === "logic.condition" ? { branch: "true" as const } : {}) })); // the main path continues on Yes
  branch?.no.forEach(([type, config], j) => {
    nodes.push({ id: `b${j + 1}`, type, config: config ?? {}, position: { x: 40 + (branch.at + 1 + j) * 300, y: 300 } });
    edges.push(j === 0 ? { from: `n${branch.at + 1}`, to: "b1", branch: "false" } : { from: `b${j}`, to: `b${j + 1}` });
  });
  return { nodes, edges };
}

const LEAD = "{{trigger.lead.firstName}} {{trigger.lead.lastName}}";
const T = (key: string, category: string, name: string, description: string, definition: Definition): Template => ({ key, category, name, description, definition });

export const TEMPLATES: Template[] = [
  // ── leads & sales ──
  T("T01", "Leads & sales", "Payment received → client onboarding", "When a deposit lands, check it is paid, assign onboarding and tell the deal owner. If it is still open, wait and nudge.",
    wf([["trigger.webhook", { label: "Stripe / Razorpay payment" }], ["logic.condition", { left: "{{trigger.body.status}}", operator: "equals", right: "paid" }], ["os.create_work_item", { title: "Onboard {{trigger.body.customer_name}}", details: "Deposit {{trigger.body.amount}} received. Kick-off call, access checklist, baseline." }], ["notify.email", { to: "owner@yourcompany.com", subject: "Deposit received — {{trigger.body.customer_name}}", body: "Payment of {{trigger.body.amount}} is in. Onboarding work item created." }]],
      { at: 1, no: [["logic.wait", { amount: "2", unit: "days" }], ["notify.email", { to: "owner@yourcompany.com", subject: "Payment still open — {{trigger.body.customer_name}}", body: "No payment after 2 days. Follow up." }]] })),
  T("T02", "Leads & sales", "Speed-to-lead", "Every new lead gets an owner, a call-back task due within the hour, and a team alert.",
    wf([["trigger.lead_created"], ["crm.assign_owner", { mode: "round_robin" }], ["crm.create_task", { title: `Call ${LEAD} — new lead from {{trigger.source}}`, dueInHours: "1" }], ["notify.slack", { text: `New lead: ${LEAD} ({{trigger.source}}) — call within the hour.` }]])),
  T("T03", "Leads & sales", "Lead SLA watch", "If a new lead is still untouched after a day, escalate it.",
    wf([["trigger.lead_created"], ["logic.wait", { amount: "1", unit: "days" }], ["crm.create_task", { title: `ESCALATION: ${LEAD} has waited 24h for first contact`, dueInHours: "2" }], ["notify.email", { to: "owner@yourcompany.com", subject: "Lead waiting 24h", body: `${LEAD} from {{trigger.source}} has had no first contact.` }]])),
  T("T04", "Leads & sales", "Form message → classify → route", "Read what the person wrote, classify it, and create the right follow-up.",
    wf([["trigger.form_submitted"], ["ai.classify", { text: "{{trigger.message}}", categories: "sales, support, partnership, spam" }], ["logic.condition", { left: "{{steps.n2.category}}", operator: "equals", right: "sales" }], ["crm.create_task", { title: `Sales enquiry — call ${LEAD}`, dueInHours: "2" }]],
      { at: 2, no: [["crm.add_note", { text: "Form enquiry classified as: {{steps.n2.category}}" }]] })),
  T("T05", "Leads & sales", "Inbound webhook router", "Accept data from Typeform, Tally, Zapier or any tool, classify it and route it.",
    wf([["trigger.webhook", { label: "Typeform / Tally / Zapier" }], ["ai.classify", { text: "{{trigger.body}}", categories: "lead, support, feedback, other" }], ["logic.condition", { left: "{{steps.n2.category}}", operator: "equals", right: "lead" }], ["crm.create_lead", { firstName: "{{trigger.body.name}}", email: "{{trigger.body.email}}", phone: "{{trigger.body.phone}}", source: "webhook", leadType: "b2b" }], ["crm.create_task", { title: "Follow up webhook lead {{trigger.body.name}}", dueInHours: "4" }]],
      { at: 2, no: [["os.create_work_item", { title: "Inbound {{steps.n2.category}} message", details: "{{trigger.body}}" }]] })),
  T("T06", "Leads & sales", "WhatsApp enquiry → lead + reply", "Someone messages your WhatsApp number: create the lead and send one acknowledgement on the same channel.",
    wf([["trigger.webhook", { label: "WhatsApp provider (Twilio / Meta)" }], ["crm.create_lead", { firstName: "{{trigger.body.ProfileName}}", phone: "{{trigger.body.From}}", source: "whatsapp-inbound", leadType: "b2c", channel: "whatsapp" }], ["message.send", { channel: "whatsapp", body: "Thanks for reaching out — we've got your message and will reply shortly." }], ["crm.create_task", { title: "Reply to WhatsApp enquiry from {{trigger.body.ProfileName}}", dueInHours: "1" }]])),
  T("T07", "Leads & sales", "Call logged → follow-up", "Your phone system posts a call record: note it on the lead and schedule the next step.",
    wf([["trigger.webhook", { label: "Phone / voice system" }], ["crm.create_lead", { phone: "{{trigger.body.from}}", firstName: "{{trigger.body.caller_name}}", source: "phone-call", leadType: "b2b" }], ["crm.add_note", { text: "Call ({{trigger.body.duration}}s): {{trigger.body.summary}}" }], ["crm.create_task", { title: "Follow up call with {{trigger.body.caller_name}}", dueInHours: "24" }]])),
  T("T08", "Leads & sales", "Appointment booked → reminder", "Calendly / Cal.com posts a booking: record it, then remind the day before.",
    wf([["trigger.webhook", { label: "Calendly / Cal.com booking" }], ["crm.create_lead", { firstName: "{{trigger.body.payload.name}}", email: "{{trigger.body.payload.email}}", source: "booking", leadType: "b2b" }], ["crm.create_task", { title: "Prepare for meeting with {{trigger.body.payload.name}}", dueInHours: "12" }], ["logic.wait", { amount: "1", unit: "days" }], ["message.send", { channel: "email", body: "Looking forward to speaking tomorrow. Reply here if you need to move the time." }]])),
  T("T09", "Leads & sales", "Escalating payment reminders", "Your billing tool posts an unpaid invoice: remind politely, wait, then escalate to a person.",
    wf([["trigger.webhook", { label: "Invoice overdue (billing tool)" }], ["crm.create_lead", { firstName: "{{trigger.body.customer_name}}", email: "{{trigger.body.email}}", source: "billing", leadType: "b2b" }], ["message.send", { channel: "email", body: "A quick reminder that invoice {{trigger.body.invoice_number}} for {{trigger.body.amount}} is due. Thank you!" }], ["logic.wait", { amount: "5", unit: "days" }], ["crm.create_task", { title: "Call about overdue invoice {{trigger.body.invoice_number}}", dueInHours: "8" }]])),
  T("T10", "Operations", "Approval reminder", "When work is sent for client review, nudge the team if it is still waiting after two days.",
    wf([["trigger.work_item_state", { toState: "client_review" }], ["logic.wait", { amount: "2", unit: "days" }], ["notify.email", { to: "owner@yourcompany.com", subject: "Approval waiting 2 days — {{trigger.title}}", body: "\"{{trigger.title}}\" has been waiting for a decision for 2 days. Open Approvals to decide." }]])),
  T("T11", "Operations", "Daily owner brief", "Each morning, a short AI-written brief of what matters, to the owner's inbox.",
    wf([["trigger.schedule", { frequency: "daily" }], ["ai.generate", { prompt: "Write a 5-bullet morning brief for a business owner for {{trigger.date}}: priorities for growth work, what to approve, one risk to watch. No invented numbers." }], ["notify.email", { to: "owner@yourcompany.com", subject: "Your brief — {{trigger.date}}", body: "{{steps.n2.text}}" }]])),
  T("T12", "Operations", "Meeting transcript → work items", "Your meeting tool posts a transcript: the AI extracts next steps into a work item for review.",
    wf([["trigger.webhook", { label: "Fireflies / Zoom / Meet transcript" }], ["ai.generate", { prompt: "From this meeting transcript list the concrete next steps as bullets with an owner where stated. Do not invent any.\n\n{{trigger.body.transcript}}" }], ["os.create_work_item", { title: "Next steps — {{trigger.body.title}}", details: "{{steps.n2.text}}" }]])),

  // ── content & social ──
  T("T13", "Content & social", "Weekly social drafts", "Every Monday, draft this week's LinkedIn post from your brand profile. It lands as a draft for QA and approval.",
    wf([["trigger.schedule", { frequency: "weekly" }], ["ai.generate", { prompt: "Write one LinkedIn post (120-180 words) for this business for the week of {{trigger.date}}. Useful, specific, one clear call to action. No hashtags spam, no guarantees." }], ["os.create_content_draft", { title: "LinkedIn post — week of {{trigger.date}}", channel: "linkedin", body: "{{steps.n2.text}}" }]])),
  T("T14", "Content & social", "Article → X thread + LinkedIn post", "Paste an article address into the webhook: get a thread and a LinkedIn post as drafts.",
    wf([["trigger.webhook", { label: "Article link" }], ["http.request", { method: "GET", url: "{{trigger.body.url}}" }], ["ai.generate", { prompt: "Turn this article into a LinkedIn post (150 words). Article:\n{{steps.n2.body}}" }], ["os.create_content_draft", { title: "LinkedIn — {{trigger.body.url}}", channel: "linkedin", body: "{{steps.n3.text}}" }], ["ai.generate", { prompt: "Turn the same article into a 5-post X thread, each under 270 characters. Article:\n{{steps.n2.body}}" }], ["os.create_content_draft", { title: "X thread — {{trigger.body.url}}", channel: "x", body: "{{steps.n5.text}}" }]])),
  T("T15", "Content & social", "One idea → four platforms", "Send one idea; get LinkedIn, X, Facebook and Instagram drafts, each written for its platform.",
    wf([["trigger.webhook", { label: "Content idea" }], ["ai.generate", { prompt: "Write a LinkedIn post about: {{trigger.body.idea}}" }], ["os.create_content_draft", { title: "LinkedIn — {{trigger.body.idea}}", channel: "linkedin", body: "{{steps.n2.text}}" }], ["ai.generate", { prompt: "Write one X post under 270 characters about: {{trigger.body.idea}}" }], ["os.create_content_draft", { title: "X — {{trigger.body.idea}}", channel: "x", body: "{{steps.n4.text}}" }], ["ai.generate", { prompt: "Write an Instagram caption with a hook first line about: {{trigger.body.idea}}" }], ["os.create_content_draft", { title: "Instagram — {{trigger.body.idea}}", channel: "instagram", body: "{{steps.n6.text}}" }]])),
  T("T16", "Content & social", "New YouTube video → post drafts", "Checks your channel daily; a new video becomes an X and a LinkedIn draft.",
    wf([["trigger.schedule", { frequency: "daily" }], ["youtube.latest", { channelId: "UC_your_channel_id" }], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.generate", { prompt: "Write a LinkedIn post announcing this video. Title: {{steps.n2.item.title}}. Link: {{steps.n2.item.link}}" }], ["os.create_content_draft", { title: "New video — {{steps.n2.item.title}}", channel: "linkedin", body: "{{steps.n4.text}}" }]])),
  T("T17", "Content & social", "YouTube video → content brief", "Send a video's transcript; get a summary and a blog brief as a work item.",
    wf([["trigger.webhook", { label: "Video transcript" }], ["ai.generate", { prompt: "Summarise this video in 6 bullets, then propose a blog outline based on it.\n\n{{trigger.body.transcript}}" }], ["os.create_work_item", { title: "Content brief from video: {{trigger.body.title}}", details: "{{steps.n2.text}}" }]])),
  T("T18", "Content & social", "Approved post → Notion log", "When a piece of work is delivered, log it in your Notion content database.",
    wf([["trigger.work_item_state", { toState: "delivered" }], ["notion.create_page", { databaseId: "your-database-id", title: "{{trigger.title}}", content: "Delivered via CatalystGrowthOS." }]])),
  T("T19", "Content & social", "Weekly blog draft", "Every Monday, draft a blog post on your next topic. Lands as a draft with expertise left for a human.",
    wf([["trigger.schedule", { frequency: "weekly" }], ["ai.generate", { prompt: "Write a 600-word blog post useful to this business's customers. Mark any claim that needs a human expert with [CHECK]. Week of {{trigger.date}}." }], ["os.create_content_draft", { title: "Blog draft — week of {{trigger.date}}", channel: "blog", body: "{{steps.n2.text}}" }]])),

  // ── WordPress ──
  T("T20", "WordPress", "Brand-voice post → WordPress draft", "Send a topic; the AI writes in your brand voice and saves a WordPress DRAFT for a person to publish.",
    wf([["trigger.webhook", { label: "Blog topic" }], ["ai.generate", { prompt: "Write an 800-word blog post in our brand voice about: {{trigger.body.topic}}. Use simple HTML (h2, p, ul)." }], ["wordpress.create_draft", { title: "{{trigger.body.topic}}", content: "{{steps.n2.text}}" }]])),
  T("T21", "WordPress", "Auto-categorise new posts", "Daily: a new WordPress post gets the best-fitting category.",
    wf([["trigger.schedule", { frequency: "daily" }], ["wordpress.latest_post"], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.classify", { text: "{{steps.n2.item.title}} — {{steps.n2.item.summary}}", categories: "News, Guides, Case studies, Product" }], ["wordpress.set_terms", { postId: "{{steps.n2.item.id}}", kind: "categories", names: "{{steps.n4.category}}" }]])),
  T("T22", "WordPress", "Auto-tag new posts", "Daily: a new WordPress post gets 3–5 relevant tags.",
    wf([["trigger.schedule", { frequency: "daily" }], ["wordpress.latest_post"], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.generate", { prompt: "Give 4 short tags for this post as a comma separated list, nothing else. {{steps.n2.item.title}} — {{steps.n2.item.summary}}" }], ["wordpress.set_terms", { postId: "{{steps.n2.item.id}}", kind: "tags", names: "{{steps.n4.text}}" }]])),
  T("T23", "WordPress", "AI summary for new posts", "Daily: a new post gets a short key-takeaways summary, delivered to the editor to paste in.",
    wf([["trigger.schedule", { frequency: "daily" }], ["wordpress.latest_post"], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.generate", { prompt: "Write a 3-bullet 'Key takeaways' block for this post: {{steps.n2.item.title}} — {{steps.n2.item.summary}}" }], ["os.create_work_item", { title: "Add summary block to: {{steps.n2.item.title}}", details: "{{steps.n4.text}}\n\n{{steps.n2.item.link}}" }]])),

  // ── search ──
  T("T24", "Search", "FAQ section for a page", "Send a page address; get a draft FAQ section written from that page's own content.",
    wf([["trigger.webhook", { label: "Page address" }], ["http.request", { method: "GET", url: "{{trigger.body.url}}" }], ["ai.generate", { prompt: "Using ONLY the content below, write 5 FAQ questions and answers a customer would ask. Do not add facts that are not in the text.\n\n{{steps.n2.body}}" }], ["os.create_work_item", { title: "FAQ section for {{trigger.body.url}}", details: "{{steps.n3.text}}" }]])),
  T("T25", "Search", "SEO seed keywords → brief", "Send a topic; get seed keywords and a content brief for the SEO specialist to validate.",
    wf([["trigger.webhook", { label: "Topic" }], ["ai.generate", { prompt: "List 15 seed keywords a customer would search for around: {{trigger.body.topic}}. Group by intent (learn / compare / buy). Then outline one article for the best 'learn' keyword. These are hypotheses — include no search volumes." }], ["os.create_work_item", { title: "Keyword ideas + brief: {{trigger.body.topic}}", details: "{{steps.n2.text}}" }]])),
  T("T26", "Search", "Weekly analytics note", "Every Monday, a reminder work item to review last week's search and traffic numbers against the baseline.",
    wf([["trigger.schedule", { frequency: "weekly" }], ["os.create_work_item", { title: "Weekly analytics review — {{trigger.date}}", details: "Compare Search Studio clicks/impressions with the baseline. Note what changed and why. Mark anything estimated." }]])),

  // ── monitoring ──
  T("T27", "Monitoring", "Brand mention monitor (Reddit)", "Daily: new Reddit posts mentioning your brand, summarised to Slack.",
    wf([["trigger.schedule", { frequency: "daily" }], ["feed.fetch", { url: "https://www.reddit.com/search.rss?q=%22your+brand%22&sort=new" }], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.generate", { prompt: "Summarise these brand mentions in 4 bullets and flag anything that needs a reply:\n{{steps.n2.digest}}" }], ["notify.slack", { text: "Brand mentions today ({{steps.n2.count}}):\n{{steps.n4.text}}" }]])),
  T("T28", "Monitoring", "Industry news → Slack digest", "Daily: new items from an industry feed, summarised for the team.",
    wf([["trigger.schedule", { frequency: "daily" }], ["feed.fetch", { url: "https://example.com/feed.xml" }], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["ai.generate", { prompt: "Summarise for a busy owner in 5 bullets, with why each matters:\n{{steps.n2.digest}}" }], ["notify.slack", { text: "Industry news:\n{{steps.n4.text}}" }]])),
  T("T29", "Monitoring", "Competitor hiring watch", "Daily: watch a competitor's careers feed — new roles hint at where they are investing.",
    wf([["trigger.schedule", { frequency: "daily" }], ["feed.fetch", { url: "https://competitor.example.com/careers/feed" }], ["logic.condition", { left: "{{steps.n2.isNew}}", operator: "equals", right: "true" }], ["notify.slack", { text: "Competitor posted {{steps.n2.count}} new role(s):\n{{steps.n2.digest}}" }]])),

  // ── feedback ──
  T("T30", "Feedback", "Feedback → sentiment → alert", "Feedback arrives from a form tool: classify it, alert on negatives, log the rest.",
    wf([["trigger.webhook", { label: "Feedback form" }], ["ai.classify", { text: "{{trigger.body.feedback}}", categories: "positive, neutral, negative" }], ["logic.condition", { left: "{{steps.n2.category}}", operator: "equals", right: "negative" }], ["os.create_work_item", { title: "Negative feedback — respond within 24h", details: "{{trigger.body.feedback}}" }], ["notify.slack", { text: "Negative feedback received — work item created." }]],
      { at: 2, no: [["airtable.create_record", { baseId: "appXXXXXXXX", table: "Feedback", fields: "{\"Feedback\":\"{{trigger.body.feedback}}\",\"Sentiment\":\"{{steps.n2.category}}\"}" }]] })),
  T("T31", "Feedback", "Positive feedback → testimonial request", "Positive feedback becomes a task to ask for permission to publish it. Nothing is published without consent.",
    wf([["trigger.webhook", { label: "Feedback form" }], ["ai.classify", { text: "{{trigger.body.feedback}}", categories: "positive, neutral, negative" }], ["logic.condition", { left: "{{steps.n2.category}}", operator: "equals", right: "positive" }], ["os.create_work_item", { title: "Ask {{trigger.body.name}} for permission to use their feedback as a testimonial", details: "\"{{trigger.body.feedback}}\"\n\nOnly publish with written consent — real proof only." }]])),
];

export const templateByKey: Record<string, Template> = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));
