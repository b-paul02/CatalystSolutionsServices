// Executable half of the block catalogue. Each run() gets the rendered config
// and an env scoped to ONE workspace — orgId comes from the workflow row, never
// from the event payload. Anything that contacts a lead goes through the
// existing guarded paths (consent, suppression, caps); nothing here writes to
// another tenant's rows. Throwing BlockedError marks the step "blocked" (policy),
// any other error marks it "failed".
import { db } from "@/lib/audit/db";
import { decryptField } from "@/lib/leados/crypto";
import { callClaude } from "@/lib/audit/anthropic";
import { safeUrl } from "./definition";

export class BlockedError extends Error {}

export type RunEnv = {
  orgId: string;
  workflowId: string;
  actorId: string; // who activated the workflow — the accountable human
  depth: number;
  demo: boolean;
  leadId: string | null; // resolved from the trigger or an earlier create-lead step
  setLeadId: (id: string) => void;
  getState: () => Record<string, unknown>;
  setState: (patch: Record<string, unknown>) => Promise<void>;
};
type Cfg = Record<string, string>;
type Out = Record<string, unknown>;
type Run = (cfg: Cfg, env: RunEnv) => Promise<Out>;

const TIMEOUT = 15_000;
const needLead = (env: RunEnv): string => { if (!env.leadId) throw new Error("This step needs a lead, but the workflow has none at this point."); return env.leadId; };

async function secret(env: RunEnv, provider: string): Promise<string> {
  const c = await db.cosConnection.findFirst({ where: { orgId: env.orgId, provider }, orderBy: { createdAt: "asc" } });
  if (!c?.accessTokenEnc || c.status === "disconnected") throw new Error(`${provider} is not connected — add it in Workflows → Connections.`);
  return decryptField(c.accessTokenEnc);
}

async function call(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: string }> {
  const target = safeUrl(url);
  const res = await fetch(target, {
    ...init, redirect: "error", // a redirect could bounce to an internal address
    headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = (await res.text()).slice(0, 20_000);
  if (!res.ok) throw new Error(`${target.hostname} answered ${res.status}.`);
  return { status: res.status, body };
}

const memberByEmail = async (env: RunEnv, email: string) =>
  db.losMembership.findFirst({ where: { orgId: env.orgId, user: { email: email.trim().toLowerCase() } }, select: { userId: true } });

async function parseFeed(url: string, env: RunEnv, stateKey: string): Promise<Out> {
  const { body } = await call(url);
  const items = [...body.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)].slice(0, 15).map((m) => {
    const x = m[0];
    const pick = (tag: string) => (x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    const link = pick("link") || x.match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
    return { id: pick("guid") || pick("id") || link, title: pick("title"), link, summary: (pick("description") || pick("summary") || pick("content")).slice(0, 600) };
  });
  const seen = new Set((env.getState()[stateKey] as string[] | undefined) ?? []);
  const fresh = items.filter((i) => i.id && !seen.has(i.id));
  await env.setState({ [stateKey]: [...items.map((i) => i.id), ...seen].slice(0, 200) });
  return { isNew: fresh.length > 0, count: fresh.length, item: fresh[0] ?? null, items: fresh, digest: fresh.map((i) => `• ${i.title} — ${i.link}`).join("\n") };
}

const wp = async (env: RunEnv) => {
  const [site, user, pass] = (await secret(env, "wordpress")).split("|").map((s) => s.trim());
  if (!site || !user || !pass) throw new Error("WordPress connection must be: site address | username | application password.");
  return { base: `${site.replace(/\/$/, "")}/wp-json/wp/v2`, headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` } };
};

export const RUNNERS: Record<string, Run> = {
  // ── CRM ──
  "crm.create_lead": async (c, env) => {
    const { createLead } = await import("@/lib/leados/leadWrite");
    const leadType = c.leadType === "b2c" ? "b2c" : "b2b";
    const result = await createLead({
      orgId: env.orgId, leadType, source: "webhook", sourceRef: c.source || `workflow:${env.workflowId}`, demo: env.demo,
      input: { firstName: c.firstName || undefined, email: c.email || undefined, phone: c.phone || undefined },
      // an inbound enquiry is consent to be answered on the channel they used — nothing broader
      lawfulUse: leadType === "b2c" ? { purposes: ["sales_contact"], channels: c.channel ? [c.channel] : [], evidenceNote: `Inbound enquiry via workflow ${env.workflowId}` } : undefined,
    });
    if (result.outcome === "invalid") throw new BlockedError(result.problem);
    env.setLeadId(result.leadId);
    return { leadId: result.leadId, duplicate: result.outcome === "duplicate" };
  },
  "crm.create_task": async (c, env) => {
    const lead = env.leadId ? await db.losLead.findFirst({ where: { id: env.leadId, orgId: env.orgId }, select: { ownerId: true } }) : null;
    const chosen = c.assigneeEmail ? (await memberByEmail(env, c.assigneeEmail))?.userId : null;
    const task = await db.losTask.create({
      data: { orgId: env.orgId, leadId: env.leadId, title: c.title.slice(0, 200), kind: "follow_up", assigneeId: chosen ?? lead?.ownerId ?? env.actorId, createdById: env.actorId, demo: env.demo, dueAt: new Date(Date.now() + (Number(c.dueInHours) || 24) * 3_600_000) },
    });
    return { taskId: task.id };
  },
  "crm.assign_owner": async (c, env) => {
    const leadId = needLead(env);
    let ownerId: string | undefined;
    if (c.mode === "specific") ownerId = (await memberByEmail(env, c.email ?? ""))?.userId;
    else {
      const team = await db.losMembership.findMany({ where: { orgId: env.orgId, role: { in: ["sales_rep", "sales_manager", "owner", "admin"] } }, orderBy: { createdAt: "asc" }, select: { userId: true } });
      const i = Number(env.getState().rr ?? 0);
      ownerId = team[i % Math.max(1, team.length)]?.userId;
      await env.setState({ rr: i + 1 });
    }
    if (!ownerId) throw new Error("No matching team member to assign.");
    await db.losLead.updateMany({ where: { id: leadId, orgId: env.orgId }, data: { ownerId } });
    await db.losActivity.create({ data: { orgId: env.orgId, leadId, kind: "assigned", actorId: env.actorId, data: JSON.stringify({ ownerId, via: "workflow" }) } });
    return { ownerId };
  },
  "crm.update_stage": async (c, env) => {
    const leadId = needLead(env);
    const { isValidStage } = await import("@/lib/leados/stages");
    if (!(await isValidStage(env.orgId, c.stage))) throw new Error(`"${c.stage}" is not a pipeline stage in this workspace.`);
    const before = await db.losLead.findFirst({ where: { id: leadId, orgId: env.orgId }, select: { status: true } });
    if (!before) throw new Error("Lead not found.");
    await db.losLead.updateMany({ where: { id: leadId, orgId: env.orgId }, data: { status: c.stage } });
    await db.losActivity.create({ data: { orgId: env.orgId, leadId, kind: "stage_change", actorId: env.actorId, data: JSON.stringify({ from: before.status, to: c.stage, via: "workflow" }) } });
    const { emitEvent } = await import("./engine");
    await emitEvent(env.orgId, "trigger.lead_stage_changed", { leadId, from: before.status, to: c.stage }, { depth: env.depth + 1 });
    return { from: before.status, to: c.stage };
  },
  "crm.add_note": async (c, env) => {
    const note = await db.losNote.create({ data: { orgId: env.orgId, leadId: needLead(env), authorId: env.actorId, body: c.text.slice(0, 4000) } });
    return { noteId: note.id };
  },
  "sequence.enroll": async (c, env) => {
    const leadId = needLead(env);
    const sequence = await db.losSequence.findFirst({ where: { orgId: env.orgId, name: c.sequenceName } });
    if (!sequence) throw new Error(`No sequence called "${c.sequenceName}".`);
    await db.losSequenceEnrollment.upsert({ where: { sequenceId_leadId: { sequenceId: sequence.id, leadId } }, update: {}, create: { sequenceId: sequence.id, leadId, orgId: env.orgId, nextRunAt: new Date() } });
    return { sequenceId: sequence.id };
  },
  "message.send": async (c, env) => {
    const { sendOutreachMessage } = await import("@/lib/leados/outreach");
    if (!["whatsapp", "sms", "email"].includes(c.channel)) throw new Error("Unknown channel.");
    const result = await sendOutreachMessage({ orgId: env.orgId, leadId: needLead(env), channel: c.channel as "whatsapp" | "sms" | "email", body: c.body });
    if (result.outcome === "blocked") throw new BlockedError(`Not sent: ${result.reason.replace(/_/g, " ")}.`);
    return { messageId: result.messageId };
  },

  // ── GrowthOS ──
  "os.create_work_item": async (c, env) => {
    const { createWorkItem } = await import("@/lib/os/work");
    const item = await createWorkItem({ orgId: env.orgId, userId: env.actorId, role: "cgo_lead" }, { title: c.title, decision: { problem: c.details, source: `workflow:${env.workflowId}` }, demo: env.demo });
    return { workItemId: item.id };
  },
  "os.create_content_draft": async (c, env) => {
    const { createWorkItem } = await import("@/lib/os/work");
    const { copyProblems } = await import("@/lib/os/ai");
    const problems = copyProblems(`${c.title} ${c.body}`);
    if (problems.length) throw new BlockedError(`Draft discarded: ${problems[0]}`);
    // riskTier 2 + a draft in backlog: it cannot be published without QA and client approval
    const item = await createWorkItem({ orgId: env.orgId, userId: env.actorId, role: "cgo_lead" }, { title: c.title, type: "content", riskTier: 2, demo: env.demo, payload: { channel: c.channel, body: c.body, provenance: { origin: "workflow", workflowId: env.workflowId } } });
    return { workItemId: item.id };
  },

  // ── notify ──
  "notify.email": async (c, env) => {
    const { sendLosMail } = await import("@/lib/leados/email");
    const wanted = c.to.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    const members = await db.losMembership.findMany({ where: { orgId: env.orgId, user: { email: { in: wanted } } }, select: { user: { select: { email: true } } } });
    if (members.length === 0) throw new BlockedError("None of those addresses are workspace members — this step never emails anyone else.");
    for (const m of members) await sendLosMail({ to: m.user.email, subject: c.subject.slice(0, 200), text: c.body.slice(0, 8000) });
    return { sent: members.length };
  },
  "notify.slack": async (c, env) => { await call(await secret(env, "slack"), { method: "POST", json: { text: c.text.slice(0, 3500) } }); return { ok: true }; },
  "notify.discord": async (c, env) => { await call(await secret(env, "discord"), { method: "POST", json: { content: c.text.slice(0, 1900) } }); return { ok: true }; },
  "notify.teams": async (c, env) => { await call(await secret(env, "teams"), { method: "POST", json: { text: c.text.slice(0, 3500) } }); return { ok: true }; },
  "notify.telegram": async (c, env) => {
    await call(`https://api.telegram.org/bot${await secret(env, "telegram")}/sendMessage`, { method: "POST", json: { chat_id: c.chatId, text: c.text.slice(0, 4000) } });
    return { ok: true };
  },

  // ── AI ──
  "ai.generate": async (c, env) => {
    const ws = await db.cosWorkspace.findUnique({ where: { orgId: env.orgId }, select: { brandProfile: true } });
    const text = await callClaude(
      `You write for a business. Be concrete and brief. Never promise or guarantee results, rankings or revenue; never invent statistics, client names or testimonials.${ws?.brandProfile ? ` Brand profile: ${ws.brandProfile.slice(0, 3000)}` : ""}`,
      c.prompt.slice(0, 12_000), 1500,
    );
    return { text: text.trim() };
  },
  "ai.classify": async (c) => {
    const cats = c.categories.split(",").map((s) => s.trim()).filter(Boolean);
    const raw = (await callClaude(`Classify the text into exactly one of: ${cats.join(", ")}. Reply with the category only.`, c.text.slice(0, 6000), 20)).trim().toLowerCase();
    const category = cats.find((k) => raw.includes(k.toLowerCase())) ?? "unknown"; // never trust free text from the model
    return { category };
  },

  // ── data ──
  "feed.fetch": async (c, env) => parseFeed(c.url, env, `feed:${c.url}`),
  "youtube.latest": async (c, env) => parseFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(c.channelId)}`, env, `yt:${c.channelId}`),
  "http.request": async (c) => {
    let headers: Record<string, string> = {};
    if (c.headers?.trim()) { try { headers = JSON.parse(c.headers) as Record<string, string>; } catch { throw new Error("Headers must be valid JSON."); } }
    const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(c.method) ? c.method : "GET";
    const { status, body } = await call(c.url, { method, headers, body: method === "GET" ? undefined : c.body });
    let json: unknown = null;
    try { json = JSON.parse(body); } catch { /* not JSON — body stays text */ }
    return { status, body: body.slice(0, 4000), json };
  },

  // ── apps ──
  "notion.create_page": async (c, env) => {
    const { body } = await call("https://api.notion.com/v1/pages", {
      method: "POST", headers: { Authorization: `Bearer ${await secret(env, "notion")}`, "Notion-Version": "2022-06-28" },
      json: { parent: { database_id: c.databaseId }, properties: { title: { title: [{ text: { content: c.title.slice(0, 200) } }] } }, children: c.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: c.content.slice(0, 1900) } }] } }] : [] },
    });
    return { pageId: (JSON.parse(body) as { id?: string }).id ?? null };
  },
  "airtable.create_record": async (c, env) => {
    let fields: unknown;
    try { fields = JSON.parse(c.fields); } catch { throw new Error("Fields must be valid JSON."); }
    const { body } = await call(`https://api.airtable.com/v0/${encodeURIComponent(c.baseId)}/${encodeURIComponent(c.table)}`, { method: "POST", headers: { Authorization: `Bearer ${await secret(env, "airtable")}` }, json: { fields } });
    return { recordId: (JSON.parse(body) as { id?: string }).id ?? null };
  },
  // WP-30 · one-way CRM sync. Pipedrive: search by email, then add or update. Zoho: upsert by Email through the v2 API.
  "pipedrive.upsert_person": async (c, env) => {
    const [token, company] = (await secret(env, "pipedrive")).split("|").map((s) => s.trim());
    if (!token || !company) throw new Error("Pipedrive connection must be: API token | company domain.");
    const base = `https://${company.replace(/[^a-z0-9-]/gi, "")}.pipedrive.com/api/v1`;
    const found = JSON.parse((await call(`${base}/persons/search?term=${encodeURIComponent(c.email)}&fields=email&exact_match=true&api_token=${encodeURIComponent(token)}`)).body) as { data?: { items?: { item: { id: number } }[] } };
    const existing = found.data?.items?.[0]?.item.id;
    const body = { name: c.name || c.email, email: [{ value: c.email, primary: true }], ...(c.phone ? { phone: [{ value: c.phone, primary: true }] } : {}) };
    if (existing) { await call(`${base}/persons/${existing}?api_token=${encodeURIComponent(token)}`, { method: "PUT", json: body }); return { personId: existing, created: false }; }
    const made = JSON.parse((await call(`${base}/persons?api_token=${encodeURIComponent(token)}`, { method: "POST", json: body })).body) as { data?: { id?: number } };
    return { personId: made.data?.id ?? null, created: true };
  },
  "zoho.upsert_contact": async (c, env) => {
    const [token, domain] = (await secret(env, "zoho")).split("|").map((s) => s.trim());
    if (!token || !domain) throw new Error("Zoho connection must be: access token | API domain.");
    const { body } = await call(`${domain.replace(/\/$/, "")}/crm/v2/Contacts/upsert`, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}` }, json: { data: [{ Email: c.email, Last_Name: c.lastName, First_Name: c.firstName ?? "", Phone: c.phone ?? "" }], duplicate_check_fields: ["Email"] } });
    const r = (JSON.parse(body) as { data?: { details?: { id?: string }; action?: string }[] }).data?.[0];
    return { contactId: r?.details?.id ?? null, created: r?.action === "insert" };
  },
  "hubspot.upsert_contact": async (c, env) => {
    const headers = { Authorization: `Bearer ${await secret(env, "hubspot")}` };
    const properties = { email: c.email, firstname: c.firstName ?? "", lastname: c.lastName ?? "" };
    try {
      const { body } = await call("https://api.hubapi.com/crm/v3/objects/contacts", { method: "POST", headers, json: { properties } });
      return { contactId: (JSON.parse(body) as { id?: string }).id ?? null, created: true };
    } catch {
      // 409 = exists → update by email
      const { body } = await call(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(c.email)}?idProperty=email`, { method: "PATCH", headers, json: { properties } });
      return { contactId: (JSON.parse(body) as { id?: string }).id ?? null, created: false };
    }
  },
  "wordpress.latest_post": async (_c, env) => {
    const { base, headers } = await wp(env);
    const { body } = await call(`${base}/posts?per_page=1&orderby=date&_fields=id,link,title,excerpt`, { headers });
    const post = (JSON.parse(body) as { id: number; link: string; title: { rendered: string }; excerpt: { rendered: string } }[])[0];
    if (!post) return { isNew: false, item: null };
    const isNew = env.getState().wpLast !== post.id;
    await env.setState({ wpLast: post.id });
    return { isNew, item: { id: post.id, link: post.link, title: post.title.rendered, summary: post.excerpt.rendered.replace(/<[^>]+>/g, "").trim() } };
  },
  "wordpress.create_draft": async (c, env) => {
    const { base, headers } = await wp(env);
    const { body } = await call(`${base}/posts`, { method: "POST", headers, json: { title: c.title, content: c.content, status: "draft" } }); // ALWAYS a draft — a person publishes
    const post = JSON.parse(body) as { id: number; link: string };
    return { postId: post.id, link: post.link };
  },
  "wordpress.set_terms": async (c, env) => {
    const { base, headers } = await wp(env);
    const kind = c.kind === "categories" ? "categories" : "tags";
    const ids: number[] = [];
    for (const name of c.names.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8)) {
      const found = JSON.parse((await call(`${base}/${kind}?search=${encodeURIComponent(name)}&_fields=id,name`, { headers })).body) as { id: number; name: string }[];
      const hit = found.find((f) => f.name.toLowerCase() === name.toLowerCase());
      ids.push(hit ? hit.id : (JSON.parse((await call(`${base}/${kind}`, { method: "POST", headers, json: { name } })).body) as { id: number }).id);
    }
    await call(`${base}/posts/${encodeURIComponent(c.postId)}`, { method: "POST", headers, json: { [kind]: ids } });
    return { [kind]: ids };
  },
};

/** Live check for a key-based connection. Returns an account label or throws. */
export async function testKeyConnection(provider: string, value: string): Promise<string> {
  switch (provider) {
    case "slack": case "discord": case "teams": {
      const host = safeUrl(value).hostname;
      const ok = provider === "slack" ? host === "hooks.slack.com" : provider === "discord" ? /(^|\.)discord(app)?\.com$/.test(host) : /(office|microsoft|azure|powerplatform|logic)\./.test(host);
      if (!ok) throw new Error(`That doesn't look like a ${provider} webhook address.`);
      return host; // webhooks can't be probed without posting — the first real post is the proof
    }
    case "telegram": return `@${(JSON.parse((await call(`https://api.telegram.org/bot${value}/getMe`)).body) as { result: { username: string } }).result.username}`;
    case "notion": return (JSON.parse((await call("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${value}`, "Notion-Version": "2022-06-28" } })).body) as { name?: string }).name ?? "Notion integration";
    case "airtable": return (JSON.parse((await call("https://api.airtable.com/v0/meta/whoami", { headers: { Authorization: `Bearer ${value}` } })).body) as { id: string }).id;
    case "hubspot": await call("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${value}` } }); return "HubSpot private app";
    case "pipedrive": { const [token, company] = value.split("|").map((s) => s.trim()); if (!token || !company) throw new Error("Use: API token | company domain"); const me = JSON.parse((await call(`https://${company.replace(/[^a-z0-9-]/gi, "")}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(token)}`)).body) as { data?: { name?: string } }; return `${me.data?.name ?? "Pipedrive"} @ ${company}`; }
    case "zoho": { const [token, domain] = value.split("|").map((s) => s.trim()); if (!token || !domain) throw new Error("Use: access token | API domain"); await call(`${domain.replace(/\/$/, "")}/crm/v2/Contacts?per_page=1`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } }); return "Zoho CRM"; }
    case "wordpress": {
      const [site, user, pass] = value.split("|").map((s) => s.trim());
      if (!site || !user || !pass) throw new Error("Use: site address | username | application password");
      const me = JSON.parse((await call(`${site.replace(/\/$/, "")}/wp-json/wp/v2/users/me`, { headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` } })).body) as { name: string };
      return `${me.name} @ ${new URL(site).hostname}`;
    }
    default: throw new Error("Unknown connection.");
  }
}
