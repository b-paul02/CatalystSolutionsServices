// WP-11 survey campaign → CosSource transcript (qualifying answers only) · WP-12 embed script route + app-host pass-through.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { processSubmission } from "@/lib/leados/submission";
import { GET as scriptRoute } from "@/app/s/[kind]/route";
import { leadosCanonicalPath } from "@/lib/leados/hosts";

const tag = `sv-${Date.now()}`;
let orgId: string, campaignId: string;

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  const user = await db.losUser.create({ data: { email: `${tag}@example.com`, demo: true } });
  const formSpec = { fields: [{ key: "firstName", label: "First name", kind: "text", required: true }, { key: "phone", label: "Phone", kind: "phone", required: true }], qualifying: [{ key: "why", label: "Why did you choose us?", kind: "textarea", required: false }, { key: "improve", label: "What should we improve?", kind: "textarea", required: false }], otpVerify: false, emailVerify: false, consentPurposes: ["survey"], consentChannels: ["email"] };
  const c = await db.losCampaign.create({ data: { orgId, name: `${tag} survey`, type: "survey", status: "active", formSpec: JSON.stringify(formSpec), pageSpec: JSON.stringify({ template: "clean", headline: "h", body: "b", cta: "Send", brandColor: "#000000", thankYouMessage: "Thanks." }), createdById: user.id, demo: true } });
  campaignId = c.id;
  await db.losCampaignVersion.create({ data: { campaignId, version: 1, formSpec: c.formSpec!, pageSpec: c.pageSpec! } });
});
afterAll(async () => {
  await db.cosSource.deleteMany({ where: { orgId } }); await db.losFormSubmission.deleteMany({ where: { orgId } }); await db.losAttributionEvent.deleteMany({ where: { campaignId } });
  await db.losConsentEvent.deleteMany({ where: { orgId } }); await db.losActivity.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.losLeadB2c.deleteMany({ where: { lead: { orgId } } }); await db.losLead.deleteMany({ where: { orgId } });
  await db.losCampaignVersion.deleteMany({ where: { campaignId } }); await db.losCampaign.deleteMany({ where: { orgId } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { email: `${tag}@example.com` } });
});

describe("WP-11 survey", () => {
  it("stores the qualifying answers as a transcript source, without any contact detail", async () => {
    const r = await processSubmission({ campaignId, values: { firstName: "Meera", phone: "+919876500001", why: "Close to home", improve: "Evening slots" }, consentChecked: true, utm: {} });
    expect(r.outcome).toBe("accepted");
    const src = (await db.cosSource.findFirst({ where: { orgId, kind: "transcript" } }))!;
    expect(src.excerpt).toBe("Why did you choose us?: Close to home\nWhat should we improve?: Evening slots");
    expect(src.title).toContain("Survey answer");
    expect(`${src.title}${src.excerpt}`).not.toMatch(/Meera|9876500001/);
    expect(await db.losFormSubmission.count({ where: { campaignId, score: { not: null } } })).toBe(0); // no score on a survey
  });
});

describe("WP-12 embed", () => {
  it("serves an ES5 script under 3 KB, cached, that frames the hosted form and listens for its height", async () => {
    const res = await scriptRoute(new NextRequest("http://app.localhost:3000/s/form.js"), { params: Promise.resolve({ kind: "form.js" }) });
    expect(res.status).toBe(200); expect(res.headers.get("content-type")).toContain("javascript"); expect(res.headers.get("cache-control")).toContain("max-age=3600");
    const js = await res.text();
    expect(js.length).toBeLessThan(3000); expect(js).toContain('"http://app.localhost:3000"'); expect(js).toContain("/app/c/"); expect(js).toContain("cgo-form-height");
    expect(js).not.toMatch(/=>|\blet\b|\bconst\b|`/); // ES5-safe
    expect((await scriptRoute(new NextRequest("http://app.localhost:3000/s/evil.js"), { params: Promise.resolve({ kind: "evil.js" }) })).status).toBe(404);
    // the app host redirects bare paths to /app, except short links and scripts
    expect(leadosCanonicalPath("/login")).toBe("/app/login");
    expect(leadosCanonicalPath("/l/abc")).toBeNull(); expect(leadosCanonicalPath("/s/form.js")).toBeNull();
  });
});
