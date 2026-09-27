// WP-01 · unified Connections page: one read model over OAuth, key, ad-intake and config connections; Test / Disconnect
// through the real actions; the old pages redirect. Provider boundary stubbed (no real call leaves the process).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { encryptField } from "@/lib/leados/crypto";
import { follow, form, signIn } from "./entry-harness";
import { listConnectionCards } from "@/lib/os/connections";
import { connectKeyConn, disconnectConn, testConn } from "@/app/app/(shell)/settings/connections/actions";
import IntegrationsPage from "@/app/app/(shell)/settings/integrations/page";
import WorkflowConnectionsPage from "@/app/app/(shell)/workflows/connections/page";

const tag = `fpc-${Date.now()}`;
let orgId: string, otherOrg: string, owner: string, rep: string;
const calls: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); calls.push(url); if (url.startsWith("https://hooks.slack.com/")) return new Response("ok", { status: 200 }); throw new Error(`Unexpected outbound request in a test: ${url}`); });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  otherOrg = (await db.losOrg.create({ data: { name: `${tag}-other`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  rep = (await db.losUser.create({ data: { email: `${tag}-rep@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: rep, role: "sales_rep" }] });
  await db.cosConnection.create({ data: { orgId, provider: "gsc", status: "verified", accountLabel: "https://example.com/", externalAccountId: "https://example.com/", accessTokenEnc: encryptField("tok"), capabilities: ["analytics"], config: JSON.stringify({ siteUrl: "https://example.com/" }) } });
  await db.cosConnection.create({ data: { orgId: otherOrg, provider: "slack", status: "verified", accessTokenEnc: encryptField("https://hooks.slack.com/services/other") } });
  await db.losIntegrationConfig.create({ data: { orgId, config: JSON.stringify({ slackWebhookUrl: "https://hooks.slack.com/services/x" }) } });
});
afterAll(async () => {
  await db.cosConnection.deleteMany({ where: { orgId: { in: [orgId, otherOrg] } } });
  await db.losIntegrationConfig.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [owner, rep] } } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgId, otherOrg] } } }); await db.losUser.deleteMany({ where: { id: { in: [owner, rep] } } });
  vi.unstubAllGlobals();
});

describe("WP-01 unified connections", () => {
  it("lists every source with a status word, tenant-scoped", async () => {
    const cards = await listConnectionCards(orgId);
    const gsc = cards.find((c) => c.provider === "gsc")!;
    expect(gsc.status).toBe("verified"); expect(gsc.accountLabel).toBe("https://example.com/");
    expect(cards.filter((c) => c.source === "key").map((c) => c.provider)).toContain("slack");
    expect(cards.find((c) => c.provider === "slack")!.status).toBe("not_connected"); // the other tenant's key is invisible
    expect(cards.find((c) => c.provider === "slack_notifications")!.status).toBe("verified");
    expect(cards.filter((c) => c.status === "awaiting_approval").map((c) => c.provider)).toEqual(expect.arrayContaining(["google_ads", "gbp", "google_calendar", "linkedin_leadgen"]));
    expect(cards.find((c) => c.provider === "meta" && c.source === "ads")!.status).toBe("not_configured");
  });

  it("key connect → live test → card verified → test again → disconnect destroys the secret", async () => {
    await signIn(owner, orgId);
    const r = await connectKeyConn({}, form({ provider: "slack", secret: "https://hooks.slack.com/services/T/B/x" }));
    expect(r.ok).toMatch(/Connected/);
    const conn = (await db.cosConnection.findFirst({ where: { orgId, provider: "slack" } }))!;
    expect(conn.status).toBe("verified"); expect(conn.accessTokenEnc).not.toContain("hooks.slack.com");
    expect((await testConn({}, form({ id: conn.id }))).ok).toMatch(/passed/);
    expect(calls.length).toBe(0); // webhook hosts are checked, never posted to
    expect((await disconnectConn({}, form({ id: conn.id }))).ok).toMatch(/destroyed/);
    const after = (await db.cosConnection.findUnique({ where: { id: conn.id } }))!;
    expect(after.status).toBe("disconnected"); expect(after.accessTokenEnc).toBeNull();
    expect((await testConn({}, form({ id: conn.id }))).error).toMatch(/Reconnect first/);
  });

  it("refuses a role without settings or automations rights, and another tenant's row, with a message", async () => {
    await signIn(rep, orgId);
    const gsc = (await db.cosConnection.findFirst({ where: { orgId, provider: "gsc" } }))!;
    expect((await testConn({}, form({ id: gsc.id }))).error).toBe("Forbidden.");
    await signIn(owner, orgId);
    const foreign = (await db.cosConnection.findFirst({ where: { orgId: otherOrg } }))!;
    expect((await testConn({}, form({ id: foreign.id }))).error).toBe("Connection not found.");
    expect((await disconnectConn({}, form({ id: foreign.id }))).error).toBe("Connection not found.");
  });

  it("old pages redirect to the unified page", async () => {
    expect((await follow(Promise.resolve().then(() => IntegrationsPage()))).redirect).toBe("/app/settings/connections");
    expect((await follow(Promise.resolve().then(() => WorkflowConnectionsPage()))).redirect).toBe("/app/settings/connections");
  });
});
