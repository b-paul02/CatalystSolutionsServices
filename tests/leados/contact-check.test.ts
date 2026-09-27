// WP-15 · contact verification before the first send: syntax / disposable / role / MX for email, format (+ Twilio Lookup
// when configured) for phone; cached by hash for 90 days; invalid ⇒ sendOutreachMessage refuses and logs the reason.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/audit/db";
import { checkContact, checkEmailSyntax, contactVerdicts, setMxResolverForTests, sweepContactChecks } from "@/lib/leados/contactCheck";
import { sendOutreachMessage } from "@/lib/leados/outreach";
import { createLead } from "@/lib/leados/leadWrite";

const tag = `cc-${Date.now()}`;
let orgId: string;
const mxCalls: string[] = [];

beforeAll(async () => {
  setMxResolverForTests(async (d) => { mxCalls.push(d); if (d === "nomx.test") throw new Error("ENOTFOUND"); return [{ exchange: `mx.${d}` }]; });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://lookups.twilio.com/v2/PhoneNumbers/")) return url.includes("919000000000") ? new Response("nf", { status: 404 }) : Response.json({ valid: true, line_type_intelligence: { type: url.includes("918000000000") ? "landline" : "mobile" } });
    if (url.startsWith("https://api.twilio.com/")) return Response.json({ sid: "SM1" });
    throw new Error(`Unexpected outbound request in a test: ${url}`);
  });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
});
afterAll(async () => {
  await db.losContactCheck.deleteMany({ where: { checkedAt: { gte: new Date(Date.now() - 3_600_000) } } });
  await db.losOutboundMessage.deleteMany({ where: { orgId } }); await db.losActivity.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.losVerificationEvent.deleteMany({ where: { orgId } }); await db.losConsentEvent.deleteMany({ where: { orgId } });
  await db.losLeadB2c.deleteMany({ where: { lead: { orgId } } }); await db.losLead.deleteMany({ where: { orgId } }); await db.cosAiUsage.deleteMany({ where: { orgId } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  vi.unstubAllGlobals();
});

describe("WP-15 contact check", () => {
  it("email: syntax, disposable, role, MX — and the verdict is cached by hash (address never stored)", async () => {
    expect(checkEmailSyntax("bad")).toEqual({ verdict: "invalid", reason: "syntax" });
    expect(checkEmailSyntax("x@mailinator.com")).toEqual({ verdict: "invalid", reason: "disposable_domain" });
    expect(checkEmailSyntax("info@company.test")).toEqual({ verdict: "risky", reason: "role_address" });
    expect((await checkContact("email", `${tag}@nomx.test`)).verdict).toBe("invalid");
    const a = await checkContact("email", `${tag}-person@good.test`);
    expect(a).toMatchObject({ verdict: "ok", provider: "mx", cached: false });
    const b = await checkContact("email", `${tag}-PERSON@good.test`);
    expect(b.cached).toBe(true); expect(mxCalls.filter((d) => d === "good.test")).toHaveLength(1);
    const rows = await db.losContactCheck.findMany({ where: { checkedAt: { gte: new Date(Date.now() - 60_000) } } });
    expect(JSON.stringify(rows)).not.toContain("good.test");
  });

  it("phone: format only without Twilio; with Twilio Lookup a 404 is invalid, a landline is risky, and the lookup is Catalyst-internal usage", async () => {
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
    expect((await checkContact("phone", "12")).verdict).toBe("invalid");
    expect((await checkContact("phone", "+919876543100")).provider).toBe("format");
    process.env.TWILIO_ACCOUNT_SID = "AC1"; process.env.TWILIO_AUTH_TOKEN = "tok";
    expect((await checkContact("phone", "+919000000000", orgId)).verdict).toBe("invalid");
    expect((await checkContact("phone", "+918000000000", orgId))).toMatchObject({ verdict: "risky", reason: "line_type:landline" });
    expect((await checkContact("phone", "+917000000000", orgId)).verdict).toBe("ok");
    const usage = await db.cosAiUsage.findMany({ where: { orgId, feature: "contact_check" } });
    expect(usage.length).toBe(3); expect(usage.every((u) => u.payer === "catalyst_internal")).toBe(true);
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
  });

  it("sendOutreachMessage refuses an invalid contact with a logged reason, and still sends to a risky one", async () => {
    const lawfulUse = { purposes: ["sales_contact"], channels: ["email", "sms"], noticeVersion: "v1", evidenceNote: "test" };
    const bad = await createLead({ orgId, leadType: "b2c", source: "manual", input: { firstName: "D", email: `${tag}-x@mailinator.com`, phone: "+919876543101" }, lawfulUse, verify: false, demo: true });
    const risky = await createLead({ orgId, leadType: "b2c", source: "manual", input: { firstName: "R", email: `info@good.test`, phone: "+919876543102" }, lawfulUse, verify: false, demo: true });
    if (bad.outcome === "invalid" || risky.outcome === "invalid") throw new Error("lead");
    const r1 = await sendOutreachMessage({ orgId, leadId: bad.leadId, channel: "email", body: "hi" });
    expect(r1).toEqual({ outcome: "blocked", reason: "contact_invalid:disposable_domain" });
    expect((await db.losOutboundMessage.findFirst({ where: { orgId, leadId: bad.leadId } }))!.blockReason).toBe("contact_invalid:disposable_domain");
    expect((await db.losLead.findUnique({ where: { id: bad.leadId } }))!.emailStatus).toBe("invalid");
    const r2 = await sendOutreachMessage({ orgId, leadId: risky.leadId, channel: "email", body: "hi" });
    expect(r2.outcome).toBe("sent");
    const v = await contactVerdicts("info@good.test", null);
    expect(v.email?.verdict).toBe("risky");
    // retention
    await db.losContactCheck.updateMany({ where: { contactHash: v.email!.contactHash }, data: { checkedAt: new Date(Date.now() - 91 * 86_400_000) } });
    expect(await sweepContactChecks()).toBeGreaterThanOrEqual(1);
  });
});
