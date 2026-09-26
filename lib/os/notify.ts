// In-app notifications. dedupeKey is unique, so retries and re-ticks never duplicate.
// ponytail: in-app only; add email digests through lib/leados/email when someone asks.
import { db } from "@/lib/audit/db";

export type NotifyInput = {
  orgId: string; userId?: string | null; audience: "client" | "staff"; kind: string;
  title: string; body?: string | null; href?: string | null; dedupeKey: string;
};

export async function notify(n: NotifyInput): Promise<void> {
  try {
    await db.cosNotification.create({
      data: { orgId: n.orgId, userId: n.userId ?? null, audience: n.audience, kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 600) ?? null, href: n.href ?? null, dedupeKey: n.dedupeKey.slice(0, 190) },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // already notified
  }
}

/** Notifications a member should see: addressed to them, or to their side of the workspace. */
export function inboxWhere(orgId: string, userId: string, staff: boolean) {
  return { orgId, OR: [{ userId }, { userId: null, audience: staff ? "staff" : "client" }] };
}

export async function markRead(orgId: string, userId: string, staff: boolean, id?: string) {
  await db.cosNotification.updateMany({ where: { ...inboxWhere(orgId, userId, staff), readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}
