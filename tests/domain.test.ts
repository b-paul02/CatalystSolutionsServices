import { describe, expect, it } from "vitest";
import {
  displayIdentity, isPhoneIdentity, looksLikeDomain, normaliseDomain, normalisePhone, phoneIdentityKey,
} from "@/lib/partner/domain";

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

describe("social and profile handles", () => {
  it("keeps the handle so two Instagram-only businesses stay distinct", () => {
    expect(normaliseDomain("https://www.instagram.com/acmeclinic/")).toBe("instagram.com/acmeclinic");
    expect(normaliseDomain("instagram.com/acmeclinic?igsh=xyz")).toBe("instagram.com/acmeclinic");
    expect(normaliseDomain("instagram.com/acmeclinic")).not.toBe(normaliseDomain("instagram.com/otherclinic"));
  });

  it("skips structural path segments on facebook and linkedin", () => {
    expect(normaliseDomain("facebook.com/pages/AcmeClinic")).toBe("facebook.com/acmeclinic");
    expect(normaliseDomain("https://www.linkedin.com/company/acme-clinic/")).toBe("linkedin.com/acme-clinic");
  });

  it("still collapses ordinary websites to the bare domain", () => {
    expect(normaliseDomain("https://www.acme.co.in/pricing?ref=x")).toBe("acme.co.in");
  });

  it("a bare social host with no handle stays just the host", () => {
    expect(normaliseDomain("instagram.com")).toBe("instagram.com");
  });
});

describe("phone identity", () => {
  it("collides the ways the same number gets written", () => {
    for (const form of ["+91 98765 43210", "098765 43210", "98765-43210", "(+91) 9876543210"]) {
      expect(normalisePhone(form), form).toBe("9876543210");
    }
  });

  it("keeps genuinely different numbers apart", () => {
    expect(normalisePhone("+91 98765 43210")).not.toBe(normalisePhone("+91 98765 43211"));
  });

  it("rejects junk too short to be a phone", () => {
    expect(normalisePhone("123")).toBe("");
    expect(phoneIdentityKey("abc")).toBe("");
  });

  it("builds a prefixed key that is recognisable and never a fake URL on screen", () => {
    const key = phoneIdentityKey("+91 98765 43210");
    expect(key).toBe("phone:9876543210");
    expect(isPhoneIdentity(key)).toBe(true);
    expect(isPhoneIdentity("acme.co.in")).toBe(false);
    expect(displayIdentity(key)).toContain("phone ending 3210");
    expect(displayIdentity("acme.co.in")).toBe("acme.co.in");
  });

  it("a phone key can never collide with a real domain", () => {
    // "phone:" contains a colon, which normaliseDomain strips from ports only —
    // no website input can normalise to a phone-prefixed key.
    expect(normaliseDomain("phone:9876543210")).not.toContain("phone:");
  });
});
