"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { allocatePlan, type AllocationResult } from "@/lib/leados/allocation";
import { creditTokens } from "@/lib/leados/tokens";
import type { FormState } from "@/app/app/(auth)/actions";

const PLAN_ROLES = ["super_admin", "campaign_admin"];

export async function createPlan(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...PLAN_ROLES);
  const orgId = String(form.get("orgId"));
  const org = await db.losOrg.findUnique({ where: { id: orgId } });
  if (!org) return { error: "Pick an organization." };
  const name = String(form.get("name") ?? "").trim().slice(0, 160);
  if (!name) return { error: "Name the plan." };
  const dailyQuota = Math.max(1, parseInt(String(form.get("dailyQuota")), 10) || 0);
  const leadType = String(form.get("leadType")) === "b2b" ? "b2b" : "b2c";
  const startDate = new Date(String(form.get("startDate") ?? ""));
  if (isNaN(startDate.getTime())) return { error: "Set a start date." };
  const endRaw = String(form.get("endDate") ?? "");
  const targeting = {
    countries: String(form.get("countries") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    states: String(form.get("states") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    cities: String(form.get("cities") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  const workingDays = String(form.get("workingDays") ?? "1,2,3,4,5")
    .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 7);
  const plan = await db.losLeadPlan.create({
    data: {
      orgId, name, leadType, dailyQuota,
      startDate,
      endDate: endRaw ? new Date(endRaw) : null,
      workingDays: JSON.stringify(workingDays.length ? workingDays : [1, 2, 3, 4, 5]),
      holidays: JSON.stringify(String(form.get("holidays") ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
      deliveryTimezone: String(form.get("timezone") ?? "Asia/Kolkata"),
      deliveryHour: Math.min(23, Math.max(0, parseInt(String(form.get("deliveryHour") ?? "9"), 10) || 9)),
      purpose: String(form.get("purpose") ?? "sales_contact"),
      targeting: JSON.stringify(targeting),
      minQuality: Math.max(0, parseInt(String(form.get("minQuality") ?? "0"), 10) || 0),
      exclusivity: String(form.get("exclusivity")) === "shared" ? "shared" : "exclusive",
      rolloverPolicy: ["none", "week", "campaign_end", "approval"].includes(String(form.get("rollover"))) ? String(form.get("rollover")) : "none",
      demo: form.get("demo") === "on",
    },
  });
  await logLosAudit({ orgId, actorType: "platform_admin", actorUserId: admin.userId, action: "plan.create", entity: "LosLeadPlan", entityId: plan.id });
  revalidatePath("/admin/leados/plans");
  return { ok: `Plan "${name}" created for ${org.name}.` };
}

export async function setPlanStatus(planId: string, status: "active" | "paused" | "ended"): Promise<void> {
  const admin = await requirePlatform(...PLAN_ROLES);
  await db.losLeadPlan.update({ where: { id: planId }, data: { status } });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: `plan.${status}`, entity: "LosLeadPlan", entityId: planId });
  revalidatePath("/admin/leados/plans");
}

export async function previewPlanAllocation(planId: string, runDate?: string): Promise<AllocationResult> {
  await requirePlatform(...PLAN_ROLES);
  return allocatePlan(planId, { execute: false, runDate });
}

export async function executePlanAllocation(planId: string, runDate?: string): Promise<AllocationResult> {
  const admin = await requirePlatform(...PLAN_ROLES);
  const result = await allocatePlan(planId, { execute: true, runDate });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "allocation.manual_execute", entity: "LosLeadPlan", entityId: planId, data: { runDate: result.runDate, allocated: result.allocated } });
  revalidatePath("/admin/leados/plans");
  return result;
}

// ── replacements ─────────────────────────────────────────────────────────────

export async function decideReplacement(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...PLAN_ROLES);
  const id = String(form.get("id"));
  const approve = String(form.get("decision")) === "approve";
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const rep = await db.losLeadReplacement.findUnique({ where: { id }, include: { allocation: true } });
  if (!rep || rep.status !== "requested") return { error: "Not an open request." };
  await db.losLeadReplacement.update({
    where: { id },
    data: { status: approve ? "approved" : "rejected", decisionNote: note || null, decidedById: admin.userId ?? admin.email },
  });
  await db.losAllocation.update({
    where: { id: rep.allocationId },
    data: { state: approve ? "replaced" : "rejected" },
  });
  if (approve) {
    await creditTokens({
      orgId: rep.allocation.orgId, amount: rep.allocation.tokensCharged,
      kind: "replacement_credit", refId: rep.allocationId,
      note: "Approved lead replacement", createdById: admin.userId,
    });
  }
  await logLosAudit({ orgId: rep.allocation.orgId, actorType: "platform_admin", actorUserId: admin.userId, action: `replacement.${approve ? "approved" : "rejected"}`, entity: "LosLeadReplacement", entityId: id });
  revalidatePath("/admin/leados/plans");
  return { ok: approve ? "Approved — tokens credited back." : "Rejected." };
}

// ── tokens ───────────────────────────────────────────────────────────────────

export async function grantTokens(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform("super_admin");
  const orgId = String(form.get("orgId"));
  const amount = parseInt(String(form.get("amount")), 10);
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (!orgId || !Number.isFinite(amount) || amount === 0) return { error: "Pick an org and a non-zero amount." };
  if (!note) return { error: "A reason is required for manual token changes." };
  await db.losTokenLedger.create({
    data: { orgId, delta: amount, kind: amount > 0 ? "grant" : "adjustment", note, createdById: admin.userId ?? admin.email },
  });
  await logLosAudit({ orgId, actorType: "platform_admin", actorUserId: admin.userId, action: "tokens.manual", entity: "LosTokenLedger", data: { amount } });
  revalidatePath("/admin/leados/tokens");
  return { ok: `${amount > 0 ? "+" : ""}${amount} tokens recorded.` };
}

export async function addTokenRate(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform("super_admin");
  const leadType = String(form.get("leadType")) === "b2b" ? "b2b" : "b2c";
  const industry = String(form.get("industry") ?? "").trim() || null;
  const exclusiveTokens = parseInt(String(form.get("exclusiveTokens")), 10);
  const sharedTokens = parseInt(String(form.get("sharedTokens")), 10);
  const verifiedBonusPct = parseInt(String(form.get("verifiedBonusPct") ?? "50"), 10);
  if (!(exclusiveTokens > 0) || !(sharedTokens > 0)) return { error: "Token amounts must be positive." };
  await db.losTokenRate.create({
    data: { leadType, industry, exclusiveTokens, sharedTokens, verifiedBonusPct: Math.max(0, verifiedBonusPct), createdById: admin.userId ?? admin.email },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "tokens.rate_added", entity: "LosTokenRate", data: { leadType, industry, exclusiveTokens, sharedTokens } });
  revalidatePath("/admin/leados/tokens");
  return { ok: "Rate added (effective immediately; history preserved)." };
}
