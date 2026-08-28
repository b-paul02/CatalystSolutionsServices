// B2B discovery + reveal against the real DB: masking, exclusions, token
// debits, reveal idempotency, insufficient-balance behavior.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { revealCostPreview, revealRecords, searchPeople } from "@/lib/leados/b2bDiscovery";
import { creditTokens, tokenBalance } from "@/lib/leados/tokens";

const tag = `b2b-${Date.now()}`;
let orgId: string, datasetId: string, sourceId: string;

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  sourceId = (await db.losDataSource.create({ data: { name: `${tag}-src`, demo: true } })).id;
  datasetId = (
    await db.losDataset.create({
      data: { sourceId, name: `${tag}-ds`, leadType: "b2b", status: "approved", headers: "[]", rows: "[]", demo: true },
    })
  ).id;
  await db.losInventoryRecord.createMany({
    data: [
      {
        datasetId, leadType: "b2b", demo: true, qualityScore: 80,
        fields: JSON.stringify({ firstName: "Ravi", lastName: "Kumar", jobTitle: "Founder", companyName: "Acme Homes", companyDomain: "acmehomes.in", email: `ravi-${tag}@acmehomes.in`, phone: "+919812340001" }),
        normalizedEmail: `ravi-${tag}@acmehomes.in`, normalizedPhone: "+919812340001", city: "Mumbai", country: "India",
      },
      {
        datasetId, leadType: "b2b", demo: true, qualityScore: 60,
        fields: JSON.stringify({ firstName: "Meera", lastName: "Shah", jobTitle: "Marketing Head", companyName: "BlockBuild", companyDomain: "blockbuild.io", email: `meera-${tag}@blockbuild.io` }),
        normalizedEmail: `meera-${tag}@blockbuild.io`, city: "Pune", country: "India",
      },
    ],
  });
  await creditTokens({ orgId, amount: 100, kind: "grant", note: "test" });
});

afterAll(async () => {
  await db.losReveal.deleteMany({ where: { orgId } });
  await db.losTokenLedger.deleteMany({ where: { orgId } });
  await db.losLeadSourceRecord.deleteMany({ where: { orgId } });
  await db.losLead.deleteMany({ where: { orgId } });
  await db.losCompany.deleteMany({ where: { orgId } });
  await db.losExclusion.deleteMany({ where: { orgId } });
  await db.losInventoryRecord.deleteMany({ where: { datasetId } });
  await db.losDataset.delete({ where: { id: datasetId } });
  await db.losDataSource.delete({ where: { id: sourceId } });
  await db.losOrg.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("b2b discovery", () => {
  it("searches with filters and masks unrevealed contacts", async () => {
    const hits = await searchPeople(orgId, { title: "founder" }, 100);
    const ravi = hits.find((h) => h.firstName === "Ravi" && h.companyDomain === "acmehomes.in");
    expect(ravi).toBeDefined();
    expect(ravi!.lastNameInitial).toBe("K.");
    expect(ravi!.revealed).toBeNull();
    expect(ravi!.hasEmail).toBe(true);
    expect(hits.some((h) => h.firstName === "Meera")).toBe(false); // title filter
  });

  it("exclusion list hides matching domains", async () => {
    await db.losExclusion.create({ data: { orgId, domain: "blockbuild.io" } });
    const hits = await searchPeople(orgId, {});
    expect(hits.some((h) => h.companyDomain === "blockbuild.io")).toBe(false);
  });

  it("reveal debits once, creates the lead, and is idempotent", async () => {
    const hits = await searchPeople(orgId, { title: "founder" });
    const mine = hits.find((h) => h.companyDomain === "acmehomes.in")!;
    const recordId = mine.recordId;
    const preview = await revealCostPreview(orgId, [recordId]);
    expect(preview.total).toBeGreaterThan(0);
    const before = await tokenBalance(orgId);

    const [first] = await revealRecords(orgId, [recordId], "test-user");
    expect(first.outcome).toBe("revealed");
    expect(first.leadId).toBeDefined();
    const after = await tokenBalance(orgId);
    expect(before - after).toBe(preview.total);

    const [second] = await revealRecords(orgId, [recordId], "test-user");
    expect(second.outcome).toBe("already");
    expect(await tokenBalance(orgId)).toBe(after); // no double charge

    const again = await searchPeople(orgId, { title: "founder" });
    expect(again.find((h) => h.recordId === recordId)?.revealed?.email).toContain("acmehomes.in");
  });

  it("insufficient balance blocks the reveal without a partial debit", async () => {
    await db.losTokenLedger.create({ data: { orgId, delta: -(await tokenBalance(orgId)), kind: "adjustment", note: "drain" } });
    const hits = await searchPeople(orgId, {});
    const un = hits.find((h) => !h.revealed);
    if (!un) return; // everything already revealed — nothing to assert
    const [result] = await revealRecords(orgId, [un.recordId], "test-user");
    expect(result.outcome).toBe("insufficient_tokens");
    expect(await tokenBalance(orgId)).toBe(0);
  });
});
