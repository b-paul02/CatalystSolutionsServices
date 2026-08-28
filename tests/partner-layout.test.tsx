import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression guard for an infinite redirect: the partner layout wraps
// /partner/login, so if it ever redirects there again, that page sends itself
// in a loop. Anyone holding an admin session in the same browser hit it.

const jar = { partner: undefined as string | undefined, admin: undefined as string | undefined };
const users = new Map<string, { id: string; email: string; role: string; disabledAt: Date | null; partner: { id: string } | null }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) =>
      n === "partner_session" && jar.partner ? { value: jar.partner }
      : n === "admin_session" && jar.admin ? { value: jar.admin }
      : undefined,
  }),
}));

// Any redirect out of the layout is the bug — make it loud.
class RedirectCalled extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new RedirectCalled(to); },
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

vi.mock("@/lib/audit/adminAuth", () => ({
  SESSION_COOKIE: "admin_session",
  verifySession: async (c: string | undefined) => (c ? "admin@catalyst.test" : null),
}));

const { createPartnerSession } = await import("@/lib/partner/auth");
const PartnerLayout = (await import("@/app/(site)/partner/layout")).default;

function signInPartner(partnerId: string | null) {
  users.set("u1", { id: "u1", email: "p@x.com", role: "partner", disabledAt: null, partner: partnerId ? { id: partnerId } : null });
  jar.partner = createPartnerSession("u1");
}

beforeEach(() => { users.clear(); jar.partner = undefined; jar.admin = undefined; });

const children = "PAGE" as unknown as React.ReactNode;

/** Collects the text nodes out of a React tree — JSON.stringify hits circular refs. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const el = node as { props?: { children?: unknown } };
  return el.props ? textOf(el.props.children) : "";
}

describe("partner layout never redirects", () => {
  it("renders the login page for an admin instead of looping", async () => {
    jar.admin = "an-admin-session";
    await expect(PartnerLayout({ children })).resolves.toBeDefined();
  });

  it("renders for an anonymous visitor", async () => {
    await expect(PartnerLayout({ children })).resolves.toBeDefined();
  });

  it("renders for a partner whose record is missing", async () => {
    signInPartner(null);
    await expect(PartnerLayout({ children })).resolves.toBeDefined();
  });

  it("renders the portal chrome for a real partner", async () => {
    signInPartner("p1");
    const out = await PartnerLayout({ children });
    expect(textOf(out)).toContain("Dashboard");
    expect(textOf(out)).toContain("PAGE");
  });

  it("shows no portal chrome to a non-partner", async () => {
    jar.admin = "an-admin-session";
    const out = await PartnerLayout({ children });
    expect(textOf(out)).not.toContain("Dashboard");
    expect(textOf(out)).toContain("PAGE"); // the page still renders, just bare
  });
});
