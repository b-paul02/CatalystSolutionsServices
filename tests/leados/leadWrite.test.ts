// createLead against the real DB: dedupe scope, b2c lawful-use requirement,
// company find-or-create. Demo-flagged; cleaned up after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { createLead } from "@/lib/leados/leadWrite";

const tag = `leadwrite-${Date.now()}`;
let orgA: string, orgB: string;

beforeAll(async () => {
  orgA = (await db.losOrg.create({ data: { name: `${tag}-A`, demo: true } })).id;
  orgB = (await db.losOrg.create({ data: { name: `${tag}-B`, demo: true } })).id;
});

afterAll(async () => {
  for (const orgId of [orgA, orgB]) {
    await db.losLeadSourceRecord.deleteMany({ where: { orgId } });
    await db.losVerificationEvent.deleteMany({ where: { orgId } });
    await db.losLead.deleteMany({ where: { orgId } });
    await db.losCompany.deleteMany({ where: { orgId } });
    await db.losTag.deleteMany({ where: { orgId } });
  }
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.$disconnect();
});

const lawfulUse = { purposes: ["sales_contact"], channels: ["call"] };

describe("createLead", () => {
  it("rejects a lead without any contact point, and b2c without lawful use", async () => {
    const r1 = await createLead({ orgId: orgA, leadType: "b2c", input: { firstName: "X" }, source: "manual", lawfulUse, demo: true });
    expect(r1.outcome).toBe("invalid");
    const r2 = await createLead({ orgId: orgA, leadType: "b2c", input: { phone: "9876543210" }, source: "manual", demo: true });
    expect(r2.outcome).toBe("invalid");
  });

  it("creates, then dedupes within the same org+type, allows across orgs", async () => {
    const input = { firstName: "Asha", phone: "98765 43210" };
    const a = await createLead({ orgId: orgA, leadType: "b2c", input, source: "manual", lawfulUse, demo: true, verify: false });
    expect(a.outcome).toBe("created");
    const dup = await createLead({ orgId: orgA, leadType: "b2c", input: { phone: "+91 98765-43210" }, source: "manual", lawfulUse, demo: true, verify: false });
    expect(dup.outcome).toBe("duplicate");
    const other = await createLead({ orgId: orgB, leadType: "b2c", input, source: "manual", lawfulUse, demo: true, verify: false });
    expect(other.outcome).toBe("created");
  });

  it("b2b: company find-or-create by domain, provenance recorded", async () => {
    const r1 = await createLead({
      orgId: orgA, leadType: "b2b", source: "manual", demo: true, verify: false,
      input: { firstName: "Dev", email: `dev-${tag}@acme.io`, companyName: "Acme", companyDomain: "https://www.acme.io" },
    });
    expect(r1.outcome).toBe("created");
    const r2 = await createLead({
      orgId: orgA, leadType: "b2b", source: "manual", demo: true, verify: false,
      input: { firstName: "Eve", email: `eve-${tag}@acme.io`, companyDomain: "acme.io" },
    });
    expect(r2.outcome).toBe("created");
    const companies = await db.losCompany.findMany({ where: { orgId: orgA, domain: "acme.io" } });
    expect(companies).toHaveLength(1);
    const prov = await db.losLeadSourceRecord.findMany({ where: { orgId: orgA, leadId: (r1 as { leadId: string }).leadId } });
    expect(prov).toHaveLength(1);
  });

  it("b2c stores permitted purposes/channels for enforcement", async () => {
    const r = await createLead({
      orgId: orgA, leadType: "b2c", source: "import", demo: true, verify: false,
      input: { phone: "9812345670" },
      lawfulUse: { purposes: ["sales_contact", "marketing"], channels: ["whatsapp"], retentionDays: 90 },
    });
    expect(r.outcome).toBe("created");
    const b2c = await db.losLeadB2c.findUnique({ where: { leadId: (r as { leadId: string }).leadId } });
    expect(JSON.parse(b2c!.permittedPurposes!)).toEqual(["sales_contact", "marketing"]);
    expect(JSON.parse(b2c!.permittedChannels!)).toEqual(["whatsapp"]);
    expect(b2c!.retentionExpiresAt).not.toBeNull();
  });
});
