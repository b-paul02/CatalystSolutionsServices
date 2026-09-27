import { describe, expect, it } from "vitest";
import {
  evaluateCondition, redact, render, safeUrl, simulate, validateDefinition, waitMs, type Definition,
} from "@/lib/os/automation/definition";
import { definitionHash } from "@/lib/os/automation/hash";
import { BLOCKS, BLOCK_LIST } from "@/lib/os/automation/catalog";
import { RUNNERS } from "@/lib/os/automation/blocks";
import { TEMPLATES } from "@/lib/os/automation/templates";
import { can, STAFF_ROLES } from "@/lib/leados/rbac";

const base: Definition = {
  nodes: [
    { id: "n1", type: "trigger.lead_created", config: {} },
    { id: "n2", type: "logic.condition", config: { left: "{{trigger.lead.city}}", operator: "equals", right: "Pune" } },
    { id: "n3", type: "crm.create_task", config: { title: "Call {{trigger.lead.firstName}}" } },
    { id: "b1", type: "crm.add_note", config: { text: "Out of area" } },
  ],
  edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3", branch: "true" }, { from: "n2", to: "b1", branch: "false" }],
};

describe("templating and conditions", () => {
  const ctx = { trigger: { lead: { firstName: "Asha", city: "Pune", score: 72 } }, steps: { n2: { text: "hi" } } };
  it("renders known paths and blanks unknown ones (never leaks the template syntax)", () => {
    expect(render("Hi {{trigger.lead.firstName}} / {{steps.n2.text}} / {{nope.x}}!", ctx)).toBe("Hi Asha / hi / !");
    expect(render("{{ trigger.lead }}", ctx)).toContain("Asha");
  });
  it("evaluates operators case-insensitively and fails closed on an unknown one", () => {
    expect(evaluateCondition({ left: "{{trigger.lead.city}}", operator: "equals", right: "pune" }, ctx)).toBe(true);
    expect(evaluateCondition({ left: "{{trigger.lead.score}}", operator: "greater_than", right: "50" }, ctx)).toBe(true);
    expect(evaluateCondition({ left: "{{trigger.lead.email}}", operator: "is_empty" }, ctx)).toBe(true);
    expect(evaluateCondition({ left: "a", operator: "matches_regex", right: ".*" }, ctx)).toBe(false);
  });
  it("clamps waits to 1 minute … 60 days", () => {
    expect(waitMs({ amount: "0", unit: "minutes" })).toBe(60_000);
    expect(waitMs({ amount: "999", unit: "days" })).toBe(60 * 86_400_000);
  });
});

describe("validation", () => {
  it("accepts a well-formed workflow", () => expect(validateDefinition(base, BLOCKS)).toEqual([]));
  it("MANDATORY NEGATIVE: rejects loops, missing/multiple triggers, unknown blocks, orphans and unlabelled branches", () => {
    const v = (d: Definition) => validateDefinition(d, BLOCKS).join(" | ");
    expect(v({ ...base, edges: [...base.edges, { from: "n3", to: "n2" }] })).toContain("loop");
    expect(v({ nodes: base.nodes.slice(1), edges: [] })).toContain("trigger");
    expect(v({ nodes: [...base.nodes, { id: "x", type: "trigger.manual", config: {} }], edges: base.edges })).toContain("Only one trigger");
    expect(v({ nodes: [...base.nodes, { id: "x", type: "shell.exec", config: {} }], edges: base.edges })).toContain("Unknown step");
    expect(v({ nodes: [...base.nodes, { id: "x", type: "crm.add_note", config: { text: "t" } }], edges: base.edges })).toContain("aren't connected");
    expect(v({ ...base, edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] })).toContain("Yes or the No");
    expect(v({ ...base, nodes: base.nodes.map((n) => (n.id === "n3" ? { ...n, config: {} } : n)) })).toContain("needs task");
  });
  it("hash ignores canvas positions but changes with any logic change", () => {
    const moved = { ...base, nodes: base.nodes.map((n) => ({ ...n, position: { x: 9, y: 9 } })) };
    expect(definitionHash(moved)).toBe(definitionHash(base));
    const edited = { ...base, nodes: base.nodes.map((n) => (n.id === "n3" ? { ...n, config: { title: "Email them" } } : n)) };
    expect(definitionHash(edited)).not.toBe(definitionHash(base));
  });
});

describe("path preview", () => {
  it("follows the branch the sample data takes and lists what was skipped — without running anything", () => {
    const yes = simulate(base, BLOCKS, { lead: { firstName: "Asha", city: "Pune" } });
    expect(yes.steps.map((s) => s.status)).toEqual(["would_run", "taken_yes", "would_run"]);
    expect(yes.steps[2].detail).toBe("Task: Call Asha");
    expect(yes.skipped).toEqual(["Add note to lead"]);
    const no = simulate(base, BLOCKS, { lead: { city: "Delhi" } });
    expect(no.steps.map((s) => s.nodeId)).toEqual(["n1", "n2", "b1"]);
  });
});

describe("safety helpers", () => {
  it("MANDATORY NEGATIVE: HTTP steps cannot reach internal or metadata addresses", () => {
    for (const bad of ["http://example.com", "https://localhost/x", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.1", "https://169.254.169.254/latest/meta-data", "https://172.16.0.1", "https://[::1]/", "https://db.internal", "https://2130706433", "ftp://x.com", "not a url"]) {
      expect(() => safeUrl(bad), bad).toThrow();
    }
    expect(safeUrl("https://hooks.slack.com/services/x").hostname).toBe("hooks.slack.com");
  });
  it("redacts emails and phone numbers from step logs", () => {
    expect(redact("Sent to asha@example.com and +91 98765 43210 ok")).toBe("Sent to [email] and [phone] ok");
  });
});

describe("catalogue and templates", () => {
  it("every non-trigger, non-logic block has a runner, and nothing runs code or shell", () => {
    for (const b of BLOCK_LIST) {
      if (b.kind === "action") expect(RUNNERS[b.type], b.type).toBeTypeOf("function");
      expect(b.type).not.toMatch(/exec|shell|code|eval|sql/);
    }
    expect(Object.keys(RUNNERS).every((k) => BLOCKS[k])).toBe(true);
  });
  it("all 33 templates are valid and preview cleanly", () => {
    expect(TEMPLATES).toHaveLength(33);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(33);
    for (const t of TEMPLATES) {
      expect(validateDefinition(t.definition, BLOCKS), t.key).toEqual([]);
      expect(simulate(t.definition, BLOCKS, {}).steps.length, t.key).toBeGreaterThan(1);
    }
  });
  it("MANDATORY NEGATIVE: Catalyst staff can build workflows but never activate them", () => {
    for (const role of STAFF_ROLES) expect(can(role, "automations.activate")).toBe(false);
    expect(can("cgo_lead", "automations.manage")).toBe(true);
    expect(can("owner", "automations.activate")).toBe(true);
    expect(can("analyst", "automations.manage")).toBe(false);
  });
});
