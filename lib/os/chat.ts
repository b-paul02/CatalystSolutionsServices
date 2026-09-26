// WP-44 · chat widget + inbox. Visitor identity is a random token (header, not a cookie); the visitor and the inbox
// poll every 5 s. An email, if offered, is recorded through `decideUse` (purpose `support`) and links a lead by contact
// hash. Nobody online → the message is mailed to the workspace. Turnstile guards the first message. 365-day retention.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/audit/db";
import { decideUse } from "@/lib/leados/compliance";
import { createLead } from "@/lib/leados/leadWrite";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { can } from "@/lib/leados/rbac";
import { notify } from "./notify";
import { assertWritable, WorkError, type WorkActor } from "./work";

const MAX_TEXT = 2000;

export async function startConversation(orgId: string, input: { text: string; page?: string; email?: string }, demo = false) {
  const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { accessMode: true, demo: true } });
  if (!ws || ws.accessMode !== "active") return null;
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const visitorToken = randomBytes(24).toString("base64url");
  const conv = await db.cosConversation.create({ data: { orgId, visitorToken, page: input.page?.slice(0, 200) ?? null, demo: demo || ws.demo, messages: { create: { orgId, from: "visitor", text } } } });
  if (input.email) await identify(conv.id, input.email);
  await notify({ orgId, audience: "staff", kind: "new_lead", title: "New chat message", body: text.slice(0, 140), href: `/app/outreach/inbox?c=${conv.id}`, dedupeKey: `chat:${conv.id}` });
  await notify({ orgId, audience: "client", kind: "new_lead", title: "New chat on your site", body: text.slice(0, 140), href: `/app/outreach/inbox?c=${conv.id}`, dedupeKey: `chat_client:${conv.id}` });
  await offlineMail(conv.id, text).catch(() => undefined);
  return { id: conv.id, visitorToken };
}

/** Email offered by the visitor: consent recorded (purpose support), lead linked by contact hash or created as b2c. */
export async function identify(conversationId: string, email: string) {
  const conv = await db.cosConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return;
  const e = email.trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
  const decision = decideUse({ purpose: "support", channel: "email", permittedPurposes: ["support"], permittedChannels: ["email"], suppressed: false, withdrawnAt: null, retentionExpiresAt: null });
  if (decision.decision !== "allow") return;
  let lead = await db.losLead.findFirst({ where: { orgId: conv.orgId, deletedAt: null, normalizedEmail: e }, select: { id: true } });
  if (!lead) {
    const r = await createLead({ orgId: conv.orgId, leadType: "b2c", input: { email: e }, source: "form", sourceRef: `chat:${conv.id}`, lawfulUse: { purposes: ["support"], channels: ["email"], evidenceNote: "Email offered in the site chat widget", noticeVersion: "chat-v1" }, demo: conv.demo, verify: false });
    lead = r.outcome === "created" || r.outcome === "duplicate" ? { id: r.leadId } : null;
  }
  await db.cosConversation.update({ where: { id: conv.id }, data: { email: e, leadId: lead?.id ?? null } });
}

export async function visitorPost(visitorToken: string, text: string) {
  const conv = await db.cosConversation.findUnique({ where: { visitorToken } });
  if (!conv || conv.status !== "open") return null;
  const t = text.trim().slice(0, MAX_TEXT); if (!t) return null;
  await db.cosChatMessage.create({ data: { conversationId: conv.id, orgId: conv.orgId, from: "visitor", text: t } });
  await db.cosConversation.update({ where: { id: conv.id }, data: { lastAt: new Date() } });
  await offlineMail(conv.id, t).catch(() => undefined);
  return conv.id;
}

export async function visitorRead(visitorToken: string, after?: string) {
  const conv = await db.cosConversation.findUnique({ where: { visitorToken }, select: { id: true, status: true } });
  if (!conv) return null;
  const msgs = await db.cosChatMessage.findMany({ where: { conversationId: conv.id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, from: true, text: true, createdAt: true } });
  return { status: conv.status, messages: msgs };
}

/** Staff / client reply from the inbox. */
export async function staffReply(actor: WorkActor, conversationId: string, text: string) {
  if (!can(actor.role, "leads.contact") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const conv = await db.cosConversation.findFirst({ where: { id: conversationId, orgId: actor.orgId } });
  if (!conv) throw new WorkError("Conversation not found.");
  const t = text.trim().slice(0, MAX_TEXT); if (!t) throw new WorkError("Write a reply.");
  await db.cosChatMessage.create({ data: { conversationId: conv.id, orgId: conv.orgId, from: "staff", authorId: actor.userId, text: t } });
  await db.cosConversation.update({ where: { id: conv.id }, data: { lastAt: new Date() } });
}

export async function closeConversation(actor: WorkActor, conversationId: string) {
  if (!can(actor.role, "leads.contact") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  await db.cosConversation.updateMany({ where: { id: conversationId, orgId: actor.orgId }, data: { status: "closed" } });
}

/** Nobody staff-side replied in the last 2 minutes → mail the workspace (the visitor's text only). */
async function offlineMail(conversationId: string, text: string) {
  const conv = await db.cosConversation.findUniqueOrThrow({ where: { id: conversationId } });
  const recent = await db.cosChatMessage.count({ where: { conversationId, from: "staff", createdAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
  if (recent) return;
  const members = await db.losMembership.findMany({ where: { orgId: conv.orgId, role: { in: ["owner", "admin", "sales_manager"] } }, include: { user: { select: { email: true } } }, take: 5 });
  for (const m of members) await sendLosMail({ to: m.user.email, subject: "New chat message on your site", text: `A visitor wrote:\n\n${text}\n\nReply in the inbox: ${APP_URL}/outreach/inbox?c=${conv.id}`, link: `${APP_URL}/outreach/inbox?c=${conv.id}` });
}

export async function sweepChat(now = new Date()) {
  const r = await db.cosConversation.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - 365 * 86_400_000) } } });
  return r.count;
}
