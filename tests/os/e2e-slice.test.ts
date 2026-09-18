// CatalystGrowthOS acceptance slice against the real DB (blueprint §15, E01–E06):
// finding → proposal → accepted → work item → QA → client approval → delivery →
// verified → closed, plus the mandatory negatives (tenant isolation, approval
// bypass, stale approval, out-of-scope work, baseline immutability, kill switch).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/audit/db";
import { programDefaults } from "@/lib/os/catalog";
import { entitlements } from "@/lib/os/entitlements";
import { createBaseline, findingToWorkItem, moveFinding } from "@/lib/os/audit";
import {
  addDeliverable, addWorkEvent, createWorkItem, decideApproval, editWorkItem, getWorkItem,
  instantiateProject, toggleChecklist, transitionWorkItem, type WorkActor,
} from "@/lib/os/work";

const tag = `os-slice-${Date.now()}`;
let orgId: string, otherOrgId: string;
let lead: WorkActor, owner: WorkActor, admin: WorkActor, freelancer: WorkActor, outsider: WorkActor;

async function user(name: string) {
  return (await db.losUser.create({ data: { email: `${tag}-${name}@example.com`, name, demo: true } })).id;
}

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, demo: true } })).id;
  otherOrgId = (await db.losOrg.create({ data: { name: `${tag}-other`, demo: true } })).id;
  await db.cosWorkspace.createMany({ data: [{ orgId, kind: "client", demo: true }, { orgId: otherOrgId, kind: "client", demo: true }] });
  const d = programDefaults("b2b-pipeline-bundle", "growth")!;
  await db.cosContract.create({
    data: { orgId, programSlug: "b2b-pipeline-bundle", tier: "growth", services: JSON.stringify(d.services), modules: JSON.stringify(d.modules), allowances: JSON.stringify(d.allowances), status: "active", signedAt: new Date(), demo: true },
  });
  lead = { orgId, userId: await user("lead"), role: "cgo_lead" };
  owner = { orgId, userId: await user("owner"), role: "owner" };
  admin = { orgId, userId: await user("admin"), role: "admin" };
  freelancer = { orgId, userId: await user("free"), role: "cgo_freelancer" };
  outsider = { orgId: otherOrgId, userId: await user("outsider"), role: "cgo_lead" };
});

afterAll(async () => {
  const orgs = [orgId, otherOrgId];
  await db.cosWorkItem.deleteMany({ where: { orgId: { in: orgs } } }); // cascades events/approvals/deliverables
  await db.losMessageEvent.deleteMany({ where: { message: { orgId: { in: orgs } } } });
  await db.losOutboundMessage.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losActivity.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losConsentEvent.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losLeadSourceRecord.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losLead.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosFinding.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosAuditRun.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosBaseline.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosConnection.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosContract.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosWorkspace.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losAuditEvent.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losOrg.deleteMany({ where: { id: { in: orgs } } });
  await db.losUser.deleteMany({ where: { email: { startsWith: tag } } });
  await db.$disconnect();
});

describe("OS acceptance slice", { timeout: 120_000 }, () => {
  let itemId: string;

  it("entitlements come from the active contract; uncontracted modules stay hidden", async () => {
    const ent = await entitlements(orgId);
    expect(ent.kind).toBe("client");
    expect(ent.modules.has("content")).toBe(true);
    expect(ent.modules.has("ads")).toBe(false);
    expect(ent.services.has("paid-ads")).toBe(false);
  });

  it("finding → evidence checked → proposed → client accepts → traceable work item", async () => {
    const run = await db.cosAuditRun.create({ data: { orgId, url: "https://x.test", scoringVersion: "t", scores: "{}", summary: "{}", demo: true } });
    const finding = await db.cosFinding.create({ data: { orgId, auditRunId: run.id, pillar: "content", text: "No case studies on site", label: "detected", evidence: "crawl: 0 case-study pages", observedAt: new Date() } });
    // staff cannot accept on the client's behalf, and nothing skips the evidence check
    await expect(moveFinding(lead, finding.id, "accepted")).rejects.toThrow();
    await moveFinding(lead, finding.id, "evidence_checked", { label: "verified" });
    await moveFinding(lead, finding.id, "proposed");
    await expect(moveFinding(lead, finding.id, "accepted")).rejects.toThrow("Forbidden");
    await expect(findingToWorkItem(lead, finding.id, {})).rejects.toThrow("accepted");
    await moveFinding(owner, finding.id, "accepted");
    const item = await findingToWorkItem(lead, finding.id, { serviceSlug: "content", successMeasure: "2 case studies live" });
    itemId = item.id;
    expect(item.type).toBe("task");
    expect(item.findingId).toBe(finding.id);
    expect(item.contractId).toBeTruthy();
    expect(JSON.parse(item.decision!).evidence[0].findingId).toBe(finding.id);
  });

  it("MANDATORY NEGATIVE: another tenant cannot read or act on the item", async () => {
    await expect(getWorkItem(outsider, itemId)).rejects.toThrow("not found");
    await expect(transitionWorkItem(outsider, itemId, "scoped")).rejects.toThrow("not found");
    await expect(editWorkItem(outsider, itemId, { title: "pwned" })).rejects.toThrow("not found");
  });

  it("freelancers see only what is assigned to them", async () => {
    await expect(getWorkItem(freelancer, itemId)).rejects.toThrow("not found");
    await editWorkItem(lead, itemId, { assigneeId: freelancer.userId });
    expect((await getWorkItem(freelancer, itemId)).id).toBe(itemId);
  });

  it("delivery → QA → client review; clients can't move work, staff can't approve", async () => {
    await transitionWorkItem(lead, itemId, "scoped");
    await transitionWorkItem(lead, itemId, "ready");
    await expect(transitionWorkItem(owner, itemId, "in_progress")).rejects.toThrow("Forbidden");
    await transitionWorkItem(freelancer, itemId, "in_progress");
    await editWorkItem(freelancer, itemId, { payload: { body: "Case study draft v1" } });
    await addWorkEvent(freelancer, itemId, { kind: "time", minutes: 90 });
    await addDeliverable(freelancer, itemId, { title: "Draft", url: "https://docs.example.com/d/1" });
    await expect(addDeliverable(freelancer, itemId, { title: "x", url: "javascript:alert(1)" })).rejects.toThrow("https");
    await transitionWorkItem(freelancer, itemId, "internal_qa");
    await expect(transitionWorkItem(freelancer, itemId, "client_review")).rejects.toThrow("Forbidden"); // no self-review
    await expect(transitionWorkItem(lead, itemId, "approved")).rejects.toThrow(); // MANDATORY NEGATIVE: no skipping the client
    await transitionWorkItem(lead, itemId, "client_review");
    const approval = await db.cosApproval.findFirstOrThrow({ where: { workItemId: itemId, status: "requested" } });
    await expect(decideApproval(lead, approval.id, "approved")).rejects.toThrow("Forbidden");
    await expect(decideApproval({ ...owner, orgId: otherOrgId }, approval.id, "approved")).rejects.toThrow("not found");
    await expect(decideApproval(owner, approval.id, "rejected")).rejects.toThrow("reason");
  });

  it("MANDATORY NEGATIVE: an edit after the request voids it — the old approval can't be used", async () => {
    const stale = await db.cosApproval.findFirstOrThrow({ where: { workItemId: itemId, status: "requested" } });
    await editWorkItem(lead, itemId, { payload: { body: "Case study draft v2 — new claim added" } });
    const item = await db.cosWorkItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.version).toBe(3);
    expect(item.state).toBe("internal_qa"); // dropped back to QA
    expect((await db.cosApproval.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("revoked");
    await expect(decideApproval(owner, stale.id, "approved")).rejects.toThrow("already revoked");
  });

  it("approve-with-edits stores the reviewed final version and keeps the delta", async () => {
    await transitionWorkItem(lead, itemId, "client_review");
    const approval = await db.cosApproval.findFirstOrThrow({ where: { workItemId: itemId, status: "requested" } });
    await decideApproval(admin, approval.id, "approved_with_edits", { editedPayload: { body: "Case study — client wording" } });
    const item = await db.cosWorkItem.findUniqueOrThrow({ where: { id: itemId } });
    const decided = await db.cosApproval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(item.state).toBe("approved");
    expect(JSON.parse(item.payload!).body).toBe("Case study — client wording");
    expect(decided.contentHash).toBe(item.contentHash); // approval binds to the FINAL version
    expect(JSON.parse(decided.diff!).before.body).toContain("v2");
    await expect(decideApproval(owner, approval.id, "approved")).rejects.toThrow("already");
  });

  it("delivered → verified → closed, with an append-only event trail; time stays internal", async () => {
    await transitionWorkItem(lead, itemId, "delivered");
    await transitionWorkItem(lead, itemId, "verified");
    await transitionWorkItem(lead, itemId, "closed");
    await expect(transitionWorkItem(lead, itemId, "in_progress")).rejects.toThrow("closed");
    const events = await db.cosWorkEvent.findMany({ where: { workItemId: itemId }, orderBy: { createdAt: "asc" } });
    expect(events.filter((e) => e.kind === "transition").map((e) => e.toState)).toEqual(
      ["backlog", "scoped", "ready", "in_progress", "internal_qa", "client_review", "client_review", "delivered", "verified", "closed"],
    );
    expect(events.find((e) => e.kind === "time")).toMatchObject({ minutes: 90, internal: true });
  });

  it("MANDATORY NEGATIVE: out-of-scope work becomes a change request that cannot start unapproved", async () => {
    const cr = await createWorkItem(lead, { title: "Run Google Ads", serviceSlug: "paid-ads", commercial: { incrementalCharge: 25000 } });
    expect(cr.type).toBe("change_request");
    await transitionWorkItem(lead, cr.id, "scoped");
    await expect(transitionWorkItem(lead, cr.id, "ready")).rejects.toThrow("scope");
    const { requestApproval } = await import("@/lib/os/work");
    const approval = await requestApproval(lead, cr.id);
    // paid scope change = spend: an admin can't, the owner can
    await expect(decideApproval(admin, approval.id, "approved")).rejects.toThrow("owner");
    await decideApproval(owner, approval.id, "approved");
    await transitionWorkItem(lead, cr.id, "ready");
  });

  it("a service template instantiates a project with its milestones", async () => {
    const project = await instantiateProject(lead, "seo", "SEO programme");
    expect(project.type).toBe("project");
    expect(await db.cosWorkItem.count({ where: { parentId: project.id, type: "milestone" } })).toBe(4);
  });

  it("MANDATORY NEGATIVE: kill switch blocks a tier-3 launch even with a valid approval", async () => {
    const launch = await createWorkItem(lead, { title: "Publish new pricing page", serviceSlug: "content", riskTier: 3, payload: { body: "page" } });
    for (const s of ["scoped", "ready", "in_progress", "internal_qa", "client_review"]) await transitionWorkItem(lead, launch.id, s);
    const approval = await db.cosApproval.findFirstOrThrow({ where: { workItemId: launch.id, status: "requested" } });
    await expect(decideApproval(admin, approval.id, "approved")).rejects.toThrow("owner"); // tier 3 = named owner
    await decideApproval(owner, approval.id, "approved");
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: true } });
    await expect(transitionWorkItem(lead, launch.id, "delivered")).rejects.toThrow("Kill switch");
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: false } });
    await transitionWorkItem(lead, launch.id, "delivered");
  });

  it("MANDATORY NEGATIVE: kill switch also blocks LeadOS outreach sends for the workspace", async () => {
    const { createLead } = await import("@/lib/leados/leadWrite");
    const { sendOutreachMessage } = await import("@/lib/leados/outreach");
    const created = await createLead({
      orgId, leadType: "b2c", source: "manual", demo: true, verify: false,
      input: { firstName: "Kill", phone: "+917000112299" }, lawfulUse: { purposes: ["sales_contact"], channels: ["whatsapp"] },
    });
    const leadId = (created as { leadId: string }).leadId;
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: true } });
    expect(await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "hi" })).toEqual({ outcome: "blocked", reason: "kill_switch" });
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: false } });
    expect((await sendOutreachMessage({ orgId, leadId, channel: "whatsapp", body: "hi" })).outcome).toBe("sent");
  });

  it("MANDATORY NEGATIVE: publishing refuses unapproved, unsupported, kill-switched and unconnected items — and never double-claims", async () => {
    const { publishWorkItem, requestApproval } = await import("@/lib/os/work");
    const post = await createWorkItem(lead, { title: "LinkedIn post", type: "content", serviceSlug: "content", riskTier: 2, payload: { channel: "linkedin", body: "Hello" } });
    await expect(publishWorkItem(lead, post.id)).rejects.toThrow("approved"); // backlog
    await expect(publishWorkItem(owner, post.id)).rejects.toThrow("Forbidden"); // clients don't publish
    for (const s of ["scoped", "ready", "in_progress", "internal_qa", "client_review"]) await transitionWorkItem(lead, post.id, s);
    const approval = await db.cosApproval.findFirstOrThrow({ where: { workItemId: post.id, status: "requested" } });
    await decideApproval(owner, approval.id, "approved");
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: true } });
    await expect(publishWorkItem(lead, post.id)).rejects.toThrow("Kill switch");
    await db.cosWorkspace.update({ where: { orgId }, data: { killSwitch: false } });
    // no connection → definite failure: state failed, claim released so a later retry is possible
    await expect(publishWorkItem(lead, post.id)).rejects.toThrow("not connected");
    const after = await db.cosWorkItem.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.state).toBe("failed");
    expect(after.outcome).toBeNull();
    // an in-flight / uncertain claim blocks any second publish
    await db.cosWorkItem.update({ where: { id: post.id }, data: { state: "approved", outcome: JSON.stringify({ publishing: true }) } });
    await expect(publishWorkItem(lead, post.id)).rejects.toThrow("already");
    const blog = await createWorkItem(lead, { title: "Blog", type: "content", serviceSlug: "content", riskTier: 2, clientReviewRequired: false, payload: { channel: "blog", body: "x" } });
    for (const s of ["scoped", "ready", "in_progress", "internal_qa", "approved"]) await transitionWorkItem(lead, blog.id, s);
    await expect(publishWorkItem(lead, blog.id)).rejects.toThrow("manually");
    void requestApproval;
  });

  it("QA checklist must be complete before a project passes review", async () => {
    const project = await instantiateProject(lead, "analytics", "Tracking setup");
    await db.cosWorkItem.updateMany({ where: { parentId: project.id }, data: { state: "closed" } });
    for (const s of ["scoped", "ready", "in_progress", "internal_qa"]) await transitionWorkItem(lead, project.id, s);
    await expect(transitionWorkItem(lead, project.id, "approved")).rejects.toThrow("checklist");
    const before = (await db.cosWorkItem.findUniqueOrThrow({ where: { id: project.id } })).contentHash;
    for (const key of ["reconciled", "limits", "labels"]) await toggleChecklist(lead, project.id, key, true);
    expect((await db.cosWorkItem.findUniqueOrThrow({ where: { id: project.id } })).contentHash).toBe(before); // ticks don't void approvals
    await transitionWorkItem(lead, project.id, "approved");
  });

  it("baseline is insert-only: a correction is a linked successor with a reason", async () => {
    const v1 = await createBaseline(lead, { snapshot: { scores: { visibility: 55 } } });
    await expect(createBaseline(lead, { snapshot: { scores: { visibility: 60 } } })).rejects.toThrow("reason");
    await expect(createBaseline(owner, { snapshot: {}, reason: "x" })).rejects.toThrow("Forbidden");
    const v2 = await createBaseline(lead, { snapshot: { scores: { visibility: 60 } }, reason: "PageSpeed re-measured after CDN outage" });
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(JSON.parse((await db.cosBaseline.findUniqueOrThrow({ where: { id: v1.id } })).snapshot).scores.visibility).toBe(55);
  });
});
