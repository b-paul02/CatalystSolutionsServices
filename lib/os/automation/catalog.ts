// Block catalogue: the static description of every trigger, condition, wait and
// action. Pure data — imported by the builder (client), the simulator and the
// engine. The executable half of each block is in blocks.ts, keyed by `type`.
// Adding an integration = one entry here + one run() there; the engine and the
// builder never change. (A ported Node-RED / Activepieces node fits this shape.)
import { OPERATORS, type BlockMeta, type Field } from "./definition";

const t = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, ...extra });
const CHANNELS = [{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }];
const TOKENS = "Use {{trigger.…}} and {{steps.<step id>.…}} to insert data.";

const LIST: BlockMeta[] = [
  // ── triggers ──
  { type: "trigger.lead_created", kind: "trigger", group: "Triggers", label: "Lead created", icon: "person_add", fields: [], describe: () => "When a new lead arrives" },
  { type: "trigger.lead_stage_changed", kind: "trigger", group: "Triggers", label: "Lead stage changed", icon: "swap_horiz", fields: [t("toStage", "Only when moved to (optional)", { placeholder: "converted" })], describe: (c) => (c.toStage ? `When a lead moves to "${c.toStage}"` : "When a lead changes stage") },
  { type: "trigger.form_submitted", kind: "trigger", group: "Triggers", label: "Form submitted", icon: "assignment_turned_in", fields: [], describe: () => "When a lead-capture form is submitted" },
  { type: "trigger.work_item_state", kind: "trigger", group: "Triggers", label: "Work item moved", icon: "checklist", fields: [t("toState", "Only when moved to (optional)", { placeholder: "delivered" })], describe: (c) => (c.toState ? `When work moves to "${c.toState}"` : "When a work item changes state") },
  { type: "trigger.approval_decided", kind: "trigger", group: "Triggers", label: "Approval decided", icon: "approval", fields: [], describe: () => "When an approval is approved or rejected" },
  { type: "trigger.webhook", kind: "trigger", group: "Triggers", label: "Inbound webhook", icon: "link", fields: [t("label", "What sends this? (optional)", { placeholder: "Stripe payment, Calendly booking, Typeform…" })], describe: (c) => `When ${c.label || "an outside tool"} calls this workflow's web address` },
  { type: "trigger.schedule", kind: "trigger", group: "Triggers", label: "Schedule", icon: "schedule", fields: [t("frequency", "How often", { type: "select", required: true, options: [{ value: "daily", label: "Every day" }, { value: "weekly", label: "Every Monday" }] })], describe: (c) => (c.frequency === "weekly" ? "Every Monday" : "Every day") },
  { type: "trigger.manual", kind: "trigger", group: "Triggers", label: "Run manually", icon: "play_arrow", fields: [], describe: () => "When someone clicks Run now" },

  // ── logic ──
  { type: "logic.condition", kind: "condition", group: "Logic", label: "Condition", icon: "filter_alt", fields: [t("left", "Value", { required: true, placeholder: "{{trigger.lead.city}}" }), t("operator", "Is", { type: "select", required: true, options: OPERATORS.map((o) => ({ value: o, label: o.replace(/_/g, " ") })) }), t("right", "Compared with", { placeholder: "Pune" })], describe: (c) => `${c.left} ${String(c.operator ?? "").replace(/_/g, " ")} ${c.right ?? ""}`.trim() },
  { type: "logic.wait", kind: "wait", group: "Logic", label: "Wait", icon: "hourglass_empty", fields: [t("amount", "Amount", { type: "number", required: true }), t("unit", "Unit", { type: "select", required: true, options: [{ value: "minutes", label: "minutes" }, { value: "hours", label: "hours" }, { value: "days", label: "days" }] })], describe: (c) => `Wait ${c.amount} ${c.unit}` },

  // ── CRM ──
  { type: "crm.create_lead", kind: "action", group: "CRM", label: "Create lead", icon: "person_add", fields: [t("firstName", "First name"), t("email", "Email"), t("phone", "Phone"), t("source", "Source label", { placeholder: "whatsapp-inbound" }), t("leadType", "Lead type", { type: "select", required: true, options: [{ value: "b2b", label: "Business (B2B)" }, { value: "b2c", label: "Consumer (B2C) — they contacted us first" }] }), t("channel", "Channel they used (B2C consent)", { type: "select", options: CHANNELS })], describe: (c) => `Create a ${c.leadType ?? ""} lead from ${c.source || "this event"}` },
  { type: "crm.create_task", kind: "action", group: "CRM", label: "Create task", icon: "task_alt", fields: [t("title", "Task", { required: true, placeholder: "Call {{trigger.lead.firstName}} back" }), t("dueInHours", "Due in (hours)", { type: "number" }), t("assigneeEmail", "Assign to (member email, optional)", { help: "Defaults to the lead's owner, then to whoever activated the workflow." })], describe: (c) => `Task: ${c.title}` },
  { type: "crm.assign_owner", kind: "action", group: "CRM", label: "Assign owner", icon: "assignment_ind", fields: [t("mode", "How", { type: "select", required: true, options: [{ value: "round_robin", label: "Round-robin across the sales team" }, { value: "specific", label: "A specific person" }] }), t("email", "Member email (if specific)")], describe: (c) => (c.mode === "specific" ? `Assign to ${c.email}` : "Assign round-robin") },
  { type: "crm.update_stage", kind: "action", group: "CRM", label: "Move lead to stage", icon: "view_kanban", fields: [t("stage", "Stage", { required: true, placeholder: "contacted" })], describe: (c) => `Move lead to "${c.stage}"` },
  { type: "crm.add_note", kind: "action", group: "CRM", label: "Add note to lead", icon: "sticky_note_2", fields: [t("text", "Note", { type: "textarea", required: true })], describe: () => "Add a note to the lead" },
  { type: "sequence.enroll", kind: "action", group: "CRM", label: "Enrol in sequence", icon: "route", contacts: true, fields: [t("sequenceName", "Sequence name", { required: true })], describe: (c) => `Enrol the lead in "${c.sequenceName}"` },
  { type: "message.send", kind: "action", group: "CRM", label: "Message the lead", icon: "send", contacts: true, fields: [t("channel", "Channel", { type: "select", required: true, options: CHANNELS }), t("body", "Message", { type: "textarea", required: true, help: `Sent only if the lead consented to this channel. ${TOKENS}` })], describe: (c) => `Send ${c.channel} to the lead (consent checked)` },

  // ── GrowthOS work ──
  { type: "os.create_work_item", kind: "action", group: "GrowthOS", label: "Create work item", icon: "add_task", fields: [t("title", "Title", { required: true }), t("details", "Details", { type: "textarea" })], describe: (c) => `Work item: ${c.title}` },
  { type: "os.create_content_draft", kind: "action", group: "GrowthOS", label: "Create content draft", icon: "edit_note", fields: [t("title", "Title", { required: true }), t("channel", "Channel", { type: "select", required: true, options: ["linkedin", "x", "facebook", "instagram", "blog", "email", "whatsapp"].map((v) => ({ value: v, label: v })) }), t("body", "Body", { type: "textarea", required: true, help: "Lands as a draft — it still goes through QA and client approval before anything is published." })], describe: (c) => `Draft ${c.channel} content: ${c.title}` },

  // ── notify the team ──
  { type: "notify.email", kind: "action", group: "Notify team", label: "Email the team", icon: "mail", fields: [t("to", "Member emails (comma separated)", { required: true, help: "Only workspace members — this never emails leads." }), t("subject", "Subject", { required: true }), t("body", "Body", { type: "textarea", required: true })], describe: (c) => `Email ${c.to}: ${c.subject}` },
  { type: "notify.slack", kind: "action", group: "Notify team", label: "Slack message", icon: "tag", external: true, provider: "slack", fields: [t("text", "Message", { type: "textarea", required: true })], describe: () => "Post to Slack" },
  { type: "notify.telegram", kind: "action", group: "Notify team", label: "Telegram message", icon: "near_me", external: true, provider: "telegram", fields: [t("chatId", "Chat ID", { required: true }), t("text", "Message", { type: "textarea", required: true })], describe: () => "Post to Telegram" },
  { type: "notify.discord", kind: "action", group: "Notify team", label: "Discord message", icon: "forum", external: true, provider: "discord", fields: [t("text", "Message", { type: "textarea", required: true })], describe: () => "Post to Discord" },
  { type: "notify.teams", kind: "action", group: "Notify team", label: "Microsoft Teams message", icon: "groups", external: true, provider: "teams", fields: [t("text", "Message", { type: "textarea", required: true })], describe: () => "Post to Microsoft Teams" },

  // ── AI ──
  { type: "ai.generate", kind: "action", group: "AI", label: "AI: write or summarise", icon: "auto_awesome", fields: [t("prompt", "Instruction", { type: "textarea", required: true, help: `Output is {{steps.<id>.text}}. The workspace brand profile is included automatically. ${TOKENS}` })], describe: () => "Ask the AI to write or summarise" },
  { type: "ai.classify", kind: "action", group: "AI", label: "AI: classify", icon: "category", fields: [t("text", "Text to classify", { type: "textarea", required: true }), t("categories", "Categories (comma separated)", { required: true, placeholder: "sales, support, billing, spam" })], describe: (c) => `Classify into: ${c.categories}` },

  // ── data in ──
  { type: "feed.fetch", kind: "action", group: "Data", label: "Read RSS / news feed", icon: "rss_feed", external: true, fields: [t("url", "Feed address", { required: true, placeholder: "https://example.com/feed.xml" })], describe: (c) => `Check ${c.url} for new items` },
  { type: "youtube.latest", kind: "action", group: "Data", label: "Latest YouTube video", icon: "smart_display", external: true, fields: [t("channelId", "Channel ID", { required: true, placeholder: "UC…" })], describe: () => "Check a YouTube channel for a new video" },
  { type: "http.request", kind: "action", group: "Data", label: "HTTP request", icon: "http", external: true, fields: [t("method", "Method", { type: "select", required: true, options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => ({ value: v, label: v })) }), t("url", "Web address (https)", { required: true }), t("headers", "Headers (JSON, optional)", { type: "textarea" }), t("body", "Body (optional)", { type: "textarea" })], describe: (c) => `${c.method} ${c.url}` },

  // ── apps ──
  { type: "notion.create_page", kind: "action", group: "Apps", label: "Notion: create page", icon: "description", external: true, provider: "notion", fields: [t("databaseId", "Database ID", { required: true }), t("title", "Title", { required: true }), t("content", "Content", { type: "textarea" })], describe: (c) => `Notion page: ${c.title}` },
  { type: "airtable.create_record", kind: "action", group: "Apps", label: "Airtable: create record", icon: "table_rows", external: true, provider: "airtable", fields: [t("baseId", "Base ID", { required: true }), t("table", "Table name", { required: true }), t("fields", "Fields (JSON)", { type: "textarea", required: true, placeholder: '{"Name":"{{trigger.lead.firstName}}"}' })], describe: (c) => `Airtable record in ${c.table}` },
  { type: "hubspot.upsert_contact", kind: "action", group: "Apps", label: "HubSpot: create or update contact", icon: "hub", external: true, provider: "hubspot", fields: [t("email", "Email", { required: true }), t("firstName", "First name"), t("lastName", "Last name")], describe: () => "Sync the contact to HubSpot" },
  { type: "wordpress.latest_post", kind: "action", group: "Apps", label: "WordPress: latest post", icon: "article", external: true, provider: "wordpress", fields: [], describe: () => "Check WordPress for a new post" },
  { type: "wordpress.create_draft", kind: "action", group: "Apps", label: "WordPress: create draft post", icon: "post_add", external: true, provider: "wordpress", fields: [t("title", "Title", { required: true }), t("content", "Content (HTML or text)", { type: "textarea", required: true })], describe: (c) => `WordPress draft: ${c.title}` },
  { type: "wordpress.set_terms", kind: "action", group: "Apps", label: "WordPress: set categories / tags", icon: "sell", external: true, provider: "wordpress", fields: [t("postId", "Post ID", { required: true, placeholder: "{{steps.n2.item.id}}" }), t("kind", "Set", { type: "select", required: true, options: [{ value: "tags", label: "Tags" }, { value: "categories", label: "Categories" }] }), t("names", "Names (comma separated)", { required: true })], describe: (c) => `Set WordPress ${c.kind}` },
];

export const BLOCKS: Record<string, BlockMeta> = Object.fromEntries(LIST.map((b) => [b.type, b]));
export const BLOCK_LIST = LIST;

// Key-based connections a client can add (OAuth ones live in lib/os/connectors.ts).
export const KEY_PROVIDERS: Record<string, { label: string; secretLabel: string; help: string }> = {
  slack: { label: "Slack", secretLabel: "Incoming webhook address", help: "Slack → Apps → Incoming Webhooks → copy the https://hooks.slack.com/… address." },
  discord: { label: "Discord", secretLabel: "Channel webhook address", help: "Channel settings → Integrations → Webhooks → copy URL." },
  teams: { label: "Microsoft Teams", secretLabel: "Workflow / connector webhook address", help: "Channel → Workflows → 'Post to a channel when a webhook request is received'." },
  telegram: { label: "Telegram", secretLabel: "Bot token", help: "Create a bot with @BotFather and paste its token." },
  notion: { label: "Notion", secretLabel: "Internal integration secret", help: "notion.so/my-integrations → new integration → share your database with it." },
  airtable: { label: "Airtable", secretLabel: "Personal access token", help: "airtable.com/create/tokens with data.records:write on your base." },
  hubspot: { label: "HubSpot", secretLabel: "Private app access token", help: "Settings → Integrations → Private Apps, with crm.objects.contacts write scope." },
  wordpress: { label: "WordPress", secretLabel: "site address | username | application password", help: "Users → Profile → Application Passwords. Format: https://yoursite.com|editor|abcd efgh ijkl" },
};
