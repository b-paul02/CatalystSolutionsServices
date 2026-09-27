// WP-18 · "Test this step" (simulate mode: conditions evaluate, nothing else runs) and the run inspector's redacted
// per-step input / output.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => { throw new Error("no request scope"); } }));

import { db } from "@/lib/audit/db";
import { signIn } from "./entry-harness";
import { BLOCKS } from "@/lib/os/automation/catalog";
import { outputShapeFor, testStep, type Definition } from "@/lib/os/automation/definition";
import { definitionHash } from "@/lib/os/automation/hash";
import { emitEvent } from "@/lib/os/automation/engine";
import { testStepAction } from "@/app/app/(shell)/workflows/actions";

const tag = `fpw-${Date.now()}`;
let orgId: string, owner: string;
const calls: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { calls.push(String(input)); throw new Error(`Unexpected outbound request in a test: ${String(input)}`); });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: owner, role: "owner" } });
});
afterAll(async () => {
  await db.cosWorkflowStepLog.deleteMany({ where: { orgId } }); await db.cosWorkflowRun.deleteMany({ where: { orgId } }); await db.cosWorkflow.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: owner } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: owner } });
  vi.unstubAllGlobals();
});

describe("WP-18 step test + run inspector", () => {
  it("testStep: conditions evaluate for real; external and contact steps are simulated with their output shape; no call leaves", async () => {
    const cond = testStep({ id: "n2", type: "logic.condition", config: { left: "{{trigger.body.status}}", operator: "equals", right: "paid" } }, BLOCKS, { trigger: { body: { status: "paid" } } });
    expect(cond).toMatchObject({ simulated: false, input: { left: "paid", operator: "equals", right: "paid" }, output: { result: true } });
    const http = testStep({ id: "n3", type: "http.request", config: { url: "https://example.com/hook", method: "POST", body: "{{steps.n2.result}}" } }, BLOCKS, { trigger: {}, steps: { n2: { result: true } } });
    expect(http.simulated).toBe(true); expect(http.input.body).toBe("true"); expect(http.output).toMatchObject({ status: 200 }); expect(http.note).toMatch(/nothing was sent/);
    const msg = testStep({ id: "n4", type: "message.send", config: { channel: "email", body: "Hi {{trigger.lead.firstName}}" } }, BLOCKS, { trigger: { lead: { firstName: "Asha" } } });
    expect(msg.input.body).toBe("Hi Asha"); expect(msg.output).toMatchObject({ outcome: "sent | blocked" }); expect(msg.note).toMatch(/consent/);
    expect(outputShapeFor("nonsense.block")).toEqual({ ok: true });
    expect(() => testStep({ id: "x", type: "nope", config: {} }, BLOCKS, {})).toThrow(/Unknown step/);
    await signIn(owner, orgId);
    const r = await testStepAction({ id: "n1", type: "ai.classify", config: { text: "{{trigger.message}}", categories: "sales, support" } }, '{"message":"I want a quote"}');
    expect(r.test?.input.text).toBe("I want a quote"); expect(r.test?.output).toHaveProperty("category");
    expect((await testStepAction({ id: "n1", type: "ai.classify", config: {} }, "{oops")).error).toMatch(/valid JSON/);
    expect(calls).toEqual([]);
  });

  it("run inspector: each executed step logs its rendered input and output, redacted, with timings", async () => {
    const def: Definition = { nodes: [{ id: "n1", type: "trigger.manual", config: {} }, { id: "n2", type: "logic.condition", config: { left: "{{trigger.email}}", operator: "contains", right: "@" } }], edges: [{ from: "n1", to: "n2" }] };
    const wf = await db.cosWorkflow.create({ data: { orgId, name: `${tag} wf`, definition: JSON.stringify(def), triggerType: "trigger.manual", status: "active", activeHash: definitionHash(def), createdById: owner, activatedById: owner, demo: true } });
    const started = await emitEvent(orgId, "trigger.manual", { email: "asha@example.com", note: "call me on 9876543210" }, { eventKey: `${tag}:1` });
    expect(started).toHaveLength(1);
    const steps = await db.cosWorkflowStepLog.findMany({ where: { runId: started[0] }, orderBy: { createdAt: "asc" } });
    const cond = steps.find((s) => s.blockType === "logic.condition")!;
    expect(cond.input).not.toContain("asha@example.com"); expect(cond.input).toContain("operator"); expect(cond.output).toBe('{"result":true}');
    expect((await db.cosWorkflowRun.findUniqueOrThrow({ where: { id: started[0] } })).status).toBe("succeeded");
    expect(wf.id).toBeTruthy();
  });
});
