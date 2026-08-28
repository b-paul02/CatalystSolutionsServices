import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { db } from "@/lib/audit/db";
import { normalizePhone } from "@/lib/leados/leads";
import { channelOptOut } from "@/lib/leados/outreach";

// Twilio inbound webhook (SMS + WhatsApp replies). STOP → channel opt-out;
// any reply → reply event + stop active sequences (stop-on-reply).
export async function POST(req: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  // Twilio signature: HMAC-SHA1 of URL + sorted params.
  const url = process.env.TWILIO_WEBHOOK_URL ?? req.nextUrl.href;
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = url + sorted.map(([k, v]) => k + v).join("");
  const expected = createHmac("sha1", token).update(payload).digest("base64");
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (signature !== expected) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  const from = normalizePhone((params.get("From") ?? "").replace(/^whatsapp:/, ""));
  const bodyText = (params.get("Body") ?? "").trim();
  const channel = (params.get("From") ?? "").startsWith("whatsapp:") ? "whatsapp" : "sms";
  if (!from) return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  const leads = await db.losLead.findMany({ where: { normalizedPhone: from, deletedAt: null } });
  const isStop = /^(stop|unsubscribe|cancel)$/i.test(bodyText);
  for (const lead of leads) {
    const lastMessage = await db.losOutboundMessage.findFirst({
      where: { leadId: lead.id, channel },
      orderBy: { createdAt: "desc" },
    });
    if (lastMessage) {
      await db.losMessageEvent.create({
        data: { messageId: lastMessage.id, kind: isStop ? "optout" : "reply", data: JSON.stringify({ body: bodyText.slice(0, 500) }) },
      });
    }
    if (isStop) {
      await channelOptOut(lead.orgId, lead.id, channel, "sms_stop");
    } else {
      // stop-on-reply + surface engagement
      await db.losSequenceEnrollment.updateMany({
        where: { leadId: lead.id, status: "active" },
        data: { status: "stopped_reply" },
      });
      await db.losLead.updateMany({
        where: { id: lead.id, status: { in: ["contacted", "assigned", "new"] } },
        data: { status: "engaged" },
      });
      await db.losActivity.create({
        data: { orgId: lead.orgId, leadId: lead.id, kind: "message_event", data: JSON.stringify({ kind: "reply", channel }) },
      });
    }
  }
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
