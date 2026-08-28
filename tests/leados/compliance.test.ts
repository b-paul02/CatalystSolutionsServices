import { describe, expect, it } from "vitest";
import { decideUse, isSensitiveFieldName, PROHIBITED_PURPOSES } from "@/lib/leados/compliance";

const base = {
  permittedPurposes: ["sales_contact"],
  permittedChannels: ["call", "whatsapp"],
  purpose: "sales_contact",
};

describe("purpose compatibility engine", () => {
  it("allows an exact purpose + channel match", () => {
    expect(decideUse({ ...base, channel: "whatsapp" })).toEqual({ decision: "allow" });
  });
  it("allows purpose-only checks (allocation time, no channel yet)", () => {
    expect(decideUse(base)).toEqual({ decision: "allow" });
  });
  it("rejects a non-permitted channel even when the purpose matches", () => {
    expect(decideUse({ ...base, channel: "email" })).toMatchObject({ decision: "reject", reason: "channel_not_permitted" });
  });
  it("rejects suppressed, withdrawn, and expired records", () => {
    expect(decideUse({ ...base, suppressed: true })).toMatchObject({ decision: "reject", reason: "suppressed" });
    expect(decideUse({ ...base, withdrawnAt: new Date() })).toMatchObject({ decision: "reject", reason: "consent_withdrawn" });
    expect(decideUse({ ...base, retentionExpiresAt: new Date(Date.now() - 1000) })).toMatchObject({ decision: "reject", reason: "retention_expired" });
  });
  it("suppression outranks everything else", () => {
    expect(decideUse({ ...base, suppressed: true, purpose: "sales_contact", channel: "call" }).decision).toBe("reject");
  });
  it("rejects unrelated purposes outright", () => {
    expect(decideUse({ ...base, purpose: "survey" })).toMatchObject({ decision: "reject", reason: "purpose_not_permitted" });
  });
  it("escalates arguably-compatible purposes to human review, never auto-allows", () => {
    expect(decideUse({ ...base, purpose: "service_updates" })).toMatchObject({ decision: "review" });
    expect(decideUse({ permittedPurposes: ["marketing"], permittedChannels: [], purpose: "sales_contact" })).toMatchObject({ decision: "review" });
  });
  it("rejects every prohibited purpose regardless of permissions", () => {
    for (const p of PROHIBITED_PURPOSES) {
      expect(decideUse({ permittedPurposes: [p], permittedChannels: ["call"], purpose: p }).decision).toBe("reject");
    }
  });
  it("rejects records with no permitted purposes at all", () => {
    expect(decideUse({ permittedPurposes: [], permittedChannels: [], purpose: "sales_contact" })).toMatchObject({ decision: "reject", reason: "no_permitted_purposes" });
  });
});

describe("sensitive field detection", () => {
  it("flags sensitive names, passes normal ones", () => {
    for (const bad of ["Religion", "aadhaar_number", "Health Condition", "PAN", "political_party", "card number"]) {
      expect(isSensitiveFieldName(bad)).toBe(true);
    }
    for (const ok of ["First name", "email", "budget", "company", "city"]) {
      expect(isSensitiveFieldName(ok)).toBe(false);
    }
  });
});
