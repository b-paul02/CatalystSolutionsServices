// In-app notifications, plus (WP-07) email and Slack per each recipient's preference. dedupeKey is unique, so
// retries and re-ticks never duplicate — and the transports only fire when the in-app row was actually created.
import { db } from "@/lib/audit/db";
import { isStaffRole } from "@/lib/leados/rbac";

export type NotifyInput = {
  orgId: string; userId?: string | null; audience: "client" | "staff"; kind: string;
  title: string; body?: string | null; href?: string | null; dedupeKey: string;
};

/** Every kind a person can set preferences for. Unknown kinds fall back to in-app only. */
export const NOTIFICATION_KINDS: { kind: string; label: string }[] = [
  { kind: "approval_requested", label: "Approval requested" }, { kind: "revision_requested", label: "Revision requested" }, { kind: "blocked", label: "Work blocked" },
  { kind: "publish_failed", label: "Publishing failed" }, { kind: "publish_uncertain", label: "Publishing outcome unknown" }, { kind: "connection_failed", label: "Connection failed" },
  { kind: "renewal_due", label: "Renewal due" }, { kind: "access_needed", label: "Access needed" }, { kind: "payment", label: "Payments" }, { kind: "cycle_generated", label: "Monthly cycle generated" },
  { kind: "campaign_draft", label: "Campaign draft ready" }, { kind: "ai_uncertain", label: "AI run needs a person" }, { kind: "ai_credits_low", label: "AI credits low" },
  { kind: "job_failed", label: "Background job failed" }, { kind: "site_down", label: "Website down / back up" }, { kind: "new_lead", label: "New lead (scorecard, form, booking)" },
  { kind: "booking", label: "Booking made / changed" }, { kind: "draft_ready", label: "Content draft ready" }, { kind: "asset_needed", label: "Asset needed" }, { kind: "audit_finished", label: "Site audit finished" }, { kind: "app_error", label: "Application error (staff)" },
];

export async function notify(n: NotifyInput): Promise<void> {
  try {
    await db.cosNotification.create({
      data: { orgId: n.orgId, userId: n.userId ?? null, audience: n.audience, kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 600) ?? null, href: n.href ?? null, dedupeKey: n.dedupeKey.slice(0, 190) },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // already notified
    return;
  }
  await fanOut(n).catch(() => undefined); // a transport failure never fails the caller
}

/** Email / Slack per recipient preference. Recipients: the named user, else every member on that side of the workspace. */
async function fanOut(n: NotifyInput) {
  const members = n.userId
    ? await db.losMembership.findMany({ where: { orgId: n.orgId, userId: n.userId }, include: { user: { select: { email: true } } } })
    : (await db.losMembership.findMany({ where: { orgId: n.orgId }, include: { user: { select: { email: true } } } })).filter((m) => isStaffRole(m.role) === (n.audience === "staff"));
  if (members.length === 0) return;
  const prefs = await db.cosNotificationPref.findMany({ where: { orgId: n.orgId, kind: n.kind, userId: { in: members.map((m) => m.userId) } } });
  const { APP_URL, sendLosMail } = await import("@/lib/leados/email");
  const link = n.href ? (n.href.startsWith("http") ? n.href : `${APP_URL.replace(/\/app$/, "")}${n.href}`) : null;
  let slack = false;
  for (const m of members) {
    const p = prefs.find((x) => x.userId === m.userId);
    if (!p) continue;
    if (p.email) await sendLosMail({ to: m.user.email, subject: n.title.slice(0, 120), text: `${n.title}\n\n${n.body ?? ""}${link ? `\n\n${link}` : ""}`, link: link ?? undefined }).catch(() => undefined);
    if (p.slack) slack = true;
  }
  if (slack) await import("@/lib/leados/webhooksOut").then(({ notifySlack }) => notifySlack(n.orgId, `${n.title}${link ? ` — ${link}` : ""}`));
}

/** Notifications a member should see: addressed to them, or to their side of the workspace. */
export function inboxWhere(orgId: string, userId: string, staff: boolean) {
  return { orgId, OR: [{ userId }, { userId: null, audience: staff ? "staff" : "client" }] };
}

export async function markRead(orgId: string, userId: string, staff: boolean, id?: string) {
  await db.cosNotification.updateMany({ where: { ...inboxWhere(orgId, userId, staff), readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}
