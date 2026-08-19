import { describe, expect, it } from "vitest";
import { looksLikeDomain, normaliseDomain } from "@/lib/partner/domain";

describe("normaliseDomain", () => {
  it("collapses the ways two partners might type the same site", () => {
    const forms = [
      "acme.co.in", "ACME.co.in", "www.acme.co.in", "WWW.Acme.Co.In",
      "http://acme.co.in", "https://acme.co.in", "https://www.acme.co.in",
      "https://www.acme.co.in/", "https://www.acme.co.in/pricing",
      "https://www.acme.co.in/pricing?ref=partner#top", "  https://ACME.co.in/x  ",
      "acme.co.in:443", "acme.co.in.",
    ];
    for (const f of forms) expect(normaliseDomain(f), f).toBe("acme.co.in");
  });

  it("keeps genuinely different sites apart", () => {
    expect(normaliseDomain("acme.co.in")).not.toBe(normaliseDomain("acme.com"));
    expect(normaliseDomain("shop.acme.com")).not.toBe(normaliseDomain("acme.com"));
    expect(normaliseDomain("acme-group.com")).not.toBe(normaliseDomain("acmegroup.com"));
  });

  it("strips a pasted email down to its domain", () => {
    expect(normaliseDomain("priya@acme.co.in")).toBe("acme.co.in");
    expect(normaliseDomain("mailto:priya@acme.co.in")).toBe("acme.co.in");
  });

  it("handles empty and whitespace input without throwing", () => {
    expect(normaliseDomain("")).toBe("");
    expect(normaliseDomain("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normaliseDomain("https://WWW.Acme.co.in/pricing");
    expect(normaliseDomain(once)).toBe(once);
  });
});

describe("looksLikeDomain", () => {
  it("accepts real shapes", () => {
    for (const d of ["acme.com", "acme.co.in", "sub.acme.co.uk", "acme-group.io"]) {
      expect(looksLikeDomain(d), d).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const d of ["", "acme", "acme..com", "acme .com", "http://acme.com"]) {
      expect(looksLikeDomain(d), d).toBe(false);
    }
  });
});
