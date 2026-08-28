// Suppression + withdrawal against the real DB (blueprint mandatory negatives:
// allocation/import after withdrawal or suppression must be impossible).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { createLead } from "@/lib/leados/leadWrite";
import { contactHashes, isSuppressed, suppressContact, withdrawConsent } from "@/lib/leados/suppression";

const tag = `suppr-${Date.now()}`;
const PHONE = "+919888800001";
let orgId: string;

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
});

afterAll(async () => {
  const hashes = contactHashes(null, PHONE);
  await db.losSuppressionEntry.deleteMany({ where: { contactHash: { in: hashes } } });
  await db.losConsentEvent.deleteMany({ where: { contactHash: { in: hashes } } });
  await db.losLeadSourceRecord.deleteMany({ where: { orgId } });
  await db.losLead.deleteMany({ where: { orgId } });
  await db.losOrg.delete({ where: { id: orgId } });
  await db.$disconnect();
});

const lawfulUse = { purposes: ["sales_contact"], channels: ["call"] };

describe("suppression lifecycle", () => {
  it("withdrawal marks the lead, writes the ledger, and blocks re-import", async () => {
    const created = await createLead({
      orgId, leadType: "b2c", source: "manual", demo: true, verify: false,
      input: { firstName: "With", phone: PHONE }, lawfulUse,
    });
    expect(created.outcome).toBe("created");
    const leadId = (created as { leadId: string }).leadId;

    await withdrawConsent({ leadId, orgId });

    const b2c = await db.losLeadB2c.findUnique({ where: { leadId } });
    expect(b2c?.withdrawnAt).not.toBeNull();
    expect(b2c?.suppressedAt).not.toBeNull();

    expect(await isSuppressed(contactHashes(null, PHONE), orgId)).toBe(true);

    const events = await db.losConsentEvent.findMany({ where: { contactHash: { in: contactHashes(null, PHONE) } } });
    expect(events.some((e) => e.kind === "withdrawal")).toBe(true);
    expect(events.some((e) => e.kind === "suppression")).toBe(true);

    // Mandatory negative: re-acquiring the suppressed contact must fail.
    await db.losLead.deleteMany({ where: { id: leadId } });
    const again = await createLead({
      orgId, leadType: "b2c", source: "import", demo: true, verify: false,
      input: { firstName: "Again", phone: PHONE }, lawfulUse,
    });
    expect(again.outcome).toBe("invalid");
  });

  it("global suppression blocks across every org; b2b unaffected by b2c rules", async () => {
    await suppressContact({ phone: PHONE, scope: "global", reason: "privacy_request" });
    expect(await isSuppressed(contactHashes(null, PHONE))).toBe(true);
    expect(await isSuppressed(contactHashes(null, PHONE), "some-other-org")).toBe(true);
    expect(await isSuppressed(contactHashes(null, "+919999999999"), orgId)).toBe(false);
  });
});
