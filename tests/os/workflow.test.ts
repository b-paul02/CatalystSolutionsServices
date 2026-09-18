import { describe, expect, it } from "vitest";
import {
  allocationDiff, attributionGrade, canDecideApproval, canMoveFinding, canTransition, contentHash,
  gateAction, gradeIsDecisionReady, nextStates, WORK_STATES,
} from "@/lib/os/workflow";
import { can, CLIENT_ROLES, isClientRole, STAFF_ROLES } from "@/lib/leados/rbac";
import { modulesForServices, programDefaults, SERVICES } from "@/lib/os/catalog";
import { auditFromReport, PILLARS } from "@/lib/os/audit";
import type { ReportJSON } from "@/lib/audit/report-types";
import { authorizeUrl, callbackUrl, isProvider, providerEnabled } from "@/lib/os/connectors";
import { copyProblems, validateCalendar, validatePlan } from "@/lib/os/ai";

const item = { clientReviewRequired: true, stateBefore: null };

describe("work state machine", () => {
  it("walks the happy path with the right capability at each step", () => {
    const path: [string, string, string][] = [
      ["backlog", "scoped", "manage"], ["scoped", "ready", "manage"], ["ready", "in_progress", "execute"],
      ["in_progress", "internal_qa", "execute"], ["internal_qa", "client_review", "review"],
      ["client_review", "approved", "approval"], ["approved", "scheduled", "execute"],
      ["scheduled", "delivered", "execute"], ["delivered", "verified", "review"], ["verified", "closed", "manage"],
    ];
    for (const [from, to, cap] of path) expect(canTransition(from, to, item)).toEqual({ ok: true, capability: cap });
  });

  it("MANDATORY NEGATIVE: nobody can skip client review or jump to delivered", () => {
    expect(canTransition("internal_qa", "approved", item).ok).toBe(false);
    expect(canTransition("in_progress", "delivered", item).ok).toBe(false);
    expect(canTransition("client_review", "delivered", item).ok).toBe(false);
    expect(canTransition("backlog", "approved", item).ok).toBe(false);
    // client_review → approved exists ONLY for the approval engine
    expect(nextStates("client_review", item, ["manage", "execute", "review"])).not.toContain("approved");
  });

  it("items without client review go QA → approved, and cannot be sent to the client", () => {
    const internal = { clientReviewRequired: false, stateBefore: null };
    expect(canTransition("internal_qa", "approved", internal).ok).toBe(true);
    expect(canTransition("internal_qa", "client_review", internal).ok).toBe(false);
  });

  it("blocked returns only to the state it came from; terminal states are final", () => {
    expect(canTransition("in_progress", "blocked", item).ok).toBe(true);
    expect(canTransition("blocked", "in_progress", { ...item, stateBefore: "in_progress" }).ok).toBe(true);
    expect(canTransition("blocked", "approved", { ...item, stateBefore: "in_progress" }).ok).toBe(false);
    for (const to of WORK_STATES) {
      expect(canTransition("closed", to, item).ok).toBe(false);
      expect(canTransition("cancelled", to, item).ok).toBe(false);
    }
    expect(canTransition("nonsense", "ready", item).ok).toBe(false);
  });
});

describe("approvals", () => {
  it("decides once; only a granted approval can be revoked", () => {
    expect(canDecideApproval("requested", "approved")).toBe(true);
    expect(canDecideApproval("approved", "revoked")).toBe(true);
    expect(canDecideApproval("approved", "rejected")).toBe(false);
    expect(canDecideApproval("rejected", "approved")).toBe(false);
    expect(canDecideApproval("expired", "approved")).toBe(false);
  });
  it("content hash changes with any material change", () => {
    expect(contentHash("a", "{}")).toBe(contentHash("a", "{}"));
    expect(contentHash("a", "{}")).not.toBe(contentHash("a", '{"x":1}'));
    expect(contentHash("a", "{}")).not.toBe(contentHash("b", "{}"));
  });
});

describe("action gate (autonomy tiers + kill switch)", () => {
  const ok = { status: "approved", contentHash: "h1", expiresAt: null };
  it("tier 0/1 run without approval, even with the kill switch (internal only)", () => {
    expect(gateAction({ tier: 1, killSwitch: true, currentHash: "h1", approval: null }).allowed).toBe(true);
  });
  it("tier 2 needs a current approval unless autonomy is explicitly enabled", () => {
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: null }).allowed).toBe(false);
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: ok }).allowed).toBe(true);
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: null, autonomyEnabled: true }).allowed).toBe(true);
  });
  it("MANDATORY NEGATIVE: stale, revoked, rejected or expired approvals never ship", () => {
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h2", approval: ok }).allowed).toBe(false);
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: { ...ok, status: "revoked" } }).allowed).toBe(false);
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: { ...ok, status: "rejected" } }).allowed).toBe(false);
    expect(gateAction({ tier: 2, killSwitch: false, currentHash: "h1", approval: { ...ok, expiresAt: new Date(0) } }).allowed).toBe(false);
  });
  it("MANDATORY NEGATIVE: tier 3 is never autonomous; kill switch blocks all outbound", () => {
    expect(gateAction({ tier: 3, killSwitch: false, currentHash: "h1", approval: null, autonomyEnabled: true }).allowed).toBe(false);
    expect(gateAction({ tier: 3, killSwitch: true, currentHash: "h1", approval: ok }).allowed).toBe(false);
    expect(gateAction({ tier: 2, killSwitch: true, currentHash: "h1", approval: ok, autonomyEnabled: true }).allowed).toBe(false);
  });
});

describe("findings, plan diff, attribution", () => {
  it("a recommendation must be evidence-checked and proposed before it can be accepted", () => {
    expect(canMoveFinding("identified", "accepted")).toBe(false);
    expect(canMoveFinding("identified", "evidence_checked")).toBe(true);
    expect(canMoveFinding("proposed", "accepted")).toBe(true);
    expect(canMoveFinding("accepted", "rejected")).toBe(false);
  });
  it("flags ±5pt allocation moves as material", () => {
    const d = allocationDiff([{ channel: "seo", pct: 50 }, { channel: "ads", pct: 50 }], [{ channel: "seo", pct: 46 }, { channel: "ads", pct: 44 }, { channel: "email", pct: 10 }]);
    expect(d.material).toBe(true);
    expect(d.rows.find((r) => r.channel === "seo")?.material).toBe(false);
    expect(d.rows.find((r) => r.channel === "email")?.material).toBe(true);
  });
  it("grades attribution; only A/B are decision-ready", () => {
    expect(attributionGrade({ firstPartyEvent: true, knownIdentity: true, traceableSource: true, reconciledRevenue: true })).toBe("A");
    expect(attributionGrade({ firstPartyEvent: true, knownIdentity: true, traceableSource: true, reconciledRevenue: false })).toBe("B");
    expect(attributionGrade({ firstPartyEvent: false, knownIdentity: false, traceableSource: true, reconciledRevenue: false })).toBe("C");
    expect(attributionGrade({ firstPartyEvent: false, knownIdentity: false, traceableSource: false, reconciledRevenue: false })).toBe("D");
    expect(gradeIsDecisionReady("B")).toBe(true);
    expect(gradeIsDecisionReady("C")).toBe(false);
    expect(gradeIsDecisionReady(null)).toBe(false);
  });
});

describe("OS RBAC: separation of duties", () => {
  it("MANDATORY NEGATIVE: Catalyst staff can never approve, sign or authorize spend", () => {
    for (const role of STAFF_ROLES) {
      expect(can(role, "approvals.decide")).toBe(false);
      expect(can(role, "spend.approve")).toBe(false);
      expect(can(role, "contract.sign")).toBe(false);
      expect(isClientRole(role)).toBe(false); // clients can't grant staff roles via invites
    }
  });
  it("clients cannot run delivery; admin approves publishing but not spend", () => {
    for (const role of CLIENT_ROLES) {
      expect(can(role, "work.manage")).toBe(false);
      expect(can(role, "work.review")).toBe(false);
      expect(can(role, "strategy.manage")).toBe(false);
    }
    expect(can("admin", "approvals.decide")).toBe(true);
    expect(can("admin", "spend.approve")).toBe(false);
    expect(can("owner", "spend.approve")).toBe(true);
  });
  it("freelancers have no workspace-wide view", () => {
    expect(can("cgo_freelancer", "work.view")).toBe(false);
    expect(can("cgo_freelancer", "work.execute")).toBe(true);
    expect(can("cgo_freelancer", "leads.view")).toBe(false);
  });
});

describe("catalogue", () => {
  it("has the twelve service lines, each with milestones and a QA gate", () => {
    expect(SERVICES).toHaveLength(12);
    for (const s of SERVICES) {
      expect(s.milestones.length).toBeGreaterThan(0);
      expect(s.qa.length).toBeGreaterThan(0);
    }
  });
  it("derives modules from services; core modules are always present", () => {
    const mods = modulesForServices(["seo"]);
    expect(mods).toEqual(expect.arrayContaining(["overview", "audit", "approvals", "search", "content"]));
    expect(mods).not.toContain("ads");
  });
  it("program defaults resolve for a real program and fail closed for an unknown one", () => {
    const d = programDefaults("b2b-pipeline-bundle", "growth");
    expect(d?.modules).toContain("crm");
    expect(d?.services).toContain("content");
    expect(programDefaults("nope", "growth")).toBeNull();
  });
});

describe("audit mapping", () => {
  const base: ReportJSON = { business_name: "X", snapshot: "s", key_points: [], findings: [{ text: "Weak CTA", evidence: "homepage hero", severity: "high" }], icps: [{ name: "Ops lead", body: "b" }], routes: [], quick_wins: [], assumptions: [], cta: "" };
  it("no scorecard → every pillar is unavailable with a NULL score, never 0", () => {
    const a = auditFromReport(base, "https://x.test");
    for (const p of PILLARS) expect(a.scores[p.key]).toEqual({ score: null, label: "unavailable" });
    expect(a.summary.limitations.length).toBeGreaterThan(0);
  });
  it("model findings are 'assumed'; failed checks keep their measured verification; ICPs are hypotheses", () => {
    const a = auditFromReport({
      ...base,
      scorecard: {
        overall: 40, verdict: "", pagespeed: null, pagesReviewed: [], checkedAt: "2026-09-01T00:00:00.000Z",
        subscores: [{ key: "visibility", label: "Search visibility", score: 55, confidence: "high", deductions: [] }],
        checks: [
          { pillar: "visibility", label: "XML sitemap found", pass: false, verification: "verified" },
          { pillar: "visibility", label: "robots.txt present", pass: true, verification: "verified" },
        ],
      },
    }, "https://x.test");
    expect(a.scores.visibility).toMatchObject({ score: 55, label: "verified" });
    expect(a.scores.speed.score).toBeNull();
    expect(a.findings).toHaveLength(2);
    expect(a.findings.find((f) => f.text === "XML sitemap found")?.label).toBe("verified");
    expect(a.findings.find((f) => f.text === "Weak CTA")?.label).toBe("assumed");
    expect(a.summary.icps[0].hypothesis).toBe(true);
  });
});

describe("connectors (no network)", () => {
  it("providers are off without env credentials and unknown providers are rejected", () => {
    expect(isProvider("gsc")).toBe(true);
    expect(isProvider("tiktok")).toBe(false);
    const saved = process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_ID;
    expect(providerEnabled("x")).toBe(false);
    if (saved) process.env.X_CLIENT_ID = saved;
    // Meta is "coming soon": never connectable, even with credentials present
    process.env.META_APP_ID = "id"; process.env.META_APP_SECRET = "secret";
    expect(providerEnabled("meta")).toBe(false);
  });
  it("builds an authorize URL with state, exact callback, and PKCE only where required", () => {
    process.env.X_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_ID = "gid";
    const x = new URL(authorizeUrl("x", "https://app.example.com").url);
    expect(x.searchParams.get("redirect_uri")).toBe(callbackUrl("https://app.example.com", "x"));
    expect(x.searchParams.get("code_challenge_method")).toBe("S256");
    expect(x.searchParams.get("state")).toBeTruthy();
    const g = new URL(authorizeUrl("gsc", "https://app.example.com").url);
    expect(g.searchParams.get("code_challenge")).toBeNull();
    expect(g.searchParams.get("access_type")).toBe("offline");
    expect(g.searchParams.get("scope")).toContain("webmasters.readonly"); // read-only
    expect(authorizeUrl("x", "https://a.b").state).not.toBe(authorizeUrl("x", "https://a.b").state);
  });
});

describe("AI validators", () => {
  it("rejects guarantees, placeholders and broken URLs; passes clean copy", () => {
    expect(copyProblems("We guarantee 10x leads")).not.toHaveLength(0);
    expect(copyProblems("You will rank #1 on Google")).not.toHaveLength(0);
    expect(copyProblems("Intro [insert stat here]")).not.toHaveLength(0);
    expect(copyProblems("Book a free audit at https://catalystsolutionservices.com/growth-audit.")).toEqual([]);
  });
  it("MANDATORY NEGATIVE: hallucinated citations are stripped; uncited plans need stated assumptions; allocation must sum to 100", () => {
    const base = { summary: "s", focus: [], risks: [], alternatives: [] };
    const known = new Set(["f1"]);
    const ok = validatePlan({ ...base, allocation: [{ channel: "seo", pct: 60, rationale: "r", evidenceIds: ["f1", "made-up"] }, { channel: "content", pct: 40, rationale: "r", evidenceIds: [] }], assumptions: ["a"] }, known);
    expect(ok.problems).toEqual([]);
    expect(ok.plan.allocation[0].evidenceIds).toEqual(["f1"]);
    expect(ok.notes.join(" ")).toContain("Removed 1");
    expect(validatePlan({ ...base, allocation: [{ channel: "seo", pct: 100, rationale: "r", evidenceIds: [] }], assumptions: [] }, known).problems.join(" ")).toContain("assumptions");
    expect(validatePlan({ ...base, allocation: [{ channel: "seo", pct: 70, rationale: "r", evidenceIds: ["f1"] }], assumptions: [] }, known).problems.join(" ")).toContain("100");
  });
  it("calendar validator tolerates shape drift but is strict on channel, day and claims", () => {
    const r = validateCalendar({ calendar: [
      { day: "3", channel: "LinkedIn", title: "Aligners 101", hook: "h", cta: "c" },
      { dayOffset: 2, channel: "tiktok", topic: "x" },
      { dayOffset: 99, channel: "blog", topic: "x" },
      { dayOffset: 1, channel: "blog", topic: "Guaranteed results" },
    ] }, ["linkedin", "blog"], 14);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ dayOffset: 3, channel: "linkedin", topic: "Aligners 101" });
    expect(r.dropped).toHaveLength(3);
  });
});
