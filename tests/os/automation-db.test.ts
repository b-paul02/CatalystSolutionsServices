// Workflow engine against the real DB: happy path plus every mandatory negative
// (duplicate events, tenant isolation, edited workflows, staff activation,
// consent, kill switch, loops, waits).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { createLead } from "@/lib/leados/leadWrite";
import { emitEvent, executeRun } from "@/lib/os/automation/engine";
import { activateWorkflow, createWorkflow, saveWorkflow, setWorkflowStatus } from "@/lib/os/automation/manage";
import type { Definition } from "@/lib/os/automation/definition";
import type { WorkActor } from "@/lib/os/work";

const tag = `auto-${Date.now()}`;
let orgA: string, orgB: string, owner: WorkActor, staff: WorkActor, ownerB: WorkActor, leadId: string;

const linear = (trigger: string, steps: [string, Record<string, string>][], tcfg: Record<string, string> = {}): Definition => ({
  nodes: [{ id: "n1", type: trigger, config: tcfg }, ...steps.map(([type, config], i) => ({ id: `n${i + 2}`, type, config }))],
  edges: steps.map((_s, i) => ({ from: `n${i + 1}`, to: `n${i + 2}` })),
});

async function live(actor: WorkActor, def: Definition, name = "wf") {
  const wf = await createWorkflow(actor, { name });
  await saveWorkflow(actor, wf.id, { definition: def });
  await activateWorkflow({ ...actor, role: "owner" }, wf.id);
  return wf.id;
}

beforeAll(async () => {
  for (const name of ["a", "b"]) {
    const org = await db.losOrg.create({ data: { name: `${tag}-${name}`, demo: true } });
    await db.cosWorkspace.create({ data: { orgId: org.id, kind: "client", demo: true } });
    await db.cosContract.create({ data: { orgId: org.id, services: "[]", modules: "[]", status: "active", signedAt: new Date(), demo: true } });
    if (name === "a") orgA = org.id; else orgB = org.id;
  }
  const mk = async (n: string, orgId: string, role: string) => {
    const u = await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, demo: true } });
    await db.losMembership.create({ data: { orgId, userId: u.id, role } });
    return { orgId, userId: u.id, role };
  };
  owner = await mk("owner", orgA, "owner");
  staff = await mk("staff", orgA, "cgo_lead");
  ownerB = await mk("ownerb", orgB, "owner");
  const created = await createLead({ orgId: orgA, leadType: "b2c", source: "manual", demo: true, verify: false, input: { firstName: "Asha", phone: "+917000223344" }, lawfulUse: { purposes: ["sales_contact"], channels: ["whatsapp"] } });
  leadId = (created as { leadId: string }).leadId;
}, 120_000);

afterAll(async () => {
  const orgs = [orgA, orgB];
  await db.cosWorkflow.deleteMany({ where: { orgId: { in: orgs } } }); // cascades runs + step logs
  for (const m of ["losMessageEvent"] as const) await db[m].deleteMany({ where: { message: { orgId: { in: orgs } } } });
  await db.losOutboundMessage.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losTask.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losNote.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losActivity.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losConsentEvent.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losLeadSourceRecord.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losLead.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losJob.deleteMany({ where: { type: "os.workflow_resume", payload: { contains: "runId" }, status: "pending", createdAt: { gt: new Date(Date.now() - 3_600_000) } } }).catch(() => {});
  await db.cosContract.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosWorkspace.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losAuditEvent.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losMembership.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losOrg.deleteMany({ where: { id: { in: orgs } } });
  await db.losUser.deleteMany({ where: { email: { startsWith: tag } } });
  await db.$disconnect();
}, 120_000);

describe("workflow engine", { timeout: 120_000 }, () => {
  it("MANDATORY NEGATIVE: staff can build but not activate; unpaid workspaces get nothing", async () => {
    const wf = await createWorkflow(staff, { templateKey: "T03" });
    await expect(activateWorkflow(staff, wf.id)).rejects.toThrow("owner or admin");
    const free = await db.losOrg.create({ data: { name: `${tag}-free`, demo: true } });
    await db.cosWorkspace.create({ data: { orgId: free.id, demo: true } });
    await expect(createWorkflow({ orgId: free.id, userId: owner.userId, role: "owner" }, {})).rejects.toThrow("active plan");
    await db.cosWorkspace.delete({ where: { orgId: free.id } }); await db.losOrg.delete({ where: { id: free.id } });
  });

  it("runs the activated path; a redelivered event never runs twice", async () => {
    const id = await live(owner, linear("trigger.lead_created", [["crm.create_task", { title: "Call {{trigger.lead.firstName}}", dueInHours: "1" }]]));
    const first = await emitEvent(orgA, "trigger.lead_created", { leadId }, { eventKey: "evt-1" });
    const again = await emitEvent(orgA, "trigger.lead_created", { leadId }, { eventKey: "evt-1" });
    expect(first).toHaveLength(1);
    expect(again).toHaveLength(0);
    const run = await db.cosWorkflowRun.findFirstOrThrow({ where: { workflowId: id }, include: { steps: true } });
    expect(run.status).toBe("succeeded");
    expect(await db.losTask.count({ where: { orgId: orgA, title: "Call Asha" } })).toBe(1);
    // the step log is redacted and the run context is never copied into it
    expect(run.steps.every((s) => !/\+91|@example/.test(s.summary ?? ""))).toBe(true);
  });

  it("MANDATORY NEGATIVE: another workspace's event or lead can't drive this workflow", async () => {
    const before = await db.losTask.count({ where: { orgId: orgA } });
    expect(await emitEvent(orgB, "trigger.lead_created", { leadId }, { eventKey: "evt-b" })).toHaveLength(0); // B has no workflows
    const idB = await live(ownerB, linear("trigger.lead_created", [["crm.add_note", { text: "hi" }]]), "b-wf");
    await emitEvent(orgB, "trigger.lead_created", { leadId }, { eventKey: "evt-b2" }); // A's lead id, B's workspace
    const run = await db.cosWorkflowRun.findFirstOrThrow({ where: { workflowId: idB } });
    expect(run.status).toBe("failed"); // lead is not visible inside B → the step has no lead
    expect(await db.losNote.count({ where: { leadId } })).toBe(0);
    expect(await db.losTask.count({ where: { orgId: orgA } })).toBe(before);
  });

  it("MANDATORY NEGATIVE: an edited workflow stops until it is activated again", async () => {
    const id = await live(owner, linear("trigger.manual", [["crm.create_task", { title: "v1 task" }]]), "edit-wf");
    const saved = await saveWorkflow(staff, id, { definition: linear("trigger.manual", [["crm.create_task", { title: "v2 task — staff edit" }]]) });
    expect(saved.deactivated).toBe(true);
    expect(await emitEvent(orgA, "trigger.manual", {}, { onlyWorkflowId: id })).toHaveLength(0);
    // even if someone flips the status by hand, the hash check still refuses
    await db.cosWorkflow.update({ where: { id }, data: { status: "active", activeHash: "stale" } });
    expect(await emitEvent(orgA, "trigger.manual", {}, { onlyWorkflowId: id })).toHaveLength(0);
    expect(await db.losTask.count({ where: { orgId: orgA, title: { startsWith: "v2" } } })).toBe(0);
    // moving cards on the canvas is not a logic change
    await activateWorkflow(owner, id);
    const def = JSON.parse((await db.cosWorkflow.findUniqueOrThrow({ where: { id } })).definition) as Definition;
    const moved = await saveWorkflow(staff, id, { definition: { ...def, nodes: def.nodes.map((n) => ({ ...n, position: { x: 500, y: 500 } })) } });
    expect(moved.deactivated).toBe(false);
  });

  it("MANDATORY NEGATIVE: messaging a lead without consent for that channel is blocked, not sent", async () => {
    const id = await live(owner, linear("trigger.manual", [["message.send", { channel: "sms", body: "hello" }], ["crm.add_note", { text: "should not happen" }]]), "consent-wf");
    await emitEvent(orgA, "trigger.manual", { leadId }, { onlyWorkflowId: id });
    const run = await db.cosWorkflowRun.findFirstOrThrow({ where: { workflowId: id }, include: { steps: { orderBy: { createdAt: "asc" } } } });
    expect(run.status).toBe("blocked");
    expect(run.steps.at(-1)?.status).toBe("blocked");
    expect(await db.losNote.count({ where: { leadId, body: "should not happen" } })).toBe(0); // the path stops at the block
    expect(await db.losOutboundMessage.count({ where: { orgId: orgA, leadId, status: { in: ["sent", "dev_logged"] } } })).toBe(0);
  });

  it("MANDATORY NEGATIVE: the kill switch stops new runs", async () => {
    const id = await live(owner, linear("trigger.manual", [["crm.create_task", { title: "kill-switch task" }]]), "kill-wf");
    await db.cosWorkspace.update({ where: { orgId: orgA }, data: { killSwitch: true } });
    expect(await emitEvent(orgA, "trigger.manual", {}, { onlyWorkflowId: id })).toHaveLength(0);
    await db.cosWorkspace.update({ where: { orgId: orgA }, data: { killSwitch: false } });
    expect(await emitEvent(orgA, "trigger.manual", {}, { onlyWorkflowId: id })).toHaveLength(1);
  });

  it("MANDATORY NEGATIVE: a workflow that re-triggers itself stops at the depth cap", async () => {
    const id = await live(owner, linear("trigger.lead_stage_changed", [["crm.update_stage", { stage: "contacted" }]]), "loop-wf");
    await emitEvent(orgA, "trigger.lead_stage_changed", { leadId, from: "new", to: "assigned" }, { eventKey: "loop-1" });
    const runs = await db.cosWorkflowRun.count({ where: { workflowId: id } });
    expect(runs).toBeGreaterThanOrEqual(1);
    expect(runs).toBeLessThanOrEqual(3); // MAX_DEPTH
    await setWorkflowStatus(owner, id, "paused");
  });

  it("a wait suspends the run and it resumes from where it stopped; pausing the workflow cancels the rest", async () => {
    const id = await live(owner, linear("trigger.manual", [["logic.wait", { amount: "2", unit: "days" }], ["crm.create_task", { title: "after the wait" }]]), "wait-wf");
    const [runId] = await emitEvent(orgA, "trigger.manual", { leadId }, { onlyWorkflowId: id });
    expect((await db.cosWorkflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("waiting");
    await executeRun(runId); // not due yet → nothing happens
    expect(await db.losTask.count({ where: { orgId: orgA, title: "after the wait" } })).toBe(0);
    await db.cosWorkflowRun.update({ where: { id: runId }, data: { resumeAt: new Date(Date.now() - 1000) } });
    await executeRun(runId);
    expect((await db.cosWorkflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("succeeded");
    expect(await db.losTask.count({ where: { orgId: orgA, title: "after the wait" } })).toBe(1);

    const [second] = await emitEvent(orgA, "trigger.manual", { leadId }, { onlyWorkflowId: id });
    await setWorkflowStatus(owner, id, "paused");
    await db.cosWorkflowRun.update({ where: { id: second }, data: { resumeAt: new Date(Date.now() - 1000) } });
    await executeRun(second);
    expect((await db.cosWorkflowRun.findUniqueOrThrow({ where: { id: second } })).status).toBe("blocked");
    expect(await db.losTask.count({ where: { orgId: orgA, title: "after the wait" } })).toBe(1);
  });
});
