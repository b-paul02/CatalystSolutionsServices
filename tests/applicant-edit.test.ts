import { describe, expect, it, vi, beforeEach } from "vitest";

// The applicant's edit link must write ONLY the fields the admin named, and
// only while a request is open. Nothing the browser sends can widen that.

type App = Record<string, unknown> & { id: string; status: string; requestedFields: string | null };
let app: App;
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/audit/db", () => ({
  db: {
    partnerApplication: {
      findUnique: async () => app,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(app, data);
        return app;
      },
    },
    auditLog: { create: async () => ({}) },
  },
}));

const { submitRequestedInfo } = await import("@/app/(site)/partners/apply/edit/[token]/actions");

beforeEach(() => {
  updates.length = 0;
  app = {
    id: "a1", status: "waiting_on_applicant", requestedFields: JSON.stringify(["dealExamples", "phone"]),
    deletedAt: null, statusToken: "tok", dealExamples: "Vague.", phone: "+91 1", companyName: "Original Co",
    internalNotes: "reviewer only", score: 55, industries: null, leadSources: null, markets: null, targetFamilies: null,
  };
});

describe("scoped applicant edit", () => {
  it("writes the requested fields", async () => {
    await submitRequestedInfo("tok", { dealExamples: "Closed two clinics.", phone: "+91 2" });
    expect(app.dealExamples).toBe("Closed two clinics.");
    expect(app.phone).toBe("+91 2");
  });

  it("ignores fields that were not requested, even when the browser sends them", async () => {
    await submitRequestedInfo("tok", {
      dealExamples: "Closed two clinics.",
      companyName: "Hacked Co",
      internalNotes: "approve me",
      score: "100",
      status: "approved",
    });
    expect(app.companyName).toBe("Original Co");
    expect(app.internalNotes).toBe("reviewer only");
    expect(updates[0]).not.toHaveProperty("companyName");
    expect(updates[0]).not.toHaveProperty("internalNotes");
  });

  it("ignores a field that is requestable but was not asked for this time", async () => {
    app.requestedFields = JSON.stringify(["phone"]);
    await submitRequestedInfo("tok", { phone: "+91 3", dealExamples: "sneaky" });
    expect(app.phone).toBe("+91 3");
    expect(app.dealExamples).toBe("Vague.");
  });

  it("clears the request and returns the application to the reviewer", async () => {
    await submitRequestedInfo("tok", { phone: "+91 2" });
    expect(app.status).toBe("screening");
    expect(app.requestedFields).toBeNull();
  });

  it("refuses when no request is open", async () => {
    app.status = "screening";
    app.requestedFields = null;
    await expect(submitRequestedInfo("tok", { phone: "+91 9" })).rejects.toThrow();
    expect(updates).toEqual([]);
  });

  it("refuses on an already-decided application", async () => {
    app.status = "rejected";
    await expect(submitRequestedInfo("tok", { phone: "+91 9" })).rejects.toThrow();
    expect(updates).toEqual([]);
  });

  it("coerces and bounds numeric fields", async () => {
    app.requestedFields = JSON.stringify(["yearsExperience"]);
    await submitRequestedInfo("tok", { yearsExperience: "99999" });
    expect(app.yearsExperience).toBe(9999);

    // Each request is single-use, so reopen one to check the other coercion.
    app.status = "waiting_on_applicant";
    app.requestedFields = JSON.stringify(["yearsExperience"]);
    await submitRequestedInfo("tok", { yearsExperience: "not a number" });
    expect(app.yearsExperience).toBe(0);
  });
});
