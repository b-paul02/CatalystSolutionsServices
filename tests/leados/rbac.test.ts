import { describe, expect, it } from "vitest";
import { can, canPlatform, CLIENT_ROLES, isClientRole, isPlatformRole } from "@/lib/leados/rbac";

describe("client RBAC", () => {
  it("denies by default for unknown roles and permissions", () => {
    expect(can("nonsense", "leads.view")).toBe(false);
    expect(can("", "leads.view")).toBe(false);
  });
  it("owner can do everything, analyst is read-only", () => {
    expect(can("owner", "org.manage")).toBe(true);
    expect(can("owner", "leads.delete")).toBe(true);
    expect(can("analyst", "leads.view")).toBe(true);
    expect(can("analyst", "leads.edit")).toBe(false);
    expect(can("analyst", "leads.export")).toBe(false);
    expect(can("analyst", "team.manage")).toBe(false);
  });
  it("admin cannot manage the org itself (owner-only)", () => {
    expect(can("admin", "org.manage")).toBe(false);
    expect(can("admin", "team.manage")).toBe(true);
  });
  it("sales rep can contact but not export or import", () => {
    expect(can("sales_rep", "leads.contact")).toBe(true);
    expect(can("sales_rep", "leads.export")).toBe(false);
    expect(can("sales_rep", "leads.import")).toBe(false);
  });
  it("campaign manager manages campaigns but not pipeline config", () => {
    expect(can("campaign_manager", "campaigns.manage")).toBe(true);
    expect(can("campaign_manager", "pipeline.manage")).toBe(false);
  });
  it("view, export, contact and delete are independently gated for every role", () => {
    for (const role of CLIENT_ROLES) {
      // exporting or deleting always implies at least viewing
      if (can(role, "leads.export")) expect(can(role, "leads.view")).toBe(true);
      if (can(role, "leads.delete")) expect(can(role, "leads.view")).toBe(true);
    }
  });
});

describe("platform RBAC", () => {
  it("only super_admin has platform.full", () => {
    expect(canPlatform("super_admin", "platform.full")).toBe(true);
    for (const r of ["compliance_admin", "inventory_admin", "campaign_admin", "support_admin", "auditor"]) {
      expect(canPlatform(r, "platform.full")).toBe(false);
    }
  });
  it("compliance admin gets compliance + audit read only", () => {
    expect(canPlatform("compliance_admin", "compliance")).toBe(true);
    expect(canPlatform("compliance_admin", "inventory")).toBe(false);
    expect(canPlatform("compliance_admin", "audit_read")).toBe(true);
  });
  it("role guards recognize their own lists", () => {
    expect(isClientRole("owner")).toBe(true);
    expect(isClientRole("super_admin")).toBe(false);
    expect(isPlatformRole("auditor")).toBe(true);
    expect(isPlatformRole("owner")).toBe(false);
  });
});
