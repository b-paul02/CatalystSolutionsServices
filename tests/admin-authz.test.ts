import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Proves the F1/F3 rule: authorization is enforced INSIDE each mutating server
// action, not by the /admin middleware. These call the real action functions
// with a partner session and expect 403 — no HTTP layer, no middleware.

const jar = { value: undefined as string | undefined };
const users = new Map<string, { id: string; email: string; role: string; disabledAt: Date | null; partner: { id: string } | null }>();
const writes: string[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "partner_session" && jar.value ? { value: jar.value } : undefined) }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Any DB call at all is a failure: the guard must reject before touching data.
const boom = () => { writes.push("db"); throw new Error("DB must not be touched by an unauthorized caller"); };
vi.mock("@/lib/audit/db", () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.get(where.id ?? "") ?? [...users.values()].find((u) => u.email === where.email) ?? null,
      upsert: async ({ create }: { create: { email: string; role: string } }) => ({
        id: `admin-${create.email}`, email: create.email, role: create.role, disabledAt: null, partner: null,
      }),
      create: boom,
    },
    partnerApplication: { findUnique: boom, update: boom, updateMany: boom, create: boom },
    partner: { create: boom, findUnique: boom },
    commissionRate: { create: boom, findFirst: boom, findMany: boom, update: boom },
    commission: { create: boom, findFirst: boom, findMany: boom, findUnique: boom, update: boom },
    invoice: { create: boom, findUnique: boom },
    collection: { create: boom, findMany: boom },
    deal: { findUnique: boom, update: boom },
    auditLog: { create: boom, findMany: boom },
    $transaction: boom,
  },
}));
vi.mock("@/lib/partner/email", () => ({
  sendApplicationRejected: async () => {}, sendPartnerWelcome: async () => {}, sendInfoRequest: async () => {},
}));

const { createPartnerSession, ForbiddenError } = await import("@/lib/partner/auth");
const actions = await import("@/app/admin/partners/applications/actions");
const rateActions = await import("@/app/admin/partners/[id]/rate-actions");
const ledgerActions = await import("@/app/admin/partners/commissions/actions");
const statusActions = await import("@/app/admin/partners/[id]/status-actions");
const { GET: exportCsv } = await import("@/app/api/admin/partners/commissions/export/route");

function signInAs(id: string, role: string, partnerId: string | null) {
  users.set(id, { id, email: `${id}@example.com`, role, disabledAt: null, partner: partnerId ? { id: partnerId } : null });
  jar.value = createPartnerSession(id);
}

beforeEach(() => { users.clear(); jar.value = undefined; writes.length = 0; });

const MUTATIONS: [string, () => Promise<unknown>][] = [
  ["approveApplication", () => actions.approveApplication("app1", {
    rateBp: 3000, rateReason: "a reason long enough", markets: ["IN"], families: [],
    protectionDays: 90, quoteThresholdTier: "T2", legalName: "X",
  })],
  ["rejectApplication", () => actions.rejectApplication("app1", "competitor")],
  ["requestInfo", () => actions.requestInfo("app1", ["phone"], "please confirm")],
  ["setApplicationStatus", () => actions.setApplicationStatus("app1", "low_priority")],
  ["assignReviewer", () => actions.assignReviewer("app1", "u9")],
  ["addInternalNote", () => actions.addInternalNote("app1", "note")],
  ["bulkAction", () => actions.bulkAction(["app1"], "low_priority")],
  // F4 — the money path. A partner must never be able to move their own rate.
  ["changeRate", () => rateActions.changeRate("p1", {
    rateBp: 5000, effectiveFrom: "2026-09-01", reason: "raising my own rate",
  })],
  ["approvePendingRate", () => rateActions.approvePendingRate("p1", "rate1")],
  // F9 — the finance ledger. A partner must not be able to invoice, collect,
  // pay out, adjust or void their own commissions.
  ["recordInvoiceAction", () => ledgerActions.recordInvoiceAction("d1", "85000", "INV-1", "")],
  ["recordCollectionAction", () => ledgerActions.recordCollectionAction("i1", "85000", "NEFT", "R-1")],
  ["markPaidAction", () => ledgerActions.markPaidAction("c1", "NEFT-1")],
  ["createAdjustmentAction", () => ledgerActions.createAdjustmentAction("c1", "refund", "a good long reason", "")],
  ["voidCommissionsAction", () => ledgerActions.voidCommissionsAction("d1", "a good long reason")],
  // A partner must not be able to reactivate or suspend themselves.
  ["changePartnerStatus", () => statusActions.changePartnerStatus("p1", "active", "a good long reason")],
];

describe("admin mutations reject a partner with 403", () => {
  for (const [name, call] of MUTATIONS) {
    it(`${name} refuses a partner and touches no data`, async () => {
      signInAs("u1", "partner", "p1");
      const err = await call().catch((e: unknown) => e);
      expect(err, name).toBeInstanceOf(ForbiddenError);
      expect((err as { status: number }).status).toBe(403);
      expect(writes, "guard ran before any DB access").toEqual([]);
    });

    it(`${name} refuses an anonymous caller`, async () => {
      const err = await call().catch((e) => e);
      expect(err, name).toBeInstanceOf(ForbiddenError);
      expect(writes).toEqual([]);
    });
  }

  it("refuses finance on application decisions — admin surface only", async () => {
    signInAs("u2", "finance", null);
    await expect(actions.rejectApplication("app1", "competitor")).rejects.toBeInstanceOf(ForbiddenError);
    expect(writes).toEqual([]);
  });

  // The CSV export is a route handler OUTSIDE the /admin middleware matcher,
  // so it is the honest end-to-end test of the rule: a partner hitting an admin
  // endpoint gets an HTTP 403, with no reliance on middleware.
  it("returns HTTP 403 to a partner hitting the admin CSV export endpoint", async () => {
    signInAs("u1", "partner", "p1");
    const res = await exportCsv(
      new NextRequest("http://localhost/api/admin/partners/commissions/export"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(writes, "guard ran before any DB access").toEqual([]);
  });

  it("returns HTTP 403 to an anonymous caller on the export endpoint", async () => {
    const res = await exportCsv(
      new NextRequest("http://localhost/api/admin/partners/commissions/export"),
    );
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("lets finance through the export guard to the data layer", async () => {
    signInAs("u9", "finance", null);
    // Not a 403: the guard passed and the stubbed DB threw instead.
    await expect(
      exportCsv(new NextRequest("http://localhost/api/admin/partners/commissions/export")),
    ).rejects.toThrow("DB must not be touched");
    expect(writes).toEqual(["db"]);
  });

  it("lets an admin past the guard and on to the data layer", async () => {
    signInAs("u3", "admin", null);
    // Not a ForbiddenError: the guard passed and the (stubbed) DB threw instead.
    const err = await actions.rejectApplication("app1", "competitor").catch((e) => e);
    expect(err).not.toBeInstanceOf(ForbiddenError);
    expect(writes).toEqual(["db"]);
  });
});
