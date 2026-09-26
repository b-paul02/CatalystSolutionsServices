"use server";

// CatalystGrowthOS server actions. Tenant always comes from requireOrg()
// (membership rows); ids from the form are only ever looked up INSIDE that org.
// lib/os/* re-checks the specific permission for each mutation.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireLosUser, requireOrg, setActiveOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import {
  addDeliverable, addWorkEvent, createWorkItem, decideApproval, editWorkItem, instantiateProject,
  publishWorkItem, revokeApproval, toggleChecklist, transitionWorkItem, WorkError, requestApproval,
} from "@/lib/os/work";
import { disconnect, isProvider, recheckConnection, syncSearchConsole } from "@/lib/os/connectors";
import { createBaseline, findingToWorkItem, moveFinding } from "@/lib/os/audit";
import { aiAvailable, aiModel, copyProblems, draftContent, generateCalendar, generatePlan, seoBrief } from "@/lib/os/ai";
import { allocationDiff, type Allocation } from "@/lib/os/workflow";
import { entitlements } from "@/lib/os/entitlements";
import { serviceBySlug } from "@/lib/os/catalog";
import { isPillar } from "@/lib/os/pillars";

type State = { error?: string; ok?: string };
const str = (form: FormData, key: string, max = 4000) => String(form.get(key) ?? "").trim().slice(0, max);
const date = (form: FormData, key: string): Date | null => {
  const v = str(form, key, 40);
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// Turn engine errors into form messages; anything unexpected is rethrown.
// A refused action is an ordinary outcome: it comes back as a form message, never as a thrown error (which the
// browser would show as an application error). Unexpected errors still throw.
async function orgOrDeny(...anyOf: Parameters<typeof requireOrg>): Promise<Awaited<ReturnType<typeof requireOrg>> | { error: string }> {
  try { return await requireOrg(...anyOf); } catch (e) { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }
}

async function run(fn: () => Promise<State | void>, paths: string[] = ["/app/work", "/app/approvals", "/app/dashboard"]): Promise<State> {
  try {
    const out = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return out ?? { ok: "Saved." };
  } catch (e) {
    if (e instanceof WorkError) return { error: e.message };
    if (e instanceof Error && e.name === "LosAuthError") return { error: e.message };
    throw e;
  }
}

export async function switchOrg(_p: State, form: FormData): Promise<State> {
  const actor = await requireLosUser();
  const orgId = str(form, "orgId", 60);
  // only among the user's own memberships — requireOrg would ignore anything else anyway
  const m = await db.losMembership.findFirst({ where: { userId: actor.userId, orgId, org: { status: "active" } } });
  if (!m) return { error: "Not a member of that workspace." };
  await setActiveOrg(orgId);
  redirect("/app/dashboard");
}

// ── work items ───────────────────────────────────────────────────────────────

export async function requestService(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.request"); if ("error" in actor) return actor;
  return run(async () => {
    const slug = str(form, "serviceSlug", 40);
    await createWorkItem(actor, {
      title: str(form, "title", 160), type: "change_request", serviceSlug: serviceBySlug[slug] ? slug : null,
      decision: { problem: str(form, "details", 2000), requestedBy: "client" },
    });
    return { ok: "Request sent — your account lead will scope it and come back for approval." };
  });
}

export async function newWorkItem(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  return run(async () => {
    const slug = str(form, "serviceSlug", 40);
    const type = str(form, "type", 20) || "task";
    if (type === "project") {
      if (!serviceBySlug[slug]) throw new WorkError("Pick a service for the project template.");
      await instantiateProject(actor, slug, str(form, "title", 160) || serviceBySlug[slug].title);
      return { ok: "Project created from the service template." };
    }
    await createWorkItem(actor, {
      title: str(form, "title", 160), type, serviceSlug: serviceBySlug[slug] ? slug : null,
      riskTier: Math.min(3, Math.max(0, Number(str(form, "riskTier", 1)) || 1)),
      clientReviewRequired: form.get("clientReviewRequired") !== "off",
      dueAt: date(form, "dueAt"),
      decision: { problem: str(form, "problem", 2000), objective: str(form, "objective", 1000), successMeasure: str(form, "successMeasure", 500) },
    });
    return { ok: "Work item created." };
  });
}

export async function moveWorkItem(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(() => transitionWorkItem(actor, str(form, "id", 60), str(form, "to", 30), str(form, "note", 500) || undefined));
}

/**
 * Staff send an out-of-scope request to the client for a decision. It is the ONLY way a change request gets an
 * approval: staff can ask, never decide; a priced change is a tier-3 decision the workspace owner makes.
 */
export async function requestChangeApproval(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  return run(async () => {
    const item = await db.cosWorkItem.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId }, select: { id: true, type: true, state: true } });
    if (!item || item.type !== "change_request") throw new WorkError("Only a scope change is sent for approval from here.");
    if (item.state !== "scoped") throw new WorkError("Scope the request first (what is included, and the fee if any), then send it.");
    await requestApproval(actor, item.id);
    return { ok: "Sent to the client for a decision." };
  });
}

export async function saveWorkItem(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(async () => {
    const id = str(form, "id", 60);
    const existing = await db.cosWorkItem.findFirst({ where: { id, orgId: actor.orgId }, select: { payload: true } });
    const before = existing?.payload ? (JSON.parse(existing.payload) as Record<string, unknown>) : {};
    const patch: Parameters<typeof editWorkItem>[2] = { title: str(form, "title", 160) || undefined };
    if (form.has("body")) patch.payload = { ...before, body: str(form, "body", 20000), channel: str(form, "channel", 40) || before.channel, cta: str(form, "cta", 300) || before.cta };
    if (form.has("dueAt")) patch.dueAt = date(form, "dueAt");
    if (form.has("scheduledAt")) patch.scheduledAt = date(form, "scheduledAt");
    if (form.has("assigneeId")) {
      const assigneeId = str(form, "assigneeId", 60) || null;
      // assignee must be a member of THIS org
      if (assigneeId && !(await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId: assigneeId } }))) throw new WorkError("Assignee is not in this workspace.");
      patch.assigneeId = assigneeId;
    }
    if (form.has("estMinutes")) patch.commercial = { estMinutes: Number(str(form, "estMinutes", 8)) || 0, incrementalCharge: Number(str(form, "incrementalCharge", 12)) || 0 };
    await editWorkItem(actor, id, patch);
  });
}

export async function logWorkEvent(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(async () => {
    const kind = str(form, "kind", 10) === "time" ? "time" : "comment";
    const text = str(form, "text", 4000);
    if (kind === "comment" && !text) throw new WorkError("Write something first.");
    await addWorkEvent(actor, str(form, "id", 60), { kind, text, minutes: Number(str(form, "minutes", 6)) || undefined, internal: form.get("internal") === "on" });
    return { ok: kind === "time" ? "Time logged." : "Comment added." };
  });
}

export async function newDeliverable(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.execute"); if ("error" in actor) return actor;
  return run(async () => {
    await addDeliverable(actor, str(form, "id", 60), { title: str(form, "title", 160), url: str(form, "url", 500), note: str(form, "note", 1000) });
    return { ok: "Deliverable added." };
  });
}

export async function tickChecklist(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(() => toggleChecklist(actor, str(form, "id", 60), str(form, "key", 60), form.get("done") === "true"));
}

// ── approvals ────────────────────────────────────────────────────────────────

export async function decide(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(async () => {
    const decision = str(form, "decision", 30);
    if (decision !== "approved" && decision !== "approved_with_edits" && decision !== "rejected") throw new WorkError("Pick a decision.");
    const edited = str(form, "editedBody", 20000);
    const subject = await db.cosApproval.findFirst({ where: { id: str(form, "approvalId", 60), orgId: actor.orgId }, select: { subject: true } });
    if (subject?.subject === "variant") {
      await (await import("@/lib/os/content")).decideVariantApproval(actor, str(form, "approvalId", 60), decision, { reason: str(form, "reason", 1000), editedBody: decision === "approved_with_edits" ? edited : undefined });
      return { ok: decision === "rejected" ? "Sent back for revision." : "Approved." };
    }
    await decideApproval(actor, str(form, "approvalId", 60), decision, {
      reason: str(form, "reason", 1000), editedPayload: decision === "approved_with_edits" ? { body: edited } : undefined,
    });
    return { ok: decision === "rejected" ? "Sent back for revision." : "Approved." };
  });
}

export async function revoke(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(() => revokeApproval(actor, str(form, "approvalId", 60), str(form, "reason", 1000)));
}

/** Client signs (or declines) a proposed contract — the only way scope becomes active. */
export async function signContract(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("contract.sign"); if ("error" in actor) return actor;
  return run(async () => {
    const accept = str(form, "decision", 10) === "sign";
    const contract = await db.cosContract.findFirst({ where: { id: str(form, "contractId", 60), orgId: actor.orgId, status: "proposed" } });
    if (!contract) throw new WorkError("Contract not found or already decided.");
    // ONE transaction: the atomic proposed→active claim (two tabs / a double click: exactly one wins), the workspace
    // flip and the credits the scope includes. If anything in here fails, the contract is still "proposed" and no
    // credit exists — there is no state where a grant outlives a failed signature, or a signature misses its grant.
    await db.$transaction(async (tx) => {
      const claimed = await tx.cosContract.updateMany({ where: { id: contract.id, orgId: actor.orgId, status: "proposed" }, data: accept ? { status: "active", signedById: actor.userId, signedAt: new Date() } : { status: "declined", endedAt: new Date() } });
      if (claimed.count !== 1) throw new WorkError("Contract not found or already decided.");
      if (!accept) return;
      await tx.cosWorkspace.updateMany({ where: { orgId: actor.orgId }, data: { kind: "client" } });
      await (await import("@/lib/os/credits")).grantIncludedForContract(contract, actor.userId, tx);
    });
    await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: accept ? "contract.signed" : "contract.declined", entity: "CosContract", entityId: contract.id });

    if (contract.engagementId) {
      const eng = await import("@/lib/os/engagement");
      if (accept) {
        // the client's signature is the ONLY path to "accepted"; onboarding requests follow from the signed services
        await eng.acceptEngagementBySignature(actor.orgId, contract.engagementId, actor.userId);
        await eng.seedChecklist(actor.orgId, contract.engagementId, JSON.parse(contract.services) as string[]);
      } else await eng.declineEngagementByClient(actor.orgId, contract.engagementId, actor.userId, str(form, "reason", 500));
    }
    return { ok: accept ? "Signed — your modules are now active." : "Declined." };
  }, ["/app"]);
}

// ── audit & baseline ─────────────────────────────────────────────────────────

export async function findingMove(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny(); if ("error" in actor) return actor;
  return run(() => moveFinding(actor, str(form, "id", 60), str(form, "to", 30), { note: str(form, "note", 500), label: str(form, "label", 20) || undefined }), ["/app/audit"]);
}

export async function findingToWork(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  return run(async () => {
    const slug = str(form, "serviceSlug", 40);
    const item = await findingToWorkItem(actor, str(form, "id", 60), { serviceSlug: serviceBySlug[slug] ? slug : null, successMeasure: str(form, "successMeasure", 500) });
    return { ok: item.type === "change_request" ? "Outside contracted scope — created as a change request for client approval." : "Work item created." };
  }, ["/app/audit", "/app/work"]);
}

export async function approveBaseline(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage"); if ("error" in actor) return actor;
  return run(async () => {
    const runRow = await db.cosAuditRun.findFirst({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" } });
    if (!runRow) throw new WorkError("Run or import an audit first.");
    const goals = await db.cosGoal.findMany({ where: { orgId: actor.orgId, archivedAt: null } });
    await createBaseline(actor, {
      auditRunId: runRow.id, reason: str(form, "reason", 500),
      snapshot: {
        scores: JSON.parse(runRow.scores), scoringVersion: runRow.scoringVersion, takenAt: new Date().toISOString(),
        kpis: goals.map((g) => ({ metric: g.metric, value: g.currentValue, label: g.currentLabel, unit: g.unit })),
        working: str(form, "working", 2000), notWorking: str(form, "notWorking", 2000), opportunities: str(form, "opportunities", 2000),
      },
    });
    return { ok: "Baseline recorded. It can never be edited — only superseded." };
  }, ["/app/audit", "/app/dashboard"]);
}

// ── strategy ─────────────────────────────────────────────────────────────────

export async function saveGoal(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage", "org.manage"); if ("error" in actor) return actor;
  const target = Number(str(form, "target", 20));
  if (!str(form, "metric", 80) || !Number.isFinite(target)) return { error: "Metric and a numeric target are required." };
  const current = str(form, "currentValue", 20);
  const goal = await db.cosGoal.create({
    data: {
      orgId: actor.orgId, metric: str(form, "metric", 80), target, unit: str(form, "unit", 20) || "count", horizon: str(form, "horizon", 40) || "90 days",
      pillar: isPillar(str(form, "pillar", 40)) ? str(form, "pillar", 40) : null,
      definition: str(form, "definition", 500) || null,
      // an entered number without a connected source is an estimate, never "measured"
      currentValue: current ? Number(current) : null, currentLabel: current ? "estimated" : "unavailable",
      agreedAt: new Date(), agreedById: actor.userId,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "goal.created", entity: "CosGoal", entityId: goal.id });
  revalidatePath("/app/strategy");
  return { ok: "Goal saved." };
}

/** WP-10c · a suggested (draft) goal becomes agreed only when a person accepts it. */
export async function acceptGoal(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("approvals.decide", "strategy.manage"); if ("error" in actor) return actor;
  const r = await db.cosGoal.updateMany({ where: { id: str(form, "id", 60), orgId: actor.orgId, agreedAt: null, archivedAt: null }, data: { agreedAt: new Date(), agreedById: actor.userId } });
  if (r.count === 0) return { error: "Goal not found or already accepted." };
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "goal.accepted", entity: "CosGoal", entityId: str(form, "id", 60) });
  revalidatePath("/app/strategy");
  return { ok: "Goal accepted." };
}

export async function archiveGoal(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage", "org.manage"); if ("error" in actor) return actor;
  await db.cosGoal.updateMany({ where: { id: str(form, "id", 60), orgId: actor.orgId }, data: { archivedAt: new Date() } });
  revalidatePath("/app/strategy");
  return { ok: "Archived." };
}

export async function draftPlan(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage"); if ("error" in actor) return actor;
  if (!aiAvailable()) return { error: "AI is not configured (LLM_API_KEY). Add it, or write the plan manually." };
  const result = await generatePlan(actor.orgId, str(form, "constraints", 2000));
  if (result.problems.length) return { error: `Draft rejected by validators: ${result.problems.join(" ")}` };
  const last = await db.cosPlan.findFirst({ where: { orgId: actor.orgId }, orderBy: { version: "desc" } });
  const plan = await db.cosPlan.create({
    data: { orgId: actor.orgId, version: (last?.version ?? 0) + 1, payload: JSON.stringify({ ...result.plan, validatorNotes: result.notes }), origin: "ai", model: aiModel() },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "plan.drafted", entity: "CosPlan", entityId: plan.id, data: { model: aiModel(), notes: result.notes.length } });
  revalidatePath("/app/strategy");
  return { ok: `Plan v${plan.version} drafted. Review it before sending to the client.` };
}

/** Strategist review gate: draft → in_review (visible to the client for approval). */
export async function submitPlan(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage"); if ("error" in actor) return actor;
  const n = await db.cosPlan.updateMany({ where: { id: str(form, "id", 60), orgId: actor.orgId, status: "draft" }, data: { status: "in_review", reviewedById: actor.userId } });
  if (n.count === 0) return { error: "Plan not found or already submitted." };
  revalidatePath("/app/strategy");
  return { ok: "Sent to the client for approval." };
}

/** Client decision on a plan. Approving supersedes the previous approved version. */
export async function decidePlan(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("approvals.decide"); if ("error" in actor) return actor;
  const approve = str(form, "decision", 10) === "approve";
  const note = str(form, "note", 1000);
  if (!approve && !note) return { error: "A reason is required to reject." };
  const plan = await db.cosPlan.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId, status: "in_review" } });
  if (!plan) return { error: "Plan not found or not awaiting approval." };
  // material allocation change (±5pts) = budget decision → owner only (§6.1 change control)
  const current = await db.cosPlan.findFirst({ where: { orgId: actor.orgId, status: "approved" }, orderBy: { version: "desc" } });
  if (approve && current) {
    const diff = allocationDiff((JSON.parse(current.payload).allocation ?? []) as Allocation[], (JSON.parse(plan.payload).allocation ?? []) as Allocation[]);
    if (diff.material && actor.role !== "owner") return { error: "This plan moves allocation by 5+ points — a workspace owner must approve it." };
  }
  await db.$transaction([
    ...(approve ? [db.cosPlan.updateMany({ where: { orgId: actor.orgId, status: "approved" }, data: { status: "superseded" } })] : []),
    db.cosPlan.update({ where: { id: plan.id }, data: approve ? { status: "approved", approvedById: actor.userId, approvedAt: new Date() } : { status: "rejected", reviewNote: note } }),
  ]);
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: approve ? "plan.approved" : "plan.rejected", entity: "CosPlan", entityId: plan.id, data: { version: plan.version } });
  revalidatePath("/app/strategy");
  return { ok: approve ? "Plan approved." : "Plan rejected." };
}

// ── content & search studios ─────────────────────────────────────────────────

const CHANNELS = ["linkedin", "x", "facebook", "instagram", "blog", "email", "whatsapp"];

// Content work is in scope of whichever contracted service covers it (content,
// social or seo). With none contracted it stays "content" → change request.
async function contentService(orgId: string, channel: string): Promise<string> {
  const ent = await entitlements(orgId);
  const preferred = channel === "blog" || channel === "email" ? ["content", "seo", "social"] : ["social", "content", "seo"];
  return preferred.find((s) => ent.services.has(s)) ?? preferred[0];
}

export async function fillCalendar(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  const ent = await entitlements(actor.orgId);
  if (!ent.modules.has("content")) return { error: "Content Studio is not part of this workspace's contract." };
  if (!aiAvailable()) return { error: "AI is not configured (LLM_API_KEY). Add items manually instead." };
  const channels = form.getAll("channels").map(String).filter((c) => CHANNELS.includes(c));
  if (channels.length === 0) return { error: "Pick at least one channel." };
  const start = date(form, "start") ?? new Date();
  const { items: drafts, dropped } = await generateCalendar(actor.orgId, channels, 14);
  if (drafts.length === 0) return { error: `The model returned nothing usable${dropped.length ? ` (${dropped.length} dropped: ${[...new Set(dropped)].slice(0, 3).join("; ")})` : ""} — try again.` };
  return run(async () => {
    let requests = 0;
    for (const d of drafts.slice(0, 40)) {
      const item = await createWorkItem(actor, {
        title: d.topic.slice(0, 160), type: "content", serviceSlug: await contentService(actor.orgId, d.channel),
        riskTier: 2, scheduledAt: new Date(start.getTime() + d.dayOffset * 86_400_000),
        payload: { channel: d.channel, persona: d.persona, hook: d.hook, format: d.format, cta: d.cta, body: "", provenance: { origin: "ai", model: aiModel() } },
      });
      if (item.type === "change_request") requests++;
    }
    const n = Math.min(40, drafts.length);
    return { ok: requests ? `${n} items created — ${requests} are change requests because content isn't in the contract yet.` : `${n} calendar items created as drafts.` };
  }, ["/app/content", "/app/work"]);
}

export async function newContentItem(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  const channel = str(form, "channel", 20);
  if (!CHANNELS.includes(channel)) return { error: "Pick a channel." };
  return run(async () => {
    await createWorkItem(actor, {
      title: str(form, "title", 160), type: "content", serviceSlug: await contentService(actor.orgId, channel), riskTier: 2,
      scheduledAt: date(form, "scheduledAt"), payload: { channel, hook: str(form, "hook", 300), cta: str(form, "cta", 300), body: "", provenance: { origin: "human" } },
    });
    return { ok: "Added to the calendar." };
  }, ["/app/content"]);
}

export async function aiDraft(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.execute"); if ("error" in actor) return actor;
  if (!aiAvailable()) return { error: "AI is not configured (LLM_API_KEY)." };
  const id = str(form, "id", 60);
  const item = await db.cosWorkItem.findFirst({ where: { id, orgId: actor.orgId } });
  if (!item) return { error: "Work item not found." };
  const p = item.payload ? (JSON.parse(item.payload) as Record<string, string>) : {};
  const draft = await draftContent(actor.orgId, { channel: p.channel ?? "blog", topic: item.title, hook: p.hook, persona: p.persona, format: p.format, cta: p.cta, notes: str(form, "notes", 1000) });
  // a failed draft stays internal — it never reaches the client (§11.2)
  if (draft.problems.length) return { error: `Draft failed checks and was discarded: ${draft.problems.join(" ")}` };
  return run(async () => {
    await editWorkItem(actor, id, { payload: { ...p, body: draft.body, meta: draft.meta, expertiseFlags: draft.expertiseFlags, provenance: { origin: "ai", model: aiModel() } } });
    await addWorkEvent(actor, id, { kind: "ai", model: aiModel(), text: `Draft generated; ${draft.expertiseFlags.length} expertise flag(s).` });
    return { ok: `Draft written. ${draft.expertiseFlags.length} statement(s) flagged for human expertise.` };
  });
}

export async function newSeoBrief(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.manage"); if ("error" in actor) return actor;
  const keyword = str(form, "keyword", 120);
  if (!keyword) return { error: "Enter a target keyword." };
  if (!aiAvailable()) return { error: "AI is not configured (LLM_API_KEY)." };
  const brief = await seoBrief(actor.orgId, keyword);
  return run(async () => {
    await createWorkItem(actor, { title: `Brief: ${keyword}`, type: "content", serviceSlug: "seo", riskTier: 2, payload: { channel: "blog", keyword, brief, body: "", provenance: { origin: "ai", model: aiModel() } } });
    return { ok: "Brief created as a content work item for specialist validation." };
  }, ["/app/search", "/app/work"]);
}

// ── workspace settings ───────────────────────────────────────────────────────

export async function saveBrandProfile(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("os.settings"); if ("error" in actor) return actor;
  const profile = Object.fromEntries(["voice", "audience", "offers", "proofPoints", "dos", "donts", "competitors"].map((k) => [k, str(form, k, 2000)]));
  await db.cosWorkspace.upsert({ where: { orgId: actor.orgId }, update: { brandProfile: JSON.stringify(profile) }, create: { orgId: actor.orgId, brandProfile: JSON.stringify(profile) } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "brand.updated", entity: "CosWorkspace", entityId: actor.orgId });
  revalidatePath("/app/settings/workspace");
  return { ok: "Brand profile saved — every AI draft now uses it." };
}

export async function setKillSwitch(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("os.settings"); if ("error" in actor) return actor;
  const on = str(form, "on", 5) === "true";
  await db.cosWorkspace.upsert({
    where: { orgId: actor.orgId },
    update: { killSwitch: on, killSwitchAt: new Date(), killSwitchBy: actor.userId },
    create: { orgId: actor.orgId, killSwitch: on, killSwitchAt: new Date(), killSwitchBy: actor.userId },
  });
  // surface in-flight external operations for manual reconciliation (§9.3)
  const inFlight = on ? await db.cosWorkItem.count({ where: { orgId: actor.orgId, state: "scheduled" } }) : 0;
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: on ? "killswitch.on" : "killswitch.off", entity: "CosWorkspace", entityId: actor.orgId, data: { inFlight } });
  revalidatePath("/app", "layout");
  return { ok: on ? `Kill switch ON — all outbound actions are blocked. ${inFlight} scheduled item(s) need manual review.` : "Kill switch off." };
}

// ── intelligence: metrics, learnings, reports ────────────────────────────────

const GRADES = ["A", "B", "C", "D"];

/** Manual / imported channel metric. Idempotent per (provider, metric, day). */
export async function recordMetric(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.execute", "strategy.manage"); if ("error" in actor) return actor;
  const provider = str(form, "provider", 20) || "manual";
  const metric = str(form, "metric", 40);
  const d = date(form, "day");
  const value = Number(str(form, "value", 20));
  const grade = str(form, "grade", 1);
  if (!metric || !d || !Number.isFinite(value)) return { error: "Metric, day and a numeric value are required." };
  const dayKey = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  await db.cosMetricPoint.upsert({
    where: { orgId_provider_metric_day: { orgId: actor.orgId, provider, metric, day: dayKey } },
    update: { value, grade: GRADES.includes(grade) ? grade : null },
    create: { orgId: actor.orgId, provider, metric, day: dayKey, value, grade: GRADES.includes(grade) ? grade : null },
  });
  revalidatePath("/app", "layout");
  return { ok: "Recorded." };
}

export async function proposeLearning(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage", "work.review"); if ("error" in actor) return actor;
  if (!str(form, "hypothesis", 500) || !str(form, "result", 1000)) return { error: "Hypothesis and result are required." };
  await db.cosLearning.create({
    data: {
      orgId: actor.orgId, hypothesis: str(form, "hypothesis", 500), result: str(form, "result", 1000), segment: str(form, "segment", 200) || null,
      window: str(form, "window", 100) || null, method: str(form, "method", 300) || null, counts: str(form, "counts", 200) || null, uncertainty: str(form, "uncertainty", 500) || null,
      workItemIds: JSON.stringify(str(form, "workItemId", 60) ? [str(form, "workItemId", 60)] : []),
    },
  });
  revalidatePath("/app/strategy");
  return { ok: "Learning proposed — it informs plans only after a reviewer approves it." };
}

/** Reviewer gate for the knowledge store (§7.3). The proposer cannot approve their own learning. */
export async function reviewLearning(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.review"); if ("error" in actor) return actor;
  const status = str(form, "decision", 10) === "approve" ? "approved" : "rejected";
  const n = await db.cosLearning.updateMany({ where: { id: str(form, "id", 60), orgId: actor.orgId, status: "proposed" }, data: { status, reviewerId: actor.userId } });
  if (n.count === 0) return { error: "Learning not found or already reviewed." };
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `learning.${status}`, entity: "CosLearning", entityId: str(form, "id", 60) });
  revalidatePath("/app/strategy");
  return { ok: `Learning ${status}.` };
}

/** Build a period report from what the system actually knows; missing = "unavailable". */
export async function draftReport(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage", "work.review"); if ("error" in actor) return actor;
  const kind = str(form, "kind", 10) === "weekly" ? "weekly" : "monthly";
  const period = str(form, "period", 10) || new Date().toISOString().slice(0, kind === "weekly" ? 10 : 7);
  const since = new Date(Date.now() - (kind === "weekly" ? 7 : 31) * 86_400_000);
  const orgId = actor.orgId;
  const [baseline, run, delivered, upcoming, points, goals, leads] = await Promise.all([
    db.cosBaseline.findFirst({ where: { orgId }, orderBy: { version: "desc" } }),
    db.cosAuditRun.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    db.cosWorkItem.findMany({ where: { orgId, deliveredAt: { gte: since } }, select: { title: true, studio: true }, take: 50 }),
    db.cosWorkItem.findMany({ where: { orgId, state: { in: ["ready", "in_progress", "internal_qa", "client_review", "approved", "scheduled"] } }, select: { title: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 15 }),
    db.cosMetricPoint.groupBy({ by: ["provider", "metric", "grade"], where: { orgId, day: { gte: since } }, _sum: { value: true } }),
    db.cosGoal.findMany({ where: { orgId, archivedAt: null } }),
    db.losLead.count({ where: { orgId, deletedAt: null, createdAt: { gte: since } } }),
  ]);
  const baseScores = baseline ? ((JSON.parse(baseline.snapshot) as { scores?: Record<string, { score: number | null }> }).scores ?? {}) : {};
  const nowScores = run ? (JSON.parse(run.scores) as Record<string, { score: number | null; label: string }>) : {};
  const metrics = [
    ...Object.entries(nowScores).map(([k, v]) => ({ name: `audit.${k}`, value: v.score, label: v.score === null ? "unavailable" : "measured", baseline: baseScores[k]?.score ?? null })),
    // first-party lead rows are measured; channel metrics carry their attribution grade
    { name: "leads.captured", value: leads, label: "measured", baseline: null },
    ...points.map((p) => ({ name: `${p.provider}.${p.metric}`, value: p._sum.value, label: p.grade === "A" || p.grade === "B" ? "measured" : "estimated", grade: p.grade, baseline: null })),
    ...goals.map((g) => ({ name: `goal.${g.metric}`, value: g.currentValue, label: g.currentLabel, baseline: null, target: g.target })),
  ];
  // Draft narrative grounded ONLY in stored facts. A narrative containing any number that is not one of these
  // facts is discarded and replaced by the plain factual summary; the editor still reviews before publishing.
  const ent = await entitlements(orgId);
  const { businessOutcomes, ATTRIBUTION_LIMITS } = await import("@/lib/os/outcomes");
  const outcomes = await businessOutcomes(orgId, { start: since, end: new Date() }, { includeDemo: ent.demo });
  const facts: Record<string, string | number | null> = {
    "Work delivered": delivered.length, "Enquiries": outcomes.leads.total, "Enquiries through a tagged link": outcomes.leads.known, "Qualified": outcomes.qualified,
    ...Object.fromEntries(Object.entries(outcomes.sales).map(([cur, s]) => [`Recorded sales (${cur})`, (Number(s.valueMinor) / 100).toFixed(2)])),
    ...Object.fromEntries(metrics.filter((m) => !m.name.startsWith("audit.")).map((m) => [m.name, m.value ?? null])),
  };
  const { factualNarrative, groundedNarrative } = await import("@/lib/os/ai");
  const periodLabel = `${kind} report ${period} (${ent.timezone})`;
  let narrative = factualNarrative(periodLabel, facts, ATTRIBUTION_LIMITS), suggestions: { text: string; evidence: string }[] = [], aiDrafted = false;
  if (aiAvailable()) {
    try { const g = await groundedNarrative(orgId, periodLabel, facts, ATTRIBUTION_LIMITS); narrative = g.narrative; suggestions = g.suggestions; aiDrafted = g.ai; } catch { /* keep the factual summary */ }
  }
  const body = {
    metrics, delivered, next: upcoming, narrative, suggestions, provenance: { narrative: aiDrafted ? "ai_draft_checked_against_facts" : "factual_summary", facts },
    limitations: [ATTRIBUTION_LIMITS, "Attributed results are not proof of incremental effect.", ...(baseline ? [] : ["No baseline recorded — comparisons unavailable."])],
  };
  const existing = await db.cosReport.findUnique({ where: { orgId_kind_period: { orgId, kind, period } } });
  if (existing?.status === "published") return { error: `The ${kind} report for ${period} is already published — published reports are immutable.` };
  await db.cosReport.upsert({
    where: { orgId_kind_period: { orgId, kind, period } },
    update: { body: JSON.stringify(body), authorId: actor.userId },
    create: { orgId, kind, period, body: JSON.stringify(body), authorId: actor.userId },
  });
  revalidatePath("/app/reports/notes");
  return { ok: `Draft ${kind} report for ${period} generated — add the narrative and publish.` };
}

export async function publishReport(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("strategy.manage", "work.review"); if ("error" in actor) return actor;
  const report = await db.cosReport.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId, status: "draft" } });
  if (!report) return { error: "Report not found or already published (published reports are immutable)." };
  const narrative = str(form, "narrative", 6000);
  const problems = copyProblems(narrative);
  if (problems.length) return { error: problems.join(" ") };
  const body = { ...(JSON.parse(report.body) as Record<string, unknown>), narrative };
  await db.cosReport.update({ where: { id: report.id }, data: { body: JSON.stringify(body), status: "published", publishedAt: new Date() } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "report.published", entity: "CosReport", entityId: report.id });
  revalidatePath("/app/reports/notes");
  return { ok: "Published to the client." };
}

// ── connections & publishing ─────────────────────────────────────────────────

export async function connectionAction(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("os.settings"); if ("error" in actor) return actor;
  const provider = str(form, "provider", 20);
  const op = str(form, "op", 12);
  if (!isProvider(provider)) return { error: "Unknown provider." };
  try {
    if (op === "disconnect") { await disconnect(actor.orgId, provider, actor.userId); revalidatePath("/app/settings/workspace"); return { ok: "Disconnected — stored tokens destroyed." }; }
    if (op === "sync" && provider === "gsc") { const n = await syncSearchConsole(actor.orgId); revalidatePath("/app/search"); return { ok: `Synced ${n} day(s) of Search Console data.` }; }
    const conn = await recheckConnection(actor.orgId, provider);
    revalidatePath("/app/settings/workspace");
    return conn.status === "verified" ? { ok: "Access test passed." } : { error: conn.lastError ?? "Access test failed." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection error." };
  }
}

export async function publishNow(_p: State, form: FormData): Promise<State> {
  const actor = await orgOrDeny("work.execute"); if ("error" in actor) return actor;
  return run(async () => {
    const externalId = await publishWorkItem(actor, str(form, "id", 60));
    return { ok: `Published (id ${externalId}).` };
  }, ["/app/work", "/app/content"]);
}
