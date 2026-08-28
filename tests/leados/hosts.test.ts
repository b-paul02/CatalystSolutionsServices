import { describe, expect, it } from "vitest";
import { isLeadosHost, leadosCanonicalPath } from "@/lib/leados/hosts";

describe("isLeadosHost", () => {
  it("matches the prod app subdomain", () => {
    expect(isLeadosHost("app.catalystsolutionservices.com")).toBe(true);
    expect(isLeadosHost("APP.CATALYSTSOLUTIONSERVICES.COM")).toBe(true);
  });
  it("matches local dev with port", () => {
    expect(isLeadosHost("app.localhost:3000")).toBe(true);
  });
  it("rejects the marketing host and others", () => {
    expect(isLeadosHost("catalystsolutionservices.com")).toBe(false);
    expect(isLeadosHost("www.catalystsolutionservices.com")).toBe(false);
    expect(isLeadosHost("localhost:3000")).toBe(false);
    expect(isLeadosHost(null)).toBe(false);
    expect(isLeadosHost("evil-app.catalystsolutionservices.com.attacker.io")).toBe(false);
  });
});

describe("leadosCanonicalPath", () => {
  it("redirects root and bare pages onto /app", () => {
    expect(leadosCanonicalPath("/")).toBe("/app");
    expect(leadosCanonicalPath("/login")).toBe("/app/login");
    expect(leadosCanonicalPath("/leads/abc")).toBe("/app/leads/abc");
  });
  it("leaves api, next internals, static files and /app alone", () => {
    expect(leadosCanonicalPath("/api/v1/leads")).toBeNull();
    expect(leadosCanonicalPath("/_next/data/x")).toBeNull();
    expect(leadosCanonicalPath("/icon.png")).toBeNull();
    expect(leadosCanonicalPath("/app/leads")).toBeNull();
  });
});
