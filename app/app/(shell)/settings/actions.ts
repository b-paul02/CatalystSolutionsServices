"use server";

// Settings mutations: org profile, team, MFA, sessions, API keys.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg, requireLosUser } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { decryptField, encryptField, randomToken, sha256 } from "@/lib/leados/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/leados/totp";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { isClientRole } from "@/lib/leados/rbac";
import type { FormState } from "../../(auth)/actions";

// ── organization ─────────────────────────────────────────────────────────────

export async function updateOrg(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("org.manage");
  const name = String(form.get("name") ?? "").trim().slice(0, 160);
  const website = String(form.get("website") ?? "").trim().slice(0, 200) || null;
  const industry = String(form.get("industry") ?? "").trim().slice(0, 80) || null;
  if (name.length < 2) return { error: "Organization name is required." };
  await db.losOrg.update({ where: { id: actor.orgId }, data: { name, website, industry } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "org.update", entity: "LosOrg", entityId: actor.orgId });
  revalidatePath("/app/settings");
  return { ok: "Organization updated." };
}

// ── team ─────────────────────────────────────────────────────────────────────

export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("team.manage");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!isClientRole(role) || role === "owner") return { error: "Pick a valid role." };

  const existingUser = await db.losUser.findUnique({ where: { email }, include: { memberships: true } });
  if (existingUser?.memberships.some((m) => m.orgId === actor.orgId)) {
    return { error: "That person is already a member." };
  }

  const token = randomToken();
  const invite = await db.losInvitation.create({
    data: {
      orgId: actor.orgId, email, role,
      tokenHash: sha256(token),
      invitedById: actor.userId,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId } });
  const link = `${APP_URL}/invite/${token}`;
  const mail = await sendLosMail({
    to: email,
    subject: `You're invited to ${org?.name} on LeadOS`,
    text: `${actor.name ?? actor.email} invited you to join ${org?.name} on LeadOS as ${role.replace(/_/g, " ")}.\n\nAccept the invitation:\n${link}\n\nThe link expires in 7 days.`,
    link,
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "team.invite", entity: "LosInvitation", entityId: invite.id, data: { role } });
  revalidatePath("/app/settings/team");
  return { ok: `Invitation sent to ${email}.`, devLink: mail.devLink };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const actor = await requireOrg("team.manage");
  await db.losInvitation.updateMany({
    where: { id: inviteId, orgId: actor.orgId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "team.invite_revoked", entity: "LosInvitation", entityId: inviteId });
  revalidatePath("/app/settings/team");
}

export async function changeMemberRole(membershipId: string, role: string): Promise<void> {
  const actor = await requireOrg("team.manage");
  if (!isClientRole(role)) return;
  const target = await db.losMembership.findFirst({ where: { id: membershipId, orgId: actor.orgId } });
  if (!target) return;
  if (target.role === "owner") return; // owners are never demoted here
  if (role === "owner" && actor.role !== "owner") return; // only an owner can promote to owner
  await db.losMembership.update({ where: { id: target.id }, data: { role } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "team.role_changed", entity: "LosMembership", entityId: target.id, data: { role } });
  revalidatePath("/app/settings/team");
}

export async function removeMember(membershipId: string): Promise<void> {
  const actor = await requireOrg("team.manage");
  const target = await db.losMembership.findFirst({ where: { id: membershipId, orgId: actor.orgId } });
  if (!target || target.role === "owner" || target.userId === actor.userId) return;
  await db.losMembership.delete({ where: { id: target.id } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "team.member_removed", entity: "LosMembership", entityId: target.id });
  revalidatePath("/app/settings/team");
}

// ── MFA ──────────────────────────────────────────────────────────────────────

export async function startMfaSetup(): Promise<{ secret: string; uri: string }> {
  const actor = await requireLosUser();
  const secret = generateTotpSecret();
  await db.losUser.update({
    where: { id: actor.userId },
    data: { mfaSecretEnc: encryptField(secret), mfaEnabledAt: null },
  });
  return { secret, uri: totpUri(secret, actor.email) };
}

export async function confirmMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireLosUser();
  const user = await db.losUser.findUnique({ where: { id: actor.userId } });
  if (!user?.mfaSecretEnc) return { error: "Start MFA setup first." };
  if (!verifyTotp(decryptField(user.mfaSecretEnc), String(form.get("code") ?? ""))) {
    return { error: "That code didn't match. Check your authenticator app." };
  }
  await db.losUser.update({ where: { id: actor.userId }, data: { mfaEnabledAt: new Date() } });
  await logLosAudit({ actorUserId: actor.userId, actorType: "user", action: "user.mfa_enabled", entity: "LosUser", entityId: actor.userId });
  revalidatePath("/app/settings/security");
  return { ok: "Two-factor authentication is on." };
}

export async function disableMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireLosUser();
  const user = await db.losUser.findUnique({ where: { id: actor.userId } });
  if (!user?.mfaSecretEnc || !user.mfaEnabledAt) return { error: "MFA is not enabled." };
  if (!verifyTotp(decryptField(user.mfaSecretEnc), String(form.get("code") ?? ""))) {
    return { error: "Enter a valid current code to turn MFA off." };
  }
  await db.losUser.update({ where: { id: actor.userId }, data: { mfaSecretEnc: null, mfaEnabledAt: null } });
  await logLosAudit({ actorUserId: actor.userId, actorType: "user", action: "user.mfa_disabled", entity: "LosUser", entityId: actor.userId });
  revalidatePath("/app/settings/security");
  return { ok: "Two-factor authentication is off." };
}

// ── sessions ─────────────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string): Promise<void> {
  const actor = await requireLosUser();
  await db.losSession.updateMany({
    where: { id: sessionId, userId: actor.userId },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/app/settings/security");
}

export async function revokeOtherSessions(): Promise<void> {
  const actor = await requireLosUser();
  await db.losSession.updateMany({
    where: { userId: actor.userId, revokedAt: null, id: { not: actor.sessionId } },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/app/settings/security");
}

// ── API keys ─────────────────────────────────────────────────────────────────

export async function createApiKey(_prev: FormState, form: FormData): Promise<FormState & { secret?: string }> {
  const actor = await requireOrg("apikeys.manage");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Name the key so you can recognize it later." };
  const secret = `los_${randomToken(24)}`;
  await db.losApiKey.create({
    data: {
      orgId: actor.orgId, name,
      prefix: secret.slice(0, 10),
      keyHash: sha256(secret),
      createdById: actor.userId,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "apikey.create", entity: "LosApiKey", data: { name } });
  revalidatePath("/app/settings/api-keys");
  return { ok: "Key created. Copy it now — it won't be shown again.", secret };
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const actor = await requireOrg("apikeys.manage");
  await db.losApiKey.updateMany({
    where: { id: keyId, orgId: actor.orgId },
    data: { revokedAt: new Date() },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "apikey.revoke", entity: "LosApiKey", entityId: keyId });
  revalidatePath("/app/settings/api-keys");
}

