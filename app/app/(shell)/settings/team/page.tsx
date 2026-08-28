import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import TeamManager from "./TeamManager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requireOrg("leads.view"); // any member can see the roster
  const [members, invites] = await Promise.all([
    db.losMembership.findMany({
      where: { orgId: actor.orgId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.losInvitation.findMany({
      where: { orgId: actor.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <TeamManager
      canManage={can(actor.role, "team.manage")}
      isOwner={actor.role === "owner"}
      selfUserId={actor.userId}
      members={members.map((m) => ({
        id: m.id, userId: m.userId, role: m.role,
        email: m.user.email, name: m.user.name,
      }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role }))}
    />
  );
}
