import { requireLosUser } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import SecurityManager from "./SecurityManager";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const actor = await requireLosUser();
  const [user, sessions] = await Promise.all([
    db.losUser.findUnique({ where: { id: actor.userId } }),
    db.losSession.findMany({
      where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);
  return (
    <SecurityManager
      mfaEnabled={Boolean(user?.mfaEnabledAt)}
      currentSessionId={actor.sessionId}
      sessions={sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt.toISOString(),
      }))}
    />
  );
}
