// Included AI credits, verified through the ACTUAL proposal action (operator) and signing action (client owner):
// granted once under concurrency and repetition, never orphaned by a failed signature, matching the accepted proposal,
// never derived from the historical placeholder allowance, and never repeated by a revised scope without an explicit tick.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, jar, signIn } from "./entry-harness";
import { createSession } from "@/lib/audit/adminAuth";
import { proposeContract } from "@/app/(site)/admin/os/actions";
import { signContract } from "@/app/app/(shell)/_os/actions";
import { walletInvariant, walletSummary } from "@/lib/os/credits";
import { entitlements } from "@/lib/os/entitlements";
import { createEngagement } from "@/lib/os/engagement";
import { PROGRAM_OPTIONS } from "@/lib/os/catalog";

process.env.ADMIN_ACCOUNTS = "ops@test.invalid:unused";
const tag = `cs-${Date.now()}`;
let orgId: string, ownerId: string, engagementId: string, firstContractId = "";
const asOperator = async () => { jar.clear(); jar.set("admin_session", await createSession("ops@test.invalid")); };
const asOwner = () => signIn(ownerId, orgId);
const f = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x); return fd; };
const latest = () => db.cosContract.findFirstOrThrow({ where: { orgId }, orderBy: { createdAt: "desc" } });

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "prospect", demo: true } });
  ownerId = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: ownerId, role: "owner" } });
  engagementId = (await createEngagement(orgId, null, { name: `${tag} engagement`, demo: true }, "platform_admin")).id;
});
afterAll(async () => {
  await db.cosWorkItem.deleteMany({ where: { orgId } });
  for (const m of ["losAuditEvent", "cosContract", "cosWorkspace", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId } });
  await db.losSession.deleteMany({ where: { userId: ownerId } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.losUser.deleteMany({ where: { id: ownerId } });
});

describe("included credits: proposal → signature", () => {
  it("five concurrent signatures and a later repeat: one acceptance, one grant, matching the proposal; the tier placeholder grants nothing", async () => {
    await asOperator();
    // a PROGRAM proposal carries the historical tier placeholder (allowances.aiCredits = 500 for "growth") next to the explicit number
    const r = await proposeContract({}, f({ orgId, kind: "program", programSlug: PROGRAM_OPTIONS[0].slug, tier: "growth", services: ["content"], aiTools: ["linkedin_post", "seo_brief"], includedAiCredits: "40", includedAiCreditsExpireDays: "30", engagementId }));
    expect(r.error).toBeUndefined();
    const c = await latest(); firstContractId = c.id;
    expect(JSON.parse(c.allowances)).toMatchObject({ aiCredits: 500, includedAiCredits: 40, includedAiCreditsExpireDays: 30 });
    expect((await walletSummary(orgId)).available).toBe(0);
    await asOwner();
    const results = await Promise.all(Array.from({ length: 5 }, () => signContract({}, form({ contractId: c.id, decision: "sign" }))));
    expect(results.filter((x) => x.ok).length).toBe(1);
    expect(results.filter((x) => /already decided/i.test(x.error ?? "")).length).toBe(4);
    expect((await signContract({}, form({ contractId: c.id, decision: "sign" }))).error).toMatch(/already decided/i);
    const w = await walletSummary(orgId);
    expect(w).toMatchObject({ available: 40, byKind: { included: 40, purchased: 0, promotional: 0 } }); // 40, not 500, not 540
    expect(Math.round((w.expiring[0].expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(30);
    expect(await db.cosCreditGrant.count({ where: { orgId } })).toBe(1);
    expect((await db.cosCreditGrant.findFirstOrThrow({ where: { orgId } })).sourceRef).toBe(`contract:${c.id}`);
    expect([...(await entitlements(orgId)).aiTools].sort()).toEqual(["linkedin_post", "seo_brief"]); // tool access = the accepted proposal
    expect(await db.cosEngagementEvent.count({ where: { engagementId, kind: "stage", toValue: "accepted" } })).toBe(1);
    expect((await walletInvariant(orgId)).ok).toBe(true);
  });

  it("a revised scope cannot repeat the allowance by accident: blocked without the explicit tick, 0 is fine, ticked = a separate additional grant", async () => {
    await asOperator();
    const again = await proposeContract({}, f({ orgId, kind: "change", services: ["content"], aiTools: ["linkedin_post"], includedAiCredits: "40", engagementId }));
    expect(again.error).toMatch(/already has 1 scope\(s\) that include AI credits/i);
    expect((await proposeContract({}, f({ orgId, kind: "change", services: ["content", "social"], aiTools: ["linkedin_post"], engagementId }))).error).toBeUndefined();
    const revised = await latest();
    expect(JSON.parse(revised.allowances).includedAiCredits).toBeUndefined();
    await asOwner();
    expect((await signContract({}, form({ contractId: revised.id, decision: "sign" }))).ok).toBeTruthy();
    expect((await walletSummary(orgId)).available).toBe(40); // unchanged
    await asOperator();
    expect((await proposeContract({}, f({ orgId, kind: "addon", services: ["content"], aiTools: ["linkedin_post"], includedAiCredits: "25", includedAiCreditsAdditional: "on", engagementId }))).error).toBeUndefined();
    const addon = await latest();
    await asOwner();
    await signContract({}, form({ contractId: addon.id, decision: "sign" }));
    expect((await walletSummary(orgId)).available).toBe(65);
    expect((await db.cosCreditGrant.findMany({ where: { orgId }, select: { sourceRef: true } })).map((g) => g.sourceRef).sort()).toEqual([`contract:${addon.id}`, `contract:${firstContractId}`].sort());
  });

  it("a signature that fails leaves NOTHING behind — still proposed, no grant, workspace untouched — and signing later grants once", async () => {
    const before = await walletSummary(orgId);
    // fixture: an allowance the ledger refuses (over its hard ceiling), so the grant step throws INSIDE the signing transaction
    const broken = await db.cosContract.create({ data: { orgId, engagementId, kind: "addon", status: "proposed", services: "[]", modules: "[]", aiTools: JSON.stringify(["linkedin_post"]), allowances: JSON.stringify({ includedAiCredits: 200_000_000 }), demo: true } });
    await db.cosWorkspace.update({ where: { orgId }, data: { kind: "prospect" } });
    await asOwner();
    expect((await signContract({}, form({ contractId: broken.id, decision: "sign" }))).error).toMatch(/whole number/i);
    expect((await db.cosContract.findUniqueOrThrow({ where: { id: broken.id } })).status).toBe("proposed");
    expect((await db.cosWorkspace.findUniqueOrThrow({ where: { orgId } })).kind).toBe("prospect");
    expect(await db.cosCreditGrant.count({ where: { sourceRef: `contract:${broken.id}` } })).toBe(0);
    expect((await walletSummary(orgId)).available).toBe(before.available);
    await db.cosContract.update({ where: { id: broken.id }, data: { allowances: JSON.stringify({ includedAiCredits: 10 }) } }); // the operator corrects the proposal
    expect((await signContract({}, form({ contractId: broken.id, decision: "sign" }))).ok).toBeTruthy();
    expect((await walletSummary(orgId)).available).toBe(before.available + 10);
    expect((await walletInvariant(orgId)).ok).toBe(true);
  });
});
