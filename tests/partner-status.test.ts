import { describe, expect, it, vi, beforeEach } from "vitest";

type P = { id: string; status: string; legalName: string };
const partners: P[] = [];
const auditRows: { action: string; before: string | null; after: string | null; reason: string | null }[] = [];

vi.mock("@/lib/audit/db", () => ({
  db: {
    partner: {
      // A copy, as Prisma returns detached rows — a live reference would let the
      // later update mutate what the code under test already read.
      findUnique: async ({ where }: { where: { id: string } }) => {
        const p = partners.find((x) => x.id === where.id);
        return p ? { ...p } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const p = partners.find((x) => x.id === where.id)!;
        p.status = data.status;
        return { ...p };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; beforeJson: string | null; afterJson: string | null; reason: string | null } }) => {
        auditRows.push({ action: data.action, before: data.beforeJson, after: data.afterJson, reason: data.reason });
        return {};
      },
    },
  },
}));

const { setPartnerStatus, PARTNER_STATUSES, PartnerStatusError } = await import("@/lib/partner/partner-status");

const actor = { userId: "a1", email: "admin@x.com", role: "admin" as const, partnerId: null };
const REASON = "Agreement signed and returned on 21 August.";

beforeEach(() => {
  partners.length = 0; auditRows.length = 0;
  partners.push({ id: "p1", status: "pending_agreement", legalName: "QA Partner" });
});

describe("setPartnerStatus", () => {
  it("activates a pending partner and writes the audit trail", async () => {
    const out = await setPartnerStatus({ actor, partnerId: "p1", status: "active", reason: REASON });
    expect(out.status).toBe("active");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "status_changed", reason: REASON });
    expect(auditRows[0].before).toContain("pending_agreement");
    expect(auditRows[0].after).toContain("active");
  });

  it("covers every legal status", async () => {
    for (const status of PARTNER_STATUSES.filter((s) => s !== "pending_agreement")) {
      partners[0].status = "pending_agreement";
      await setPartnerStatus({ actor, partnerId: "p1", status, reason: REASON });
      expect(partners[0].status).toBe(status);
    }
  });

  it("rejects a status that does not exist", async () => {
    await expect(setPartnerStatus({ actor, partnerId: "p1", status: "vip", reason: REASON }))
      .rejects.toThrow(PartnerStatusError);
    expect(partners[0].status).toBe("pending_agreement");
    expect(auditRows).toHaveLength(0);
  });

  it("requires a written reason", async () => {
    await expect(setPartnerStatus({ actor, partnerId: "p1", status: "active", reason: "ok" }))
      .rejects.toThrow(PartnerStatusError);
    expect(partners[0].status).toBe("pending_agreement");
  });

  it("refuses a no-op change rather than writing noise into the audit log", async () => {
    await expect(setPartnerStatus({ actor, partnerId: "p1", status: "pending_agreement", reason: REASON }))
      .rejects.toThrow(PartnerStatusError);
    expect(auditRows).toHaveLength(0);
  });

  it("reports a missing partner plainly", async () => {
    await expect(setPartnerStatus({ actor, partnerId: "nope", status: "active", reason: REASON }))
      .rejects.toThrow("Partner not found.");
  });

  it("suspension round-trips back to active", async () => {
    await setPartnerStatus({ actor, partnerId: "p1", status: "active", reason: REASON });
    await setPartnerStatus({ actor, partnerId: "p1", status: "suspended", reason: "Compliance query raised." });
    await setPartnerStatus({ actor, partnerId: "p1", status: "active", reason: "Query resolved in full." });
    expect(partners[0].status).toBe("active");
    expect(auditRows).toHaveLength(3);
  });
});
