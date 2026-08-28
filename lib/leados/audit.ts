// Append-only LeadOS audit trail. Never log raw personal data or secrets in
// `data` — ids, counts, and enum-ish values only.
import { db } from "@/lib/audit/db";

export async function logLosAudit(opts: {
  orgId?: string | null;
  actorUserId?: string | null;
  actorType: "user" | "platform_admin" | "api_key" | "system";
  action: string;
  entity: string;
  entityId?: string | null;
  data?: unknown;
  ip?: string | null;
}): Promise<void> {
  await db.losAuditEvent.create({
    data: {
      orgId: opts.orgId ?? null,
      actorUserId: opts.actorUserId ?? null,
      actorType: opts.actorType,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      data: opts.data === undefined ? null : JSON.stringify(opts.data),
      ip: opts.ip ?? null,
    },
  });
}
