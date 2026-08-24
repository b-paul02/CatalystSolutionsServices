import { describe, expect, it, vi, beforeEach } from "vitest";

// The guards read the session from cookies and the user from the DB; both are
// stubbed so these tests exercise the authorization logic itself.
const jar = { value: undefined as string | undefined, admin: undefined as string | undefined };
const users = new Map<string, { id: string; email: string; role: string; disabledAt: Date | null; partner: { id: string } | null }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "partner_session" && jar.value) return { value: jar.value };
      if (name === "admin_session" && jar.admin) return { value: jar.admin };
      return undefined;
    },
  }),
}));

vi.mock("@/lib/audit/adminAuth", () => ({
  SESSION_COOKIE: "admin_session",
  verifySession: async (c: string | undefined) => (c === "valid-admin-session" ? "boss@catalyst.test" : null),
}));

vi.mock("@/lib/audit/db", () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.get(where.id ?? "") ?? [...users.values()].find((u) => u.email === where.email) ?? null,
      upsert: async ({ create }: { create: { email: string; role: string } }) => ({
        id: `admin-${create.email}`, email: create.email, role: create.role, disabledAt: null, partner: null,
      }),
    },
  },
}));

const {
  createPartnerSession, requireAdmin, requireFinance, requirePartner, requireRole,
  assertOwns, ForbiddenError, hashPassword, verifyPassword,
} = await import("@/lib/partner/auth");

function signInAs(id: string, role: string, partnerId: string | null) {
  users.set(id, { id, email: `${id}@example.com`, role, disabledAt: null, partner: partnerId ? { id: partnerId } : null });
  jar.value = createPartnerSession(id);
}

beforeEach(() => { users.clear(); jar.value = undefined; jar.admin = undefined; });

describe("role guards", () => {
  it("denies a partner on admin surfaces with a 403", async () => {
    signInAs("u1", "partner", "p1");
    const err = await requireAdmin().catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.status).toBe(403);
  });

  it("denies a partner on the finance ledger", async () => {
    signInAs("u1", "partner", "p1");
    await expect(requireFinance()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies an anonymous visitor", async () => {
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePartner()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a disabled user", async () => {
    signInAs("u1", "partner", "p1");
    users.get("u1")!.disabledAt = new Date();
    await expect(requirePartner()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a forged session cookie", async () => {
    signInAs("u1", "admin", null);
    jar.value = "u1.not-a-real-signature";
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows admin on admin surfaces and on finance", async () => {
    signInAs("u2", "admin", null);
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
    await expect(requireFinance()).resolves.toMatchObject({ role: "admin" });
  });

  it("denies staff roles the partner surface", async () => {
    signInAs("u3", "finance", null);
    await expect(requirePartner()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies deal_desk the admin surface", async () => {
    signInAs("u4", "deal_desk", null);
    await expect(requireRole("admin", "super_admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a stale partner cookie does not shadow a valid admin session", async () => {
    signInAs("u1", "partner", "p1");
    jar.admin = "valid-admin-session";
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin", email: "boss@catalyst.test" });
    // and the partner surface still sees the partner, not the admin
    await expect(requirePartner()).resolves.toMatchObject({ role: "partner", partnerId: "p1" });
  });

  it("an admin cookie alone does not grant partner surfaces", async () => {
    jar.admin = "valid-admin-session";
    await expect(requirePartner()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });

  it("denies a partner without a partner record", async () => {
    signInAs("u5", "partner", null);
    await expect(requirePartner()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ownership", () => {
  const partnerActor = { userId: "u1", email: "a@b.c", role: "partner" as const, partnerId: "p1" };

  it("lets a partner touch their own rows", () => {
    expect(() => assertOwns(partnerActor, "p1")).not.toThrow();
  });

  it("blocks a partner from another partner's rows", () => {
    expect(() => assertOwns(partnerActor, "p2")).toThrow(ForbiddenError);
    expect(() => assertOwns(partnerActor, null)).toThrow(ForbiddenError);
  });

  it("lets staff through", () => {
    expect(() => assertOwns({ ...partnerActor, role: "admin", partnerId: null }, "p2")).not.toThrow();
  });
});

describe("passwords", () => {
  it("round-trips and rejects the wrong password", () => {
    const stored = hashPassword("correct horse");
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong horse", stored)).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });

  it("salts — the same password hashes differently each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});
