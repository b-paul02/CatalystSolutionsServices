import { describe, expect, it } from "vitest";
import { isLeadosHost, leadosRewritePath } from "@/lib/leados/hosts";

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

describe("leadosRewritePath", () => {
  it("maps root and pages onto /app", () => {
    expect(leadosRewritePath("/")).toBe("/app");
    expect(leadosRewritePath("/login")).toBe("/app/login");
    expect(leadosRewritePath("/leads/abc")).toBe("/app/leads/abc");
  });
  it("leaves api, next internals, static files and /app alone", () => {
    expect(leadosRewritePath("/api/v1/leads")).toBeNull();
    expect(leadosRewritePath("/_next/data/x")).toBeNull();
    expect(leadosRewritePath("/icon.png")).toBeNull();
    expect(leadosRewritePath("/app/leads")).toBeNull();
  });
});
