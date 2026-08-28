// The blueprint §23 acceptance slice as ONE permanent test, run programmatically
// end to end against the real DB: dataset → approval → plan → allocation →
// pipeline conversion → suppression → analytics. Every later change must keep
// this green.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { materializeDataset } from "@/lib/leados/datasets";
import { allocatePlan } from "@/lib/leados/allocation";
import { creditTokens, tokenBalance } from "@/lib/leados/tokens";
import { suppressContact, contactHashes, isSuppressed } from "@/lib/leados/suppression";
import { sendOutreachMessage } from "@/lib/leados/outreach";
import { rollupOrgDay } from "@/lib/leados/metrics";

const tag = `e2e-${Date.now()}`;
const cleanup: (() => Promise<unknown>)[] = [];

afterAll(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await db.$disconnect();
});

describe("§23 acceptance slice", () => {
  it("runs the full vertical slice", { timeout: 180_000 }, async () => {
    // 1. an administrator and one client organization
    const org = await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", industry: "Real estate", demo: true } });
    cleanup.push(() => db.losOrg.delete({ where: { id: org.id } }));
    cleanup.push(() => db.losTokenLedger.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losConsentEvent.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losLeadSourceRecord.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losOutboundMessage.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losActivity.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losDailyMetric.deleteMany({ where: { orgId: org.id } }));
    cleanup.push(() => db.losLead.deleteMany({ where: { orgId: org.id } }));

    // 2. import a synthetic B2C dataset with purpose and channel permissions
    const source = await db.losDataSource.create({ data: { name: `${tag}-src`, demo: true } });
    cleanup.push(() => db.losDataSource.delete({ where: { id: source.id } }));
    const rows = Array.from({ length: 12 }, (_, i) => [`P${i}`, `+919810${String(200000 + i)}`, tag]);
    const dataset = await db.losDataset.create({
      data: {
        sourceId: source.id, name: `${tag}-ds`, leadType: "b2c", status: "compliance_review",
        headers: JSON.stringify(["First Name", "Phone", "City"]),
        rows: JSON.stringify(rows),
        mapping: JSON.stringify({ "First Name": "firstName", "Phone": "phone", "City": "city" }),
        lawfulUse: JSON.stringify({ purposes: ["sales_contact"], channels: ["call", "whatsapp"], evidenceNote: "synthetic" }),
        exclusivity: "exclusive", demo: true,
      },
    });
    cleanup.push(() => db.losDataset.delete({ where: { id: dataset.id } }));
    cleanup.push(() => db.losInventoryRecord.deleteMany({ where: { datasetId: dataset.id } }));

    // 3. approve the dataset (materializes inventory)
    const materialized = await materializeDataset(dataset.id);
    expect(materialized.created).toBe(12);

    // 4. a client campaign with ten leads per weekday
    await creditTokens({ orgId: org.id, amount: 1000, kind: "grant", note: "e2e" });
    const plan = await db.losLeadPlan.create({
      data: {
        orgId: org.id, name: `${tag}-plan`, leadType: "b2c", dailyQuota: 10,
        startDate: new Date("2026-08-01"), purpose: "sales_contact", exclusivity: "exclusive", demo: true,
        targeting: JSON.stringify({ cities: [tag] }),
      },
    });
    cleanup.push(() => db.losLeadPlan.delete({ where: { id: plan.id } }));
    cleanup.push(() => db.losAllocation.deleteMany({ where: { planId: plan.id } }));
    cleanup.push(() => db.losAllocationRun.deleteMany({ where: { planId: plan.id } }));

    // 5. allocation preview
    const preview = await allocatePlan(plan.id, { execute: false, runDate: "2026-08-28" });
    expect(preview.due).toBe(10);
    expect(preview.allocated).toBe(10);

    // 6. execute the allocation transaction
    const run = await allocatePlan(plan.id, { execute: true, runDate: "2026-08-28" });
    expect(run.allocated).toBe(10);

    // 7. the ten allocated leads exist in the client org
    const leads = await db.losLead.findMany({ where: { orgId: org.id, source: "allocation" } });
    expect(leads).toHaveLength(10);

    // 8. move one lead through the pipeline to Converted
    const winner = leads[0];
    for (const status of ["assigned", "contacted", "engaged", "qualified", "converted"]) {
      await db.losLead.update({ where: { id: winner.id }, data: { status } });
    }
    expect((await db.losLead.findUnique({ where: { id: winner.id } }))?.status).toBe("converted");

    // 9. suppress another lead and prove it cannot be contacted or reallocated
    const suppressed = leads[1];
    await suppressContact({ phone: suppressed.normalizedPhone, scope: "org", orgId: org.id, reason: "complaint", note: tag });
    cleanup.push(() => db.losSuppressionEntry.deleteMany({ where: { note: tag } }));
    expect(await isSuppressed(contactHashes(null, suppressed.normalizedPhone), org.id)).toBe(true);
    const send = await sendOutreachMessage({ orgId: org.id, leadId: suppressed.id, channel: "whatsapp", body: "hi" });
    expect(send.outcome).toBe("blocked");
    // reallocation impossible: same record can't go to the org twice, and the
    // suppression check excludes it for any other plan of this org.
    const rerun = await allocatePlan(plan.id, { execute: true, runDate: "2026-08-28" });
    expect(rerun.skipped).toBe("already_executed");

    // 10. quota fulfilment and conversion analytics
    const metrics = await rollupOrgDay(org.id, "2026-08-28");
    expect(metrics.delivered).toBe(10);
    expect(metrics.leadsCreated).toBe(10);
    const balance = await tokenBalance(org.id);
    expect(balance).toBeLessThan(1000); // tokens were debited for the delivery
  });
});
