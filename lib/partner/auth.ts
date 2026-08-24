import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/audit/db";
import { verifySession as verifyAdminSession, SESSION_COOKIE as ADMIN_COOKIE } from "@/lib/audit/adminAuth";

export const PARTNER_COOKIE = "partner_session";

export type Role = "partner" | "deal_desk" | "admin" | "finance" | "super_admin";
export type Actor = { userId: string; email: string; role: Role; partnerId: string | null };

const ADMIN_ROLES: Role[] = ["admin", "super_admin"];

// ── passwords ────────────────────────────────────────────────────────────────
// scrypt from node:crypto — no new dependency.

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

/** A readable one-off password for a newly approved partner (F3 emails it). */
export function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

// ── session cookie ───────────────────────────────────────────────────────────

function sign(value: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? "dev-secret")
    .update(value)
    .digest("base64url");
}

export function createPartnerSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function readSignedCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const [value, sig] = [raw.slice(0, i), raw.slice(i + 1)];
  const expected = sign(value);
  if (sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? value : null;
}

// ── who is acting ────────────────────────────────────────────────────────────

/**
 * Resolves the current actor from either session: the portal's own User cookie,
 * or the existing env-account admin cookie (which is mapped to an admin User row
 * so audit entries and the two-admin rate approval have a real actor id).
 */
export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();

  const userId = readSignedCookie(jar.get(PARTNER_COOKIE)?.value);
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId }, include: { partner: true } });
    if (user && !user.disabledAt) {
      return { userId: user.id, email: user.email, role: user.role as Role, partnerId: user.partner?.id ?? null };
    }
  }

  return adminActor();
}

/** The env-account admin session alone, mapped to its User row. */
async function adminActor(): Promise<Actor | null> {
  const jar = await cookies();
  const adminEmail = await verifyAdminSession(jar.get(ADMIN_COOKIE)?.value);
  if (!adminEmail) return null;
  const user = await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, role: "admin" },
  });
  return { userId: user.id, email: user.email, role: user.role as Role, partnerId: null };
}

/**
 * The first session whose role is allowed: partner cookie first, then the
 * admin cookie — so a stale partner_session from testing the portal never
 * shadows a valid admin session on staff surfaces.
 */
export async function actorForRoles(...allowed: Role[]): Promise<Actor | null> {
  const actor = await currentActor();
  if (actor && allowed.includes(actor.role)) return actor;
  const admin = await adminActor();
  return admin && allowed.includes(admin.role) ? admin : null;
}

// ── guards ───────────────────────────────────────────────────────────────────
// Call these INSIDE every mutating server action / route handler. A layout or
// middleware check is never sufficient on its own.

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireRole(...allowed: Role[]): Promise<Actor> {
  const actor = await actorForRoles(...allowed);
  if (!actor) throw new ForbiddenError("Forbidden");
  return actor;
}

/** Admin-only surfaces: applications, partner records, commission rates. */
export function requireAdmin(): Promise<Actor> {
  return requireRole(...ADMIN_ROLES);
}

/** The commission ledger: finance plus admins. */
export function requireFinance(): Promise<Actor> {
  return requireRole("finance", ...ADMIN_ROLES);
}

/** A signed-in partner. Returns the actor with a guaranteed partnerId. */
export async function requirePartner(): Promise<Actor & { partnerId: string }> {
  const actor = await requireRole("partner");
  if (!actor.partnerId) throw new ForbiddenError("No partner record.");
  return actor as Actor & { partnerId: string };
}

/**
 * Ownership check. Partners may only ever touch their own rows; staff bypass.
 * Throws the same generic Forbidden either way so nothing leaks about whether
 * the row exists or whose it is.
 */
export function assertOwns(actor: Actor, partnerId: string | null | undefined): void {
  if (actor.role !== "partner") return;
  if (!partnerId || actor.partnerId !== partnerId) throw new ForbiddenError("Forbidden");
}
