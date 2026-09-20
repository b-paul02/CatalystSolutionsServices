// Workflow management. Actor comes from requireOrg() (membership rows); every
// lookup is scoped to actor.orgId. Building needs automations.manage; turning a
// workflow ON needs automations.activate, which Catalyst staff never hold — an
// active workflow acts in the client's name, so the client switches it on.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { encryptField, randomToken, sha256 } from "@/lib/leados/crypto";
import { entitlements } from "@/lib/os/entitlements";
import { WorkError, type WorkActor } from "@/lib/os/work";
import { BLOCKS, KEY_PROVIDERS } from "./catalog";
import { triggerOf, validateDefinition, type Definition } from "./definition";
import { definitionHash } from "./hash";
import { templateByKey } from "./templates";
import { testKeyConnection } from "./blocks";

const MAX_WORKFLOWS = 50;
const EMPTY: Definition = { nodes: [{ id: "n1", type: "trigger.manual", config: {}, position: { x: 40, y: 80 } }], edges: [] };

async function guard(actor: WorkActor, permission: "automations.manage" | "automations.activate") {
  if (!can(actor.role, permission)) throw new WorkError(permission === "automations.activate" ? "Only a workspace owner or admin can turn a workflow on." : "Forbidden.");
  if (!(await entitlements(actor.orgId)).modules.has("automations")) throw new WorkError("Workflows are available to workspaces with an active plan.");
}

const own = async (actor: WorkActor, id: string) => {
  const wf = await db.cosWorkflow.findFirst({ where: { id, orgId: actor.orgId, status: { not: "archived" } } });
  if (!wf) throw new WorkError("Workflow not found.");
  return wf;
};

export async function createWorkflow(actor: WorkActor, input: { name?: string; templateKey?: string }) {
  await guard(actor, "automations.manage");
  if ((await db.cosWorkflow.count({ where: { orgId: actor.orgId, status: { not: "archived" } } })) >= MAX_WORKFLOWS) throw new WorkError(`Limit of ${MAX_WORKFLOWS} workflows reached.`);
  const template = input.templateKey ? templateByKey[input.templateKey] : undefined;
  if (input.templateKey && !template) throw new WorkError("Unknown template.");
  const definition = template?.definition ?? EMPTY;
  const ent = await entitlements(actor.orgId);
  const wf = await db.cosWorkflow.create({
    data: {
      orgId: actor.orgId, name: (input.name?.trim() || template?.name || "Untitled workflow").slice(0, 120), description: template?.description ?? null,
      templateKey: template?.key ?? null, definition: JSON.stringify(definition), triggerType: triggerOf(definition, BLOCKS)?.type ?? null, createdById: actor.userId, demo: ent.demo,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "workflow.created", entity: "CosWorkflow", entityId: wf.id, data: { templateKey: wf.templateKey } });
  return wf;
}

/**
 * Save the canvas. A LOGIC change (hash differs) on an active workflow drops it
 * to draft — it stops receiving events until someone activates the new version.
 * Moving cards around never does.
 */
export async function saveWorkflow(actor: WorkActor, id: string, input: { name?: string; definition: Definition }) {
  await guard(actor, "automations.manage");
  const wf = await own(actor, id);
  const def = input.definition;
  if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges) || JSON.stringify(def).length > 200_000) throw new WorkError("That workflow can't be saved.");
  const changed = definitionHash(def) !== definitionHash(JSON.parse(wf.definition) as Definition);
  const deactivate = changed && wf.status !== "draft";
  const updated = await db.cosWorkflow.update({
    where: { id: wf.id },
    data: {
      name: input.name?.trim().slice(0, 120) || wf.name, definition: JSON.stringify(def), triggerType: triggerOf(def, BLOCKS)?.type ?? null,
      version: changed ? wf.version + 1 : wf.version,
      ...(deactivate ? { status: "draft", activeHash: null } : {}),
    },
  });
  if (changed) await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "workflow.edited", entity: "CosWorkflow", entityId: wf.id, data: { version: updated.version, deactivated: deactivate } });
  return { workflow: updated, deactivated: deactivate, problems: validateDefinition(def, BLOCKS) };
}

export async function activateWorkflow(actor: WorkActor, id: string) {
  await guard(actor, "automations.activate");
  const wf = await own(actor, id);
  const def = JSON.parse(wf.definition) as Definition;
  const problems = validateDefinition(def, BLOCKS);
  if (problems.length) throw new WorkError(`Fix before activating: ${problems[0]}`);
  // every connection the workflow relies on must exist and have passed its live test
  const needed = [...new Set(def.nodes.map((n) => BLOCKS[n.type]?.provider).filter((p): p is string => Boolean(p)))];
  const ready = await db.cosConnection.findMany({ where: { orgId: actor.orgId, provider: { in: needed }, status: "verified" }, select: { provider: true } });
  const missing = needed.filter((p) => !ready.some((r) => r.provider === p));
  if (missing.length) throw new WorkError(`Connect ${missing.map((p) => KEY_PROVIDERS[p]?.label ?? p).join(", ")} first (Workflows → Connections).`);
  const updated = await db.cosWorkflow.update({ where: { id: wf.id }, data: { status: "active", activeHash: definitionHash(def), activatedById: actor.userId, activatedAt: new Date() } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "workflow.activated", entity: "CosWorkflow", entityId: wf.id, data: { version: wf.version, external: def.nodes.filter((n) => BLOCKS[n.type]?.external).length, contacts: def.nodes.filter((n) => BLOCKS[n.type]?.contacts).length } });
  return updated;
}

/** Anyone who can build can also STOP a workflow — stopping is always safe. */
export async function setWorkflowStatus(actor: WorkActor, id: string, status: "paused" | "archived") {
  await guard(actor, "automations.manage");
  const wf = await own(actor, id);
  await db.cosWorkflow.update({ where: { id: wf.id }, data: { status, ...(status === "archived" ? { activeHash: null, hookTokenHash: null } : {}) } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `workflow.${status}`, entity: "CosWorkflow", entityId: wf.id });
}

/** New inbound-webhook address. The token is shown ONCE; only its hash is stored. */
export async function rotateHookToken(actor: WorkActor, id: string): Promise<string> {
  await guard(actor, "automations.manage");
  const wf = await own(actor, id);
  const token = randomToken(24);
  await db.cosWorkflow.update({ where: { id: wf.id }, data: { hookTokenHash: sha256(token) } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "workflow.hook_rotated", entity: "CosWorkflow", entityId: wf.id });
  return token;
}

/** Save a key-based connection. It is "verified" only if the live test passes. */
export async function saveKeyConnection(actor: WorkActor, provider: string, value: string) {
  await guard(actor, "automations.manage");
  if (!KEY_PROVIDERS[provider]) throw new WorkError("Unknown connection.");
  const secret = value.trim();
  if (!secret || secret.length > 2000) throw new WorkError("Paste the key or address.");
  let status = "verified", label: string | null = null, lastError: string | null = null;
  try { label = await testKeyConnection(provider, secret); } catch (e) { status = "failed"; lastError = (e instanceof Error ? e.message : "Test failed.").slice(0, 300); }
  const data = { status, accountLabel: label, lastError, lastCheckedAt: new Date(), accessTokenEnc: encryptField(secret), refreshTokenEnc: null, tokenExpiresAt: null };
  const conn = await db.cosConnection.upsert({ where: { orgId_provider: { orgId: actor.orgId, provider } }, update: data, create: { ...data, orgId: actor.orgId, provider, createdById: actor.userId } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `connection.${status}`, entity: "CosConnection", entityId: conn.id, data: { provider } });
  if (status === "failed") throw new WorkError(lastError ?? "Connection test failed.");
  return conn;
}
