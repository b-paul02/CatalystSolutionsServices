// Allocation engine against the real DB: quota, tokens, compliance, dedupe,
// idempotency, and the concurrent-exclusive-lead mandatory negative.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { allocatePlan } from "@/lib/leados/allocation";
import { creditTokens, tokenBalance } from "@/lib/leados/tokens";
import { suppressContact } from "@/lib/leados/suppression";

const tag = `alloc-${Date.now()}`;
const RUN_DATE = "2026-08-28"; // a Friday
let orgA: string, orgB: string, sourceId: string, datasetId: string;

const lawfulUse = { purposes: ["sales_contact"], channels: ["call", "whatsapp"], evidenceNote: "synthetic" };

async function makeRecords(n: number, opts?: { maxAllocations?: number; startPhone?: number }) {
  const start = opts?.startPhone ?? 700_000_0000;
  const data = Array.from({ length: n }, (_, i) => {
    const phone = `+91${start + i}`;
    return {
      datasetId, leadType: "b2c", demo: true,
      fields: JSON.stringify({ firstName: `Rec${i}`, phone, city: "Mumbai", country: "India" }),
      normalizedPhone: phone, city: "Mumbai", country: "India",
      qualityScore: 60, maxAllocations: opts?.maxAllocations ?? 1,
    };
  });
  await db.losInventoryRecord.createMany({ data });
}

async function makePlan(orgId: string, quota: number, extra?: Record<string, unknown>) {
  return db.losLeadPlan.create({
    data: {
      orgId, name: `${tag}-plan`, leadType: "b2c", dailyQuota: quota,
      startDate: new Date("2026-08-01"), deliveryTimezone: "Asia/Kolkata",
      purpose: "sales_contact", exclusivity: "exclusive", demo: true,
      ...(extra ?? {}),
    },
  });
}

beforeAll(async () => {
  orgA = (await db.losOrg.create({ data: { name: `${tag}-A`, industry: "Real estate", demo: true } })).id;
  orgB = (await db.losOrg.create({ data: { name: `${tag}-B`, demo: true } })).id;
  sourceId = (await db.losDataSource.create({ data: { name: `${tag}-src`, demo: true } })).id;
  datasetId = (
    await db.losDataset.create({
      data: {
        sourceId, name: `${tag}-ds`, leadType: "b2c", status: "approved",
        headers: "[]", rows: "[]", lawfulUse: JSON.stringify(lawfulUse),
        exclusivity: "exclusive", maxShare: 1, demo: true,
      },
    })
  ).id;
  await creditTokens({ orgId: orgA, amount: 10_000, kind: "grant", note: "test" });
  await creditTokens({ orgId: orgB, amount: 10_000, kind: "grant", note: "test" });
});

afterAll(async () => {
  for (const orgId of [orgA, orgB]) {
    await db.losLeadSourceRecord.deleteMany({ where: { orgId } });
    await db.losConsentEvent.deleteMany({ where: { orgId } });
    await db.losTokenLedger.deleteMany({ where: { orgId } });
    await db.losLead.deleteMany({ where: { orgId } });
  }
  await db.losLeadReplacement.deleteMany({ where: { allocation: { plan: { name: `${tag}-plan` } } } });
  await db.losAllocation.deleteMany({ where: { plan: { name: `${tag}-plan` } } });
  await db.losAllocationRun.deleteMany({ where: { plan: { name: `${tag}-plan` } } });
  await db.losLeadPlan.deleteMany({ where: { name: `${tag}-plan` } });
  await db.losInventoryRecord.deleteMany({ where: { datasetId } });
  await db.losSuppressionEntry.deleteMany({ where: { note: tag } });
  await db.losDataset.delete({ where: { id: datasetId } });
  await db.losDataSource.delete({ where: { id: sourceId } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.$disconnect();
});

describe("allocation engine", () => {
  it("previews and executes a quota, creates leads, debits tokens, is idempotent", { timeout: 120_000 }, async () => {
    await makeRecords(8, { startPhone: 700_000_0000 });
    const plan = await makePlan(orgA, 5);

    const preview = await allocatePlan(plan.id, { execute: false, runDate: RUN_DATE });
    expect(preview.due).toBe(5);
    expect(preview.allocated).toBe(5);
    expect(preview.executed).toBe(false);

    const before = await tokenBalance(orgA);
    const run = await allocatePlan(plan.id, { execute: true, runDate: RUN_DATE });
    expect(run.executed).toBe(true);
    expect(run.allocated).toBe(5);
    expect(run.shortage).toBe(0);

    const leads = await db.losLead.count({ where: { orgId: orgA, source: "allocation" } });
    expect(leads).toBe(5);
    const after = await tokenBalance(orgA);
    expect(before - after).toBeGreaterThan(0);
    const allocs = await db.losAllocation.findMany({ where: { planId: plan.id } });
    expect(allocs).toHaveLength(5);
    expect(allocs.every((a) => a.leadId)).toBe(true);

    // Idempotent: same plan+date again does nothing.
    const again = await allocatePlan(plan.id, { execute: true, runDate: RUN_DATE });
    expect(again.skipped).toBe("already_executed");
    expect(await db.losAllocation.count({ where: { planId: plan.id } })).toBe(5);
  });

  it("skips non-working days", async () => {
    const plan = await makePlan(orgA, 2);
    const sunday = await allocatePlan(plan.id, { execute: true, runDate: "2026-08-30" });
    expect(sunday.skipped).toBe("not_a_working_day");
  });

  it("records shortage when inventory runs dry and reports reasons", { timeout: 120_000 }, async () => {
    const plan = await makePlan(orgB, 50);
    const run = await allocatePlan(plan.id, { execute: true, runDate: RUN_DATE });
    expect(run.executed).toBe(true);
    expect(run.allocated).toBeLessThan(50);
    expect(run.shortage).toBe(50 - run.allocated);
  });

  it("suppressed records are never allocated", async () => {
    const phone = "+917009990001";
    await db.losInventoryRecord.create({
      data: {
        datasetId, leadType: "b2c", demo: true,
        fields: JSON.stringify({ firstName: "Sup", phone }),
        normalizedPhone: phone, qualityScore: 99, maxAllocations: 1,
      },
    });
    await suppressContact({ phone, scope: "global", reason: "complaint", note: tag });
    const plan = await makePlan(orgA, 1, { minQuality: 90 });
    const run = await allocatePlan(plan.id, { execute: true, runDate: RUN_DATE });
    expect(run.allocated).toBe(0);
    expect(run.reasons.suppressed).toBe(1);
  });

  it("insufficient tokens produce shortage, not negative balances", async () => {
    const poorOrg = (await db.losOrg.create({ data: { name: `${tag}-A`, demo: true } })).id; // reuse cleanup filter via name? no — name differs
    await db.losOrg.update({ where: { id: poorOrg }, data: { name: `${tag}-A-poor` } });
    await makeRecords(3, { startPhone: 700_100_0000 });
    const plan = await db.losLeadPlan.create({
      data: {
        orgId: poorOrg, name: `${tag}-plan`, leadType: "b2c", dailyQuota: 3,
        startDate: new Date("2026-08-01"), purpose: "sales_contact", exclusivity: "exclusive", demo: true,
      },
    });
    const run = await allocatePlan(plan.id, { execute: true, runDate: RUN_DATE });
    expect(run.allocated).toBe(0);
    expect(run.reasons.insufficient_tokens).toBe(3);
    expect(await tokenBalance(poorOrg)).toBe(0);
    await db.losLeadSourceRecord.deleteMany({ where: { orgId: poorOrg } });
    await db.losConsentEvent.deleteMany({ where: { orgId: poorOrg } });
    await db.losLead.deleteMany({ where: { orgId: poorOrg } });
    await db.losOrg.delete({ where: { id: poorOrg } });
  });

  it("MANDATORY NEGATIVE: two plans racing for one exclusive record — exactly one wins", { timeout: 120_000 }, async () => {
    const phone = "+917008880001";
    const rec = await db.losInventoryRecord.create({
      data: {
        datasetId, leadType: "b2c", demo: true,
        fields: JSON.stringify({ firstName: "Race", phone }),
        normalizedPhone: phone, qualityScore: 95, maxAllocations: 1,
      },
    });
    const planA = await makePlan(orgA, 1, { minQuality: 94 });
    const planB = await makePlan(orgB, 1, { minQuality: 94 });
    const [ra, rb] = await Promise.all([
      allocatePlan(planA.id, { execute: true, runDate: "2026-08-27" }),
      allocatePlan(planB.id, { execute: true, runDate: "2026-08-27" }),
    ]);
    const winners = (ra.allocated ?? 0) + (rb.allocated ?? 0);
    expect(winners).toBe(1);
    const allocs = await db.losAllocation.count({ where: { inventoryRecordId: rec.id } });
    expect(allocs).toBe(1);
    const record = await db.losInventoryRecord.findUnique({ where: { id: rec.id } });
    expect(record?.status).toBe("allocated");
    expect(record?.allocationCount).toBe(1);
  });
});
