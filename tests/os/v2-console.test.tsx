// The operator console sits behind the admin password, so it cannot be browser-checked by an agent.
// This renders the server component against the test database to prove its queries and markup work.
import { afterAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { db } from "@/lib/audit/db";
import OpsOverview from "@/app/(site)/admin/os/OpsOverview";
import { runTick, schedulerHealth } from "@/lib/os/tick";
import { createEngagement } from "@/lib/os/engagement";

const tag = `v2-console-${Date.now()}`;
let orgId: string;

afterAll(async () => {
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("operator console", { timeout: 60_000 }, () => {
  it("renders engagements, queues, capacity, renewals and AI usage — unknown AI cost is said, not shown as 0", async () => {
    orgId = (await db.losOrg.create({ data: { name: `${tag} Client`, demo: true } })).id;
    const e = await createEngagement(orgId, null, { name: "Console engagement", goalFocus: ["visibility"], demo: true }, "platform_admin");
    await db.cosEngagement.update({ where: { id: e.id }, data: { stage: "active", renewalAt: new Date(Date.now() + 10 * 86_400_000), hold: "awaiting_client", holdReason: "Waiting for DNS" } });
    await db.cosAiUsage.create({ data: { orgId, feature: "content_draft", model: "test-model", inputTokens: 1200, outputTokens: 300, costMicros: null, demo: true } });
    const html = renderToStaticMarkup(await OpsOverview());
    expect(html).toContain(`${tag} Client`);
    expect(html).toContain("Console engagement");
    expect(html).toContain("awaiting client");
    expect(html).toContain("Renewals in the next 60 days");
    expect(html).toContain("unknown — prices not configured");
    expect(html).not.toContain("$0.0000");
  });

  it("the scheduler heartbeat goes stale when ticks stop, and a tick refreshes it", async () => {
    await runTick(new Date());
    expect((await schedulerHealth()).stale).toBe(false);
    expect((await schedulerHealth(new Date(Date.now() + 16 * 60_000))).stale).toBe(true);
  });
});
