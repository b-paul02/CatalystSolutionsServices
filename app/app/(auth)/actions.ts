"use server";

// LeadOS account lifecycle server actions. Every mutation: validate → rate
// limit → act → audit. Responses never reveal whether an email exists.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/audit/db";
import { rateLimit } from "@/lib/partner/ratelimit";
import {
  clearSessionCookie, createLosSession, currentLosActor, hashPassword, LOS_COOKIE,
  passwordProblem, setActiveOrg, setSessionCookie, verifyPassword,
} from "@/lib/leados/auth";
import { randomToken, sha256, tryDecryptField } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { verifyTotp } from "@/lib/leados/totp";
import { isClientRole } from "@/lib/leados/rbac";

export type FormState = { error?: string; ok?: string; devLink?: string };

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function normEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// ── register ─────────────────────────────────────────────────────────────────

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 120) || null;
  if (!email) return { error: "Enter a valid email address." };
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  if (!rateLimit(`los-register:${await clientIp()}`, 10, 60 * 60_000)) {
    return { error: "Too many attempts. Try again later." };
  }

  const existing = await db.losUser.findUnique({ where: { email } });
  if (!existing) {
    const user = await db.losUser.create({
      data: { email, name, passwordHash: hashPassword(password) },
    });
    await logLosAudit({ actorUserId: user.id, actorType: "user", action: "user.register", entity: "LosUser", entityId: user.id, ip: await clientIp() });
  }
  // Send (or resend) verification either way — response identical for both paths.
  const mail = await sendVerificationMail(email);
  return { ok: "Check your email to verify your account.", devLink: mail.devLink };
}

async function sendVerificationMail(email: string) {
  const token = randomToken();
  await db.losEmailToken.create({
    data: { email, purpose: "verify_email", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3_600_000) },
  });
  const link = `${APP_URL}/verify?token=${token}`;
  return sendLosMail({
    to: email,
    subject: "Verify your LeadOS account",
    text: `Welcome to LeadOS.\n\nVerify your email to continue:\n${link}\n\nThe link expires in 24 hours.`,
    link,
  });
}

export async function verifyEmailToken(token: string): Promise<{ ok: boolean }> {
  const row = await db.losEmailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== "verify_email" || row.usedAt || row.expiresAt < new Date()) return { ok: false };
  await db.$transaction([
    db.losEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.losUser.update({ where: { email: row.email }, data: { emailVerifiedAt: new Date() } }),
  ]);
  const user = await db.losUser.findUnique({ where: { email: row.email } });
  await logLosAudit({ actorUserId: user?.id, actorType: "user", action: "user.verify_email", entity: "LosUser", entityId: user?.id });
  return { ok: true };
}

// ── login / logout ───────────────────────────────────────────────────────────

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Enter a valid email address." };
  if (!rateLimit(`los-login:${await clientIp()}`, 20, 15 * 60_000)) {
    return { error: "Too many attempts. Try again later." };
  }
  const user = await db.losUser.findUnique({ where: { email } });
  if (!user || user.disabledAt || !verifyPassword(password, user.passwordHash)) {
    return { error: "Incorrect email or password." };
  }
  if (!user.emailVerifiedAt) {
    const mail = await sendVerificationMail(email);
    return { error: "Email not verified yet — we sent you a new link.", devLink: mail.devLink };
  }
  const mfa = Boolean(user.mfaEnabledAt && user.mfaSecretEnc);
  const token = await createLosSession(user.id, { mfaPending: mfa });
  await setSessionCookie(token);
  await logLosAudit({ actorUserId: user.id, actorType: "user", action: "user.login", entity: "LosUser", entityId: user.id, ip: await clientIp() });
  redirect(mfa ? "/app/mfa" : "/app/dashboard");
}

export async function verifyMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await currentLosActor();
  if (!actor) redirect("/app/login");
  if (!actor.mfaPending) redirect("/app/dashboard");
  if (!rateLimit(`los-mfa:${actor.userId}`, 10, 15 * 60_000)) {
    return { error: "Too many attempts. Try again later." };
  }
  const user = await db.losUser.findUnique({ where: { id: actor.userId } });
  if (!user?.mfaSecretEnc) redirect("/app/dashboard");
  const secret = tryDecryptField(user.mfaSecretEnc);
  if (!secret) {
    // Fail closed: never bypass MFA, never crash. (Happens after an encryption
    // key change — an administrator must reset the user's MFA.)
    return { error: "Your two-factor setup can't be read (the platform encryption key changed). Ask an administrator to reset your MFA." };
  }
  if (!verifyTotp(secret, String(form.get("code") ?? ""))) {
    return { error: "That code didn't match. Try again." };
  }
  await db.losSession.update({ where: { id: actor.sessionId }, data: { mfaPending: false } });
  redirect("/app/dashboard");
}

export async function logout(): Promise<void> {
  const actor = await currentLosActor();
  if (actor) {
    await db.losSession.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
  }
  await clearSessionCookie();
  redirect("/app/login");
}

// ── password reset ───────────────────────────────────────────────────────────

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normEmail(form.get("email"));
  if (!email) return { error: "Enter a valid email address." };
  if (!rateLimit(`los-reset:${await clientIp()}`, 5, 60 * 60_000)) {
    return { error: "Too many attempts. Try again later." };
  }
  const user = await db.losUser.findUnique({ where: { email } });
  let devLink: string | undefined;
  if (user) {
    const token = randomToken();
    await db.losEmailToken.create({
      data: { email, userId: user.id, purpose: "reset_password", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const link = `${APP_URL}/reset?token=${token}`;
    const mail = await sendLosMail({
      to: email,
      subject: "Reset your LeadOS password",
      text: `Reset your LeadOS password:\n${link}\n\nThe link expires in 1 hour. If you didn't request this, ignore this email.`,
      link,
    });
    devLink = mail.devLink;
  }
  return { ok: "If that account exists, a reset link is on its way.", devLink };
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const row = await db.losEmailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== "reset_password" || row.usedAt || row.expiresAt < new Date()) {
    return { error: "This reset link is invalid or expired." };
  }
  const user = await db.losUser.findUnique({ where: { email: row.email } });
  if (!user) return { error: "This reset link is invalid or expired." };
  await db.$transaction([
    db.losEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.losUser.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }),
    // Password change revokes every existing session.
    db.losSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await logLosAudit({ actorUserId: user.id, actorType: "user", action: "user.reset_password", entity: "LosUser", entityId: user.id, ip: await clientIp() });
  return { ok: "Password updated. You can sign in now." };
}

// ── invitations ──────────────────────────────────────────────────────────────

/** Accept an invite: signed-in path or create-account path, one action. */
export async function acceptInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const invite = await db.losInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { org: true } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date() || !isClientRole(invite.role)) {
    return { error: "This invitation is invalid or expired." };
  }

  let actor = await currentLosActor();
  if (actor && actor.email !== invite.email) {
    return { error: `This invitation is for ${invite.email}. Sign out first to accept it.` };
  }

  if (!actor) {
    // Create-account path: the invite email is pre-verified by possession of the link.
    const password = String(form.get("password") ?? "");
    const weak = passwordProblem(password);
    if (weak) return { error: weak };
    const name = String(form.get("name") ?? "").trim().slice(0, 120) || null;
    const existing = await db.losUser.findUnique({ where: { email: invite.email } });
    const user =
      existing ??
      (await db.losUser.create({
        data: { email: invite.email, name, passwordHash: hashPassword(password), emailVerifiedAt: new Date() },
      }));
    if (existing && !verifyPassword(password, existing.passwordHash)) {
      return { error: "An account with this email already exists — enter its password to continue." };
    }
    const session = await createLosSession(user.id);
    await setSessionCookie(session);
    actor = await currentLosActor();
    if (!actor) return { error: "Something went wrong. Try again." };
  }

  await db.$transaction([
    db.losMembership.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId: actor.userId } },
      update: {},
      create: { orgId: invite.orgId, userId: actor.userId, role: invite.role },
    }),
    db.losInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  await setActiveOrg(invite.orgId);
  await logLosAudit({ orgId: invite.orgId, actorUserId: actor.userId, actorType: "user", action: "team.invite_accepted", entity: "LosInvitation", entityId: invite.id });
  redirect("/app/dashboard");
}

