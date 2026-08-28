import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { rollupOrgDay } from "@/lib/leados/metrics";
import { PACKAGES, TOKEN_PACKS } from "@/lib/leados/billing";

afterAll(() => db.$disconnect());

describe("metrics rollup", () => {
  it("aggregates a real org day and upserts idempotently", async () => {
    const org = await db.losOrg.findFirst({ where: { name: "Demo Realty Pvt Ltd" } });
    if (!org) return; // demo data absent in a fresh environment
    const date = "2026-08-28"; // the day the demo allocation + form ran
    const first = await rollupOrgDay(org.id, date);
    expect(first.leadsCreated).toBeGreaterThan(0);
    expect(first.delivered).toBeGreaterThan(0);
    expect(first.tokensSpent).toBeGreaterThan(0);
    const again = await rollupOrgDay(org.id, date);
    expect(again).toEqual(first);
    const rows = await db.losDailyMetric.count({ where: { orgId: org.id, date } });
    expect(rows).toBe(1);
  });
});

describe("billing catalog", () => {
  it("packs and packages are sane in both markets", () => {
    for (const market of ["IN", "US"] as const) {
      for (const pack of TOKEN_PACKS[market]) {
        expect(pack.tokens).toBeGreaterThan(0);
        expect(pack.amountMinor).toBeGreaterThan(0);
      }
      // bigger packs are cheaper per token
      const rates = TOKEN_PACKS[market].map((p) => p.amountMinor / p.tokens);
      expect([...rates].sort((a, b) => b - a)).toEqual(rates);
    }
    expect(PACKAGES.filter((p) => p.selfServe).every((p) => p.monthlyMinor)).toBe(true);
  });
});
