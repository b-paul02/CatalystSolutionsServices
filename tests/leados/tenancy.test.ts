// THE cross-tenant negative test (blueprint Phase 1 exit criteria), run against
// the real database. A tampered org cookie must never grant another tenant's
// context; permissions must gate; revoked/disabled credentials must fail.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => ({ get: () => null }),
}));

const { db } = await import("@/lib/audit/db");
const { createLosSession, requireOrg, requireLosUser, LosAuthError, LOS_COOKIE } = await import("@/lib/leados/auth");
const { sha256 } = await import("@/lib/leados/crypto");

const tag = `tenancy-${Date.now()}`;
let orgA: string, orgB: string, userA: string, userB: string, tokenA: string;

beforeAll(async () => {
  const a = await db.losUser.create({ data: { email: `${tag}-a@example.com`, demo: true, emailVerifiedAt: new Date() } });
  const b = await db.losUser.create({ data: { email: `${tag}-b@example.com`, demo: true, emailVerifiedAt: new Date() } });
  userA = a.id; userB = b.id;
  const oa = await db.losOrg.create({ data: { name: `${tag}-OrgA`, demo: true, memberships: { create: { userId: a.id, role: "analyst" } } } });
  const ob = await db.losOrg.create({ data: { name: `${tag}-OrgB`, demo: true, memberships: { create: { userId: b.id, role: "owner" } } } });
  orgA = oa.id; orgB = ob.id;
  tokenA = await createLosSession(a.id);
});

afterAll(async () => {
  await db.losSession.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await db.losMembership.deleteMany({ where: { orgId: { in: [orgA, orgB] } } });
  await db.losOrg.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.losUser.deleteMany({ where: { id: { in: [userA, userB] } } });
  await db.$disconnect();
});

describe("tenant isolation", () => {
  it("no cookie → 401", async () => {
    jar.clear();
    await expect(requireLosUser()).rejects.toThrow(LosAuthError);
  });

  it("valid session resolves the user's own org", async () => {
    jar.clear();
    jar.set(LOS_COOKIE, tokenA);
    const actor = await requireOrg();
    expect(actor.orgId).toBe(orgA);
    expect(actor.role).toBe("analyst");
  });

  it("a tampered org cookie pointing at another tenant is ignored", async () => {
    jar.clear();
    jar.set(LOS_COOKIE, tokenA);
    jar.set("los_org", orgB); // user A is NOT a member of org B
    const actor = await requireOrg();
    expect(actor.orgId).toBe(orgA); // falls back to their own membership
  });

  it("permission gating: analyst cannot manage the team", async () => {
    jar.clear();
    jar.set(LOS_COOKIE, tokenA);
    await expect(requireOrg("team.manage")).rejects.toThrow(LosAuthError);
  });

  it("a revoked session is dead", async () => {
    jar.clear();
    jar.set(LOS_COOKIE, tokenA);
    await db.losSession.updateMany({ where: { tokenHash: sha256(tokenA) }, data: { revokedAt: new Date() } });
    await expect(requireLosUser()).rejects.toThrow(LosAuthError);
  });

  it("a disabled user is dead even with a fresh session", async () => {
    const token = await createLosSession(userB);
    await db.losUser.update({ where: { id: userB }, data: { disabledAt: new Date() } });
    jar.clear();
    jar.set(LOS_COOKIE, token);
    await expect(requireLosUser()).rejects.toThrow(LosAuthError);
  });

  it("an mfa-pending session cannot pass requireLosUser", async () => {
    await db.losUser.update({ where: { id: userA }, data: { mfaEnabledAt: new Date() } });
    const token = await createLosSession(userA, { mfaPending: true });
    jar.clear();
    jar.set(LOS_COOKIE, token);
    await expect(requireLosUser()).rejects.toThrow(LosAuthError);
  });
});
