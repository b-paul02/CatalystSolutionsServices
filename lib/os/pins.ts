// WP-42 · comment pins on previews: a pin is a position (percent) plus a CosWorkEvent comment; "request changes"
// bundles the open pins into the revision reason.
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { assertWritable, getWorkItem, WorkError, type WorkActor } from "./work";

export async function addPin(actor: WorkActor, input: { subject: "work_item" | "variant"; subjectId: string; x: number; y: number; text: string }) {
  await assertWritable(actor.orgId);
  const x = Math.min(100, Math.max(0, input.x)), y = Math.min(100, Math.max(0, input.y));
  const text = input.text.trim().slice(0, 2000);
  if (!text) throw new WorkError("Write what should change at this spot.");
  let workItemId: string, version: number, variantId: string | null = null;
  if (input.subject === "variant") {
    const v = await db.cosContentVariant.findFirst({ where: { id: input.subjectId, orgId: actor.orgId } });
    if (!v) throw new WorkError("Variant not found.");
    await getWorkItem(actor, v.workItemId); workItemId = v.workItemId; version = v.version; variantId = v.id;
  } else { const item = await getWorkItem(actor, input.subjectId); workItemId = item.id; version = item.version; }
  if (!can(actor.role, "work.view") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  const ev = await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId, variantId, actorId: actor.userId, actorType: "user", kind: "comment", internal: false, data: JSON.stringify({ text, pin: { x, y } }) } });
  return db.cosPin.create({ data: { orgId: actor.orgId, subject: input.subject, subjectId: input.subjectId, version, x, y, eventId: ev.id, createdById: actor.userId } });
}

export async function resolvePin(actor: WorkActor, id: string) {
  const pin = await db.cosPin.findFirst({ where: { id, orgId: actor.orgId } });
  if (!pin) throw new WorkError("Pin not found.");
  if (!isStaffRole(actor.role) && pin.createdById !== actor.userId) throw new WorkError("Only the author or the team can resolve a pin.");
  await db.cosPin.update({ where: { id }, data: { resolvedAt: new Date() } });
}

export async function openPins(orgId: string, subject: string, subjectId: string) {
  const pins = await db.cosPin.findMany({ where: { orgId, subject, subjectId, resolvedAt: null }, orderBy: { createdAt: "asc" } });
  const events = await db.cosWorkEvent.findMany({ where: { id: { in: pins.map((p) => p.eventId).filter((e): e is string => !!e) } } });
  return pins.map((p, i) => ({ ...p, n: i + 1, text: (() => { try { return (JSON.parse(events.find((e) => e.id === p.eventId)?.data ?? "{}") as { text?: string }).text ?? ""; } catch { return ""; } })() }));
}

/** The text a revision request carries: numbered pins with position. */
export async function pinsSummary(orgId: string, subject: string, subjectId: string): Promise<string> {
  const pins = await openPins(orgId, subject, subjectId);
  return pins.map((p) => `#${p.n} (${Math.round(p.x)}%, ${Math.round(p.y)}%): ${p.text}`).join("\n");
}
