// Outreach send-path guards against the real DB — the §17 mandatory negative:
// a message through an unapproved channel must be blocked.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { createLead } from "@/lib/leados/leadWrite";
import { renderTemplate, sendOutreachMessage, channelOptOut } from "@/lib/leados/outreach";

const tag = `outreach-${Date.now()}`;
let orgId: string, leadId: string;

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  const created = await createLead({
    orgId, leadType: "b2c", source: "manual", demo: true, verify: false,
    input: { firstName: "Guard", phone: "+917000112233", email: `${tag}@example.com` },
    lawfulUse: { purposes: ["sales_contact"], channels: ["whatsapp"] }, // whatsapp ONLY
  });
  leadId = (created as { leadId: string }).leadId;
});

afterAll(async () => {
  await db.losMessageEvent.deleteMany({ where: { message: { orgId } } });
  await db.losOutboundMessage.deleteMany({ where: { orgId } });
  await db.losActivity.deleteMany({ where: { orgId } });
  await db.losConsentEvent.deleteMany({ where: { orgId } });
  await db.losLeadSourceRecord.deleteMany({ where: { orgId } });
  await db.losLead.deleteMany({ where: { orgId } });
  await db.losOrg.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("outreach guards", () => {
  it("renders template variables", () => {
    expect(renderTemplate("Hi {{firstName}} from {{city}}{{unknown}}", { firstName: "A", lastName: null, city: "Pune" })).toBe("Hi A from Pune");
  });

  it("MANDATORY NEGATIVE: blocks a channel without consent, audits the block", async () => {
    const result = await sendOutreachMessage({ orgId, leadId, channel: "sms", body: "hello" });
    expect(result).toEqual({ outcome: "blocked", reason: "channel_not_permitted" });
    const blocked = await db.losOutboundMessage.findFirst({ where: { orgId, leadId, status: "blocked" } });
    expect(blocked?.blockReason).toBe("channel_not_permitted");
  });

  it("sends on the consented channel (dev transport) and moves lead to contacted", async () => {
    const result = await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "Hi {{firstName}}" });
    expect(result.outcome).toBe("sent");
    const message = await db.losOutboundMessage.findFirst({ where: { orgId, leadId, status: "dev_logged" } });
    expect(message?.body).toBe("Hi Guard");
    const lead = await db.losLead.findUnique({ where: { id: leadId } });
    expect(lead?.status).toBe("contacted");
  });

  it("channel opt-out removes only that channel and stops sequences", async () => {
    await channelOptOut(orgId, leadId, "whatsapp", "test");
    const b2c = await db.losLeadB2c.findUnique({ where: { leadId } });
    expect(JSON.parse(b2c!.permittedChannels!)).toEqual([]);
    const after = await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "again" });
    expect(after).toEqual({ outcome: "blocked", reason: "channel_not_permitted" });
    const events = await db.losConsentEvent.findMany({ where: { orgId, leadId, kind: "objection" } });
    expect(events.length).toBeGreaterThan(0);
  });

  it("per-lead daily cap blocks the 4th message", async () => {
    // restore consent for the cap test
    await db.losLeadB2c.update({ where: { leadId }, data: { permittedChannels: JSON.stringify(["whatsapp"]) } });
    // 1 already sent above; send 2 more → cap of 3 reached
    await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "2" });
    await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "3" });
    const fourth = await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "4" });
    expect(fourth).toEqual({ outcome: "blocked", reason: "lead_daily_cap" });
  });
});
