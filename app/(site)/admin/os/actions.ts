"use server";

// CatalystGrowthOS platform-admin actions (agency command center). Every action
// re-checks the platform role. Provisioning is the ONLY way a workspace gets
// staff memberships or a proposed contract — clients never grant those.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { randomToken, sha256 } from "@/lib/leados/crypto";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { isStaffRole } from "@/lib/leados/rbac";
import { importAudit } from "@/lib/os/audit";
import { modulesForServices, programDefaults, SERVICES, TIERS, type TierKey } from "@/lib/os/catalog";
import { WorkError } from "@/lib/os/work";
import type { FormState } from "@/app/app/(auth)/actions";

const OS_ROLES = ["super_admin", "campaign_admin", "support_admin"];
const str = (form: FormData, key: string, max = 2000) => String(form.get(key) ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function invite(orgId: string, email: string, role: string, invitedById: string, orgName: string) {
  const token = randomToken();
  const inv = await db.losInvitation.create({
    data: { orgId, email, role, tokenHash: sha256(token), invitedById, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
  });
  const link = `${APP_URL}/invite/${token}`;
  const mail = await sendLosMail({
    to: email,
    subject: `Your ${orgName} workspace on CatalystGrowthOS`,
    text: `You've been invited to ${orgName} on CatalystGrowthOS as ${role.replace(/_/g, " ")}.\n\nAccept the invitation:\n${link}\n\nThe link expires in 7 days.`,
    link,
  });
  await logLosAudit({ orgId, actorType: "platform_admin", action: "os.invite", entity: "LosInvitation", entityId: inv.id, data: { role } });
  return mail.devLink;
}

/** Create a workspace (optionally from a delivered marketing audit) and invite its owner. */
export async function provisionWorkspace(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...OS_ROLES);
  const leadId = str(form, "leadId", 60);
  const ownerEmail = str(form, "ownerEmail", 200).toLowerCase();
  let name = str(form, "name", 120);
  let website = str(form, "website", 200);
  if (ownerEmail && !EMAIL.test(ownerEmail)) return { error: "Owner email is invalid." };
  if (leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId }, include: { report: true } });
    if (!lead) return { error: "Audit lead not found." };
    if (!lead.report) return { error: "That audit has no delivered report yet." };
    if (await db.cosWorkspace.findFirst({ where: { sourceLeadId: leadId } })) return { error: "A workspace already exists for this audit." };
    website ||= lead.url;
    name ||= (JSON.parse(lead.report.json) as { business_name?: string }).business_name ?? new URL(lead.url).hostname;
  }
  if (!name) return { error: "Workspace name is required." };
  const demo = form.get("demo") === "on";
  const org = await db.losOrg.create({ data: { name, website: website || null, market: str(form, "market", 2) === "US" ? "US" : "IN", industry: str(form, "industry", 80) || null, demo } });
  await db.cosWorkspace.create({ data: { orgId: org.id, kind: "prospect", sourceLeadId: leadId || null, demo } });
  if (admin.userId) await db.losMembership.create({ data: { orgId: org.id, userId: admin.userId, role: "cgo_lead" } });
  let imported = 0;
  if (leadId) {
    try { const run = await importAudit(org.id, leadId, { demo }); imported = await db.cosFinding.count({ where: { auditRunId: run.id } }); }
    catch (e) { if (!(e instanceof WorkError)) throw e; }
  }
  const devLink = ownerEmail ? await invite(org.id, ownerEmail, "owner", admin.userId ?? admin.email, name) : undefined;
  await logLosAudit({ orgId: org.id, actorUserId: admin.userId, actorType: "platform_admin", action: "os.workspace_provisioned", entity: "LosOrg", entityId: org.id, data: { fromLead: Boolean(leadId), findings: imported } });
  revalidatePath("/admin/os");
  return { ok: `Workspace "${name}" created${leadId ? ` with ${imported} audit findings` : ""}${ownerEmail ? `; owner invited (${ownerEmail})` : ""}.${admin.userId ? "" : " You are signed in via the env admin — sign in with a CatalystGrowthOS staff account to work inside it."}`, devLink };
}

export async function addStaff(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...OS_ROLES);
  const orgId = str(form, "orgId", 60);
  const email = str(form, "email", 200).toLowerCase();
  const role = str(form, "role", 30);
  if (!EMAIL.test(email)) return { error: "Invalid email." };
  if (!isStaffRole(role)) return { error: "Pick a staff role." };
  const org = await db.losOrg.findUnique({ where: { id: orgId } });
  if (!org) return { error: "Workspace not found." };
  const user = await db.losUser.findUnique({ where: { email }, include: { memberships: { where: { orgId } } } });
  if (user) {
    if (user.memberships.length) return { error: "Already a member of this workspace." };
    await db.losMembership.create({ data: { orgId, userId: user.id, role } });
    await logLosAudit({ orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "os.staff_added", entity: "LosMembership", entityId: user.id, data: { role } });
    revalidatePath(`/admin/os/${orgId}`);
    return { ok: `${email} added as ${role.replace(/_/g, " ")}.` };
  }
  const devLink = await invite(orgId, email, role, admin.userId ?? admin.email, org.name);
  revalidatePath(`/admin/os/${orgId}`);
  return { ok: `No account yet — invitation sent to ${email}.`, devLink };
}

export async function removeStaff(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...OS_ROLES);
  const m = await db.losMembership.findFirst({ where: { id: str(form, "membershipId", 60), orgId: str(form, "orgId", 60) } });
  if (!m || !isStaffRole(m.role)) return { error: "Not a staff membership." };
  await db.losMembership.delete({ where: { id: m.id } });
  await logLosAudit({ orgId: m.orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "os.staff_removed", entity: "LosMembership", entityId: m.id });
  revalidatePath(`/admin/os/${m.orgId}`);
  return { ok: "Removed." };
}

/** Propose scope: program + tier defaults, edited by the account lead. The client signs in-app. */
export async function proposeContract(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...OS_ROLES);
  const orgId = str(form, "orgId", 60);
  const org = await db.losOrg.findUnique({ where: { id: orgId } });
  if (!org) return { error: "Workspace not found." };
  const kind = str(form, "kind", 20) || "program";
  const tier = (TIERS as readonly string[]).includes(str(form, "tier", 20)) ? (str(form, "tier", 20) as TierKey) : "foundation";
  const programSlug = str(form, "programSlug", 60);
  const defaults = programSlug ? programDefaults(programSlug, tier) : null;
  if (kind === "program" && !defaults) return { error: "Pick a program." };
  const known = new Set(SERVICES.map((s) => s.slug));
  const services = form.getAll("services").map(String).filter((s) => known.has(s));
  if (services.length === 0) return { error: "Pick at least one service." };
  const modules = [...new Set([...modulesForServices(services), ...(form.get("crm") === "on" ? ["crm" as const] : []), ...(form.get("lead_supply") === "on" ? ["lead_supply" as const] : [])])];
  const contract = await db.cosContract.create({
    data: {
      orgId, kind, programSlug: programSlug || null, tier: kind === "program" ? tier : null,
      services: JSON.stringify(services), modules: JSON.stringify(modules),
      allowances: JSON.stringify(defaults?.allowances ?? { deliverablesPerMonth: Number(str(form, "deliverables", 4)) || 0, reviewCycles: 1, aiCredits: 0, responseHours: 48 }),
      scopeDoc: str(form, "scopeDoc", 6000) || (defaults ? defaults.deliverables.join("\n") : null),
      exclusions: str(form, "exclusions", 3000) || (defaults ? defaults.exclusions.join("; ") : null),
      pricing: str(form, "pricing", 300) ? JSON.stringify({ note: str(form, "pricing", 300) }) : null,
      proposedBy: admin.userId ?? admin.email, demo: org.demo,
    },
  });
  await logLosAudit({ orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "contract.proposed", entity: "CosContract", entityId: contract.id, data: { kind, programSlug, tier, services: services.length } });
  revalidatePath(`/admin/os/${orgId}`);
  return { ok: "Scope proposed — the workspace owner sees it on their Overview and signs there." };
}

export async function endContract(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform("super_admin");
  const c = await db.cosContract.findFirst({ where: { id: str(form, "contractId", 60), orgId: str(form, "orgId", 60), status: { in: ["active", "proposed"] } } });
  if (!c) return { error: "Contract not found." };
  await db.cosContract.update({ where: { id: c.id }, data: { status: c.status === "active" ? "ended" : "declined", endedAt: new Date() } });
  await logLosAudit({ orgId: c.orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "contract.ended", entity: "CosContract", entityId: c.id, data: { reason: str(form, "reason", 500) } });
  revalidatePath(`/admin/os/${c.orgId}`);
  return { ok: "Ended." };
}

export async function attachAudit(_p: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...OS_ROLES);
  const orgId = str(form, "orgId", 60);
  const leadId = str(form, "leadId", 60);
  if (!(await db.losOrg.findUnique({ where: { id: orgId } }))) return { error: "Workspace not found." };
  try {
    const run = await importAudit(orgId, leadId, { kind: str(form, "kind", 20) || "initial" });
    await logLosAudit({ orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "audit.attached", entity: "CosAuditRun", entityId: run.id });
    revalidatePath(`/admin/os/${orgId}`);
    return { ok: "Audit attached." };
  } catch (e) {
    if (e instanceof WorkError) return { error: e.message };
    throw e;
  }
}
