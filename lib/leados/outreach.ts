// Outreach send path (blueprint §5.11). EVERY send — one-to-one or sequence —
// goes through sendOutreachMessage: channel-permission check (purpose engine),
// suppression, sending caps, personalization, transport, audit. No bulk path
// exists, deliberately.
import { db } from "@/lib/audit/db";
import { decideUse } from "./compliance";
import { contactHashes, isSuppressed } from "./suppression";
import { randomToken } from "./crypto";
import { APP_URL, sendLosMail } from "./email";
import { logLosAudit } from "./audit";

const DAILY_CAP_PER_CHANNEL = 500; // per org — ponytail: env/plan-based caps when a customer needs more
const DAILY_CAP_PER_LEAD = 3;

export type SendResult =
  | { outcome: "sent"; messageId: string; dev?: boolean }
  | { outcome: "blocked"; reason: string };

/** {{firstName}} {{lastName}} {{city}} {{product}} variables. */
export function renderTemplate(body: string, lead: { firstName: string | null; lastName: string | null; city: string | null }, extras?: Record<string, string>): string {
  const vars: Record<string, string> = {
    firstName: lead.firstName ?? "there",
    lastName: lead.lastName ?? "",
    city: lead.city ?? "",
    ...(extras ?? {}),
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

// ── transports ───────────────────────────────────────────────────────────────

async function twilioSend(channel: "whatsapp" | "sms", to: string, body: string): Promise<{ ok: boolean; ref?: string; dev?: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) {
    console.log(`[leados outreach:dev] ${channel} to=${to} body="${body.slice(0, 80)}…"`);
    return { ok: true, dev: true };
  }
  const prefix = channel === "whatsapp" ? "whatsapp:" : "";
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: `${prefix}${to}`, From: `${prefix}${from}`, Body: body }),
  });
  if (!res.ok) return { ok: false, error: `twilio ${res.status}: ${(await res.text()).slice(0, 300)}` };
  const json = (await res.json()) as { sid?: string };
  return { ok: true, ref: json.sid };
}

// ── the send path ────────────────────────────────────────────────────────────

export async function sendOutreachMessage(opts: {
  orgId: string;
  leadId: string;
  channel: "whatsapp" | "sms" | "email";
  body: string;
  subject?: string;
  templateId?: string;
  sequenceId?: string;
  sentById?: string | null;
  purpose?: string; // defaults to sales_contact
}): Promise<SendResult> {
  const lead = await db.losLead.findFirst({
    where: { id: opts.leadId, orgId: opts.orgId, deletedAt: null },
    include: { b2c: true },
  });
  if (!lead) return { outcome: "blocked", reason: "lead_not_found" };

  const purpose = opts.purpose ?? "sales_contact";

  // B2C: the channel-permission gate. B2B contacts are business outreach —
  // still suppression-checked, but not consent-gated per channel.
  if (lead.leadType === "b2c") {
    const decision = decideUse({
      permittedPurposes: JSON.parse(lead.b2c?.permittedPurposes ?? "[]"),
      permittedChannels: JSON.parse(lead.b2c?.permittedChannels ?? "[]"),
      retentionExpiresAt: lead.b2c?.retentionExpiresAt,
      withdrawnAt: lead.b2c?.withdrawnAt,
      suppressed: Boolean(lead.b2c?.suppressedAt),
      purpose,
      channel: opts.channel,
    });
    if (decision.decision !== "allow") {
      const reason = "reason" in decision ? decision.reason : "needs_review";
      await recordBlocked(opts, lead.id, reason);
      return { outcome: "blocked", reason };
    }
  }
  if (await isSuppressed(contactHashes(lead.normalizedEmail, lead.normalizedPhone), opts.orgId)) {
    await recordBlocked(opts, lead.id, "suppressed");
    return { outcome: "blocked", reason: "suppressed" };
  }

  const to = opts.channel === "email" ? lead.normalizedEmail : lead.normalizedPhone;
  if (!to) return { outcome: "blocked", reason: `no_${opts.channel === "email" ? "email" : "phone"}` };

  // Sending caps
  const since = new Date(Date.now() - 86_400_000);
  const [orgCount, leadCount] = await Promise.all([
    db.losOutboundMessage.count({ where: { orgId: opts.orgId, channel: opts.channel, status: { in: ["sent", "dev_logged"] }, createdAt: { gt: since } } }),
    db.losOutboundMessage.count({ where: { leadId: lead.id, status: { in: ["sent", "dev_logged"] }, createdAt: { gt: since } } }),
  ]);
  if (orgCount >= DAILY_CAP_PER_CHANNEL) return { outcome: "blocked", reason: "org_daily_cap" };
  if (leadCount >= DAILY_CAP_PER_LEAD) return { outcome: "blocked", reason: "lead_daily_cap" };

  const rendered = renderTemplate(opts.body, lead);
  const optOutToken = randomToken(12);

  let status = "sent";
  let providerRef: string | undefined;
  let error: string | undefined;
  let dev = false;
  if (opts.channel === "email") {
    const footer = `\n\n—\nReply STOP or use this link to stop these messages: ${APP_URL}/u/${optOutToken}`;
    const r = await sendLosMail({ to, subject: opts.subject ?? "Hello from our team", text: rendered + footer });
    dev = !r.delivered;
    status = r.delivered ? "sent" : "dev_logged";
  } else {
    const r = await twilioSend(opts.channel, to, rendered);
    if (!r.ok) {
      status = "failed";
      error = r.error;
    } else {
      dev = Boolean(r.dev);
      status = r.dev ? "dev_logged" : "sent";
      providerRef = r.ref;
    }
  }

  const message = await db.losOutboundMessage.create({
    data: {
      orgId: opts.orgId, leadId: lead.id, channel: opts.channel, toAddress: to,
      subject: opts.subject ?? null, body: rendered,
      templateId: opts.templateId ?? null, sequenceId: opts.sequenceId ?? null,
      status, blockReason: error ?? null, providerRef: providerRef ?? null,
      optOutToken, sentById: opts.sentById ?? null,
    },
  });
  await db.losActivity.create({
    data: {
      orgId: opts.orgId, leadId: lead.id, kind: "message_sent", actorId: opts.sentById ?? null,
      data: JSON.stringify({ channel: opts.channel, messageId: message.id, status }),
    },
  });
  if (lead.status === "new" || lead.status === "assigned") {
    await db.losLead.update({ where: { id: lead.id }, data: { status: "contacted", contactedAt: lead.contactedAt ?? new Date() } });
  }
  await logLosAudit({ orgId: opts.orgId, actorUserId: opts.sentById ?? undefined, actorType: opts.sentById ? "user" : "system", action: "outreach.send", entity: "LosOutboundMessage", entityId: message.id, data: { channel: opts.channel, status } });
  if (status === "failed") return { outcome: "blocked", reason: error ?? "send_failed" };
  return { outcome: "sent", messageId: message.id, dev };
}

async function recordBlocked(
  opts: { orgId: string; channel: string; body: string; subject?: string; templateId?: string; sequenceId?: string; sentById?: string | null },
  leadId: string,
  reason: string,
) {
  await db.losOutboundMessage.create({
    data: {
      orgId: opts.orgId, leadId, channel: opts.channel, toAddress: "",
      subject: opts.subject ?? null, body: opts.body.slice(0, 500),
      templateId: opts.templateId ?? null, sequenceId: opts.sequenceId ?? null,
      status: "blocked", blockReason: reason, sentById: opts.sentById ?? null,
    },
  });
}

// ── opt-out handling ─────────────────────────────────────────────────────────

/** Email opt-out link target: removes the channel permission + ledger event. */
export async function handleOptOut(token: string): Promise<boolean> {
  const message = await db.losOutboundMessage.findUnique({ where: { optOutToken: token } });
  if (!message) return false;
  await channelOptOut(message.orgId, message.leadId, message.channel, `optout_link:${message.id}`);
  await db.losMessageEvent.create({ data: { messageId: message.id, kind: "optout" } });
  return true;
}

/** Removes ONE channel from a b2c lead's permissions and stops sequences. */
export async function channelOptOut(orgId: string, leadId: string, channel: string, source: string): Promise<void> {
  const lead = await db.losLead.findFirst({ where: { id: leadId, orgId }, include: { b2c: true } });
  if (!lead) return;
  if (lead.b2c) {
    const channels = (JSON.parse(lead.b2c.permittedChannels ?? "[]") as string[]).filter((c) => c !== channel);
    await db.losLeadB2c.update({ where: { leadId }, data: { permittedChannels: JSON.stringify(channels) } });
  }
  for (const contactHash of contactHashes(lead.normalizedEmail, lead.normalizedPhone)) {
    await db.losConsentEvent.create({
      data: { contactHash, orgId, leadId, kind: "objection", channel, sourceApp: source },
    });
  }
  await db.losSequenceEnrollment.updateMany({
    where: { leadId, orgId, status: "active" },
    data: { status: "stopped_optout" },
  });
}
