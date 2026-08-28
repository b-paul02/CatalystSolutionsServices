// LeadOS authentication: scrypt passwords, DB-backed sessions (random token,
// hashed at rest), MFA gating, and the tenancy guards every server action and
// route handler must call. A layout/middleware check is never sufficient alone.
import { cookies, headers } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/audit/db";
import { randomToken, sha256 } from "./crypto";
import { can, type ClientRole, type Permission } from "./rbac";
import { verifySession as verifyEnvAdminSession, SESSION_COOKIE as ENV_ADMIN_COOKIE } from "@/lib/audit/adminAuth";

export const LOS_COOKIE = "los_session";
const SESSION_DAYS = 30;

// ── passwords (same scrypt shape as the partner portal) ──────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Minimum bar for new passwords. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  return null;
}

// ── sessions ─────────────────────────────────────────────────────────────────

export async function createLosSession(userId: string, opts?: { mfaPending?: boolean }): Promise<string> {
  const token = randomToken();
  const h = await headers();
  await db.losSession.create({
    data: {
      userId,
      tokenHash: sha256(token),
      mfaPending: opts?.mfaPending ?? false,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
    },
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(LOS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(LOS_COOKIE);
}

export type LosActor = {
  userId: string;
  email: string;
  name: string | null;
  sessionId: string;
  mfaPending: boolean;
  platformRole: string | null;
};

/** The signed-in LeadOS user (MFA-pending sessions included — gate separately). */
export async function currentLosActor(): Promise<LosActor | null> {
  const raw = (await cookies()).get(LOS_COOKIE)?.value;
  if (!raw) return null;
  const session = await db.losSession.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.disabledAt) return null;
  // Touch lastSeenAt at most once a minute to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    db.losSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return {
    userId: session.userId,
    email: session.user.email,
    name: session.user.name,
    sessionId: session.id,
    mfaPending: session.mfaPending,
    platformRole: session.user.platformRole,
  };
}

export class LosAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "LosAuthError";
  }
}

/** A fully signed-in user (MFA passed). Throws 401 otherwise. */
export async function requireLosUser(): Promise<LosActor> {
  const actor = await currentLosActor();
  if (!actor || actor.mfaPending) throw new LosAuthError("Sign in required.", 401);
  return actor;
}

// ── tenancy ──────────────────────────────────────────────────────────────────

export type OrgActor = LosActor & { orgId: string; role: ClientRole };

const ORG_COOKIE = "los_org"; // which org a multi-org user is acting in

export async function setActiveOrg(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });
}

/**
 * The actor plus their active-org membership. Org context comes from the
 * membership row — the cookie only SELECTS among the user's own orgs, so a
 * tampered cookie can never grant access to someone else's tenant.
 */
export async function requireOrg(...anyOf: Permission[]): Promise<OrgActor> {
  const actor = await requireLosUser();
  const memberships = await db.losMembership.findMany({
    where: { userId: actor.userId, org: { status: "active" } },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) throw new LosAuthError("No organization.", 403);
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.orgId === preferred) ?? memberships[0];
  const role = m.role as ClientRole;
  if (anyOf.length > 0 && !anyOf.some((p) => can(role, p))) {
    throw new LosAuthError("Forbidden.", 403);
  }
  return { ...actor, orgId: m.orgId, role };
}

// ── platform admin ───────────────────────────────────────────────────────────

export type PlatformActor = { userId: string | null; email: string; platformRole: string };

/**
 * Platform-side guard. Two ways in: a LosUser with a platformRole, or the
 * marketing-site env-admin cookie (mapped to super_admin).
 */
export async function requirePlatform(...roles: string[]): Promise<PlatformActor> {
  const actor = await currentLosActor();
  if (actor && !actor.mfaPending && actor.platformRole) {
    if (roles.length === 0 || roles.includes(actor.platformRole)) {
      return { userId: actor.userId, email: actor.email, platformRole: actor.platformRole };
    }
    throw new LosAuthError("Forbidden.", 403);
  }
  const adminEmail = await verifyEnvAdminSession((await cookies()).get(ENV_ADMIN_COOKIE)?.value);
  if (adminEmail) return { userId: null, email: adminEmail, platformRole: "super_admin" };
  throw new LosAuthError("Sign in required.", 401);
}
