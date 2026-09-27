// AUDIT-ONLY verification checks — NOT part of the implementation test suite.
// Run: npx vitest run --config growthos-audit-evidence/vitest.audit.config.ts
// Target: the isolated local *_test database (same guard as tests/setup.ts). No provider is ever called:
// AI accounting is exercised with a local stub function, so nothing billable runs.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { CLIENT_ROLES, STAFF_ROLES, can, type Permission } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { metered } from "@/lib/os/ai";
import { readAsset, uploadAsset } from "@/lib/os/assets";
import { buildExport } from "@/lib/os/exporter";
import { createWorkItem, type WorkActor } from "@/lib/os/work";
import { creditTokens, tokenBalance } from "@/lib/leados/tokens";

const tag = `audit-${Date.now()}`;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001", "hex");
let orgA = "", orgB = "";

afterAll(async () => {
  await db.cosWorkItem.deleteMany({ where: { orgId: { in: [orgA, orgB] } } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.losUser.deleteMany({ where: { email: { startsWith: tag } } });
  await db.$disconnect();
});

describe("AUDIT §2 — client-operated AI tools", () => {
  it("NO client role holds any permission that an AI feature requires (so no client can run AI at all)", () => {
    // every AI entry point in the build requires one of these (grep: _os/actions.ts, _os/v2.ts, assets/actions.ts)
    const aiPerms: Permission[] = ["work.execute", "work.manage", "strategy.manage"];
    const clientCan = CLIENT_ROLES.flatMap((r) => aiPerms.filter((p) => can(r, p)).map((p) => `${r}:${p}`));
    const staffCan = STAFF_ROLES.flatMap((r) => aiPerms.filter((p) => can(r, p)).map((p) => `${r}:${p}`));
    expect(clientCan).toEqual([]); // ← no client-operated AI exists
    expect(staffCan.length).toBeGreaterThan(0); // AI is staff-only production tooling
  });

  it("no AI-tool entitlement concept exists on the entitlements object", async () => {
    orgA = (await db.losOrg.create({ data: { name: `${tag}-a`, demo: true } })).id;
    await db.cosWorkspace.create({ data: { orgId: orgA, kind: "client", demo: true } });
    const ent = await entitlements(orgA);
    expect(Object.keys(ent)).not.toContain("aiTools");
    expect(Object.keys(ent)).not.toContain("wallet");
    // aiCredits exists only inside the contract allowance blob
    expect(ent.allowances).toHaveProperty("aiCredits");
  });
});

describe("AUDIT §3 — AI wallet and accounting", () => {
  it("no wallet / ledger / quote / reservation / rate-card model exists in the schema", () => {
    const models = Object.keys(db).filter((k) => !k.startsWith("$") && !k.startsWith("_"));
    const walletish = models.filter((m) => /wallet|credit|quote|reservation|ratecard|grant/i.test(m));
    expect(walletish).toEqual([]);
    expect(models).toContain("cosAiUsage"); // recording only
  });

  it("AI usage is RECORDED but never CHECKED: it runs with a zero aiCredits allowance and no balance", async () => {
    // contract granting 0 aiCredits
    await db.cosContract.create({ data: { orgId: orgA, services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), allowances: JSON.stringify({ aiCredits: 0 }), status: "active", signedAt: new Date(), demo: true } });
    expect((await entitlements(orgA)).allowances.aiCredits).toBe(0);
    const before = await db.cosAiUsage.count({ where: { orgId: orgA } });
    // a stub stands in for the provider — nothing billable is called
    const out = await metered(orgA, "audit_probe", async () => "generated");
    expect(out).toBe("generated"); // ← executed despite a zero allowance
    const rows = await db.cosAiUsage.findMany({ where: { orgId: orgA } });
    expect(rows.length).toBe(before + 1);
    expect(rows[0].costMicros).toBeNull(); // unknown, not zero (prices unset)
  });

  it("run it 25 times over: still no balance, no reservation, nothing to overspend — accounting is one-way", async () => {
    await Promise.all(Array.from({ length: 25 }, () => metered(orgA, "audit_probe_concurrent", async () => 1)));
    const n = await db.cosAiUsage.count({ where: { orgId: orgA, feature: "audit_probe_concurrent" } });
    expect(n).toBe(25); // every call recorded; none refused, because there is no balance to refuse against
  });

  it("the only purchasable balance is the LeadOS LEAD token, which is a separate currency from AI usage", async () => {
    await creditTokens({ orgId: orgA, amount: 500, kind: "purchase", refId: `${tag}-purchase`, note: "audit" });
    expect(await tokenBalance(orgA)).toBe(500);
    // buying lead tokens changes no AI capability and no service entitlement
    const ent = await entitlements(orgA);
    expect(ent.allowances.aiCredits).toBe(0);
    expect([...ent.services]).toEqual(["content"]);
    expect(ent.modules.has("ads")).toBe(false);
  });
});

describe("AUDIT §9 — tenant isolation on the v2 surfaces", () => {
  it("assets and export refuse another tenant, and a client cannot create work", async () => {
    orgB = (await db.losOrg.create({ data: { name: `${tag}-b`, demo: true } })).id;
    await db.cosWorkspace.create({ data: { orgId: orgB, kind: "client", demo: true } });
    const uid = (await db.losUser.create({ data: { email: `${tag}-u@example.com`, demo: true } })).id;
    const staffA: WorkActor = { orgId: orgA, userId: uid, role: "cgo_lead" };
    const staffB: WorkActor = { orgId: orgB, userId: uid, role: "cgo_lead" };
    const clientA: WorkActor = { orgId: orgA, userId: uid, role: "owner" };

    process.env.ASSET_STORAGE = "local";
    const asset = await uploadAsset(staffA, { name: "a.png", mime: "image/png", bytes: PNG });
    await expect(readAsset(staffB, asset.id)).rejects.toThrow(); // cross-tenant read refused
    await expect(readAsset(clientA, asset.id)).resolves.toBeTruthy(); // own tenant, client-visible

    const exp = await buildExport(staffB);
    expect(JSON.stringify(exp)).not.toContain("a.png"); // export is tenant-scoped

    // a client role cannot create delivery work (staff-only capability)
    await expect(createWorkItem(clientA, { title: "client-made work" })).rejects.toThrow("Forbidden");
  });
});

describe("AUDIT §8 — zero balance preserves manual function", () => {
  it("with no AI and no tokens, a client can still raise a request and staff can still deliver by hand", async () => {
    const uid = (await db.losUser.create({ data: { email: `${tag}-v@example.com`, demo: true } })).id;
    const clientB: WorkActor = { orgId: orgB, userId: uid, role: "owner" };
    const staffB: WorkActor = { orgId: orgB, userId: uid, role: "cgo_lead" };
    expect(await tokenBalance(orgB)).toBe(0);
    const req = await createWorkItem(clientB, { title: "Please add a landing page", type: "change_request" });
    expect(req.type).toBe("change_request"); // client request path works at zero balance
    const w = await createWorkItem(staffB, { title: "Manual delivery" });
    expect(w.id).toBeTruthy();
  });
});
