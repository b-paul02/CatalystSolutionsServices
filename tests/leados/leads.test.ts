import { describe, expect, it } from "vitest";
import { csvCell, normalizeDomain, normalizeEmail, normalizePhone, suggestMapping, toCsv, buildRow } from "@/lib/leados/leads";
import { parseCsv } from "@/lib/leados/csv";

describe("normalization", () => {
  it("emails", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
  it("phones — India and US launch markets", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("098765 43210")).toBe("+919876543210");
    expect(normalizePhone("91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhone("(212) 555-0173")).toBe("+12125550173");
    expect(normalizePhone("1 212 555 0173")).toBe("+12125550173");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("domains", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeDomain("example.co.in")).toBe("example.co.in");
    expect(normalizeDomain("not a domain")).toBeNull();
  });
});

describe("csv parser", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    const text = '﻿name,note\r\n"Doe, Jane","She said ""hi"""\r\nplain,line\n';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'She said "hi"'],
      ["plain", "line"],
    ]);
  });
  it("handles newlines inside quoted cells", () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([["a", "b"], ["line1\nline2", "x"]]);
  });
  it("respects the row cap", () => {
    const big = "h\n" + Array.from({ length: 100 }, (_, i) => `r${i}`).join("\n");
    expect(parseCsv(big, 10)).toHaveLength(10);
  });
});

describe("mapping suggestion", () => {
  it("maps common headers", () => {
    const m = suggestMapping(["First Name", "E-mail", "Mobile Number", "Company", "Job Title"], "b2b");
    expect(m).toMatchObject({
      "First Name": "firstName",
      "E-mail": "email",
      "Mobile Number": "phone",
      "Company": "companyName",
      "Job Title": "jobTitle",
    });
  });
  it("does not offer b2b fields for b2c imports", () => {
    const m = suggestMapping(["Company", "Interested In"], "b2c");
    expect(m["Company"]).toBeUndefined();
    expect(m["Interested In"]).toBe("productInterest");
  });
  it("never double-assigns a field", () => {
    const m = suggestMapping(["Email", "Work Email"], "b2b");
    expect(Object.values(m).filter((v) => v === "email")).toHaveLength(1);
  });
});

describe("buildRow", () => {
  it("applies mapping and normalizes contact points", () => {
    const r = buildRow(["Name", "Mail", "Ph"], ["Asha", "ASHA@x.com", "9876543210"], { Name: "firstName", Mail: "email", Ph: "phone" });
    expect(r.fields.firstName).toBe("Asha");
    expect(r.normalizedEmail).toBe("asha@x.com");
    expect(r.normalizedPhone).toBe("+919876543210");
  });
});

describe("csv export safety", () => {
  it("neutralizes formula injection", () => {
    expect(csvCell("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-2")).toBe("'-2");
  });
  it("quotes cells with commas and quotes", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv(["h"], [["x,y"]])).toBe('h\r\n"x,y"');
  });
});
