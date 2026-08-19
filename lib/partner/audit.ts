import { db } from "@/lib/audit/db";
import type { Actor } from "./auth";

/** Every state change in the portal writes one of these. */
export async function writeAudit(opts: {
  actor: Actor | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
}) {
  await db.auditLog.create({
    data: {
      actorId: opts.actor?.userId ?? null,
      actorRole: opts.actor?.role ?? null,
      entity: opts.entity,
      entityId: opts.entityId,
      action: opts.action,
      beforeJson: opts.before === undefined ? null : json(opts.before),
      afterJson: opts.after === undefined ? null : json(opts.after),
      reason: opts.reason ?? null,
      ip: opts.ip ?? null,
    },
  });
}

// BigInt is not JSON-serialisable; money fields land in audit rows as strings.
function json(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}
