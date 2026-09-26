"use server";

// AI Studio + AI-credit server actions. Same contract as v2.ts: tenant from requireOrg() (membership rows),
// every id looked up INSIDE that org, capability re-checked in lib/os/*. The browser never supplies a price,
// a payer or an org: it names a tool, its inputs, a quote id and its own idempotency key.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { WorkError, assertWritable } from "@/lib/os/work";
import { CreditError } from "@/lib/os/credits";
import * as S from "@/lib/os/studio";
import { createCreditCheckout } from "@/lib/os/creditPurchase";

export type StudioState = {
  error?: string; ok?: string; href?: string;
  /** set when a run was refused for credit reasons — the page offers the purchase path, manual editing is untouched */
  needCredits?: { available: number; needed: number; canBuy: boolean };
  quote?: { id: string; requestId: string; maxCredits: number; expiresAt: string; available: number; payer: string; synthetic: boolean };
};

const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$") && !["quoteId", "requestId", "toolKey", "purpose"].includes(k))) as Record<string, string>;

async function guard<T extends StudioState>(fn: () => Promise<T>): Promise<T | StudioState> {
  try { return await fn(); } catch (e) {
    if (e instanceof CreditError && e.code === "insufficient") { const a = await requireOrg(); return { error: e.message, needCredits: { available: e.detail.available ?? 0, needed: e.detail.needed ?? 0, canBuy: can(a.role, "org.billing") && !isStaffRole(a.role) } }; }
    if (e instanceof WorkError) return { error: e.message };
    if (e instanceof Error && e.name === "LosAuthError") return { error: e.message };
    throw e;
  }
}

export async function studioQuote(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("ai.use");
    const q = await S.createQuote(actor, String(form.get("toolKey") ?? ""), fields(form), String(form.get("purpose") ?? "") || undefined);
    return { quote: { id: q.quote.id, requestId: crypto.randomUUID(), maxCredits: q.quote.maxCredits, expiresAt: q.quote.expiresAt.toISOString(), available: q.wallet.available, payer: q.quote.payer, synthetic: q.synthetic } };
  });
}

export async function studioRun(_p: StudioState, form: FormData): Promise<StudioState> {
  let operationId = "";
  const out = await guard(async () => {
    const actor = await requireOrg("ai.use");
    const r = await S.executeQuote(actor, { quoteId: String(form.get("quoteId") ?? ""), requestId: String(form.get("requestId") ?? ""), toolKey: String(form.get("toolKey") ?? ""), inputs: fields(form) });
    operationId = r.operation.id;
    // start now rather than waiting for the next scheduler tick; the queued job stays as the crash-safe fallback
    // (runOperation's atomic claim means whichever gets there first runs it, the other does nothing)
    try { after(() => S.runOperation(r.operation.id).catch(() => {})); } catch { /* outside a request (tests, scripts): the job queue runs it */ }
    return {};
  });
  if (operationId) { revalidatePath("/app/studio", "layout"); redirect(`/app/studio/history/${operationId}`); }
  return out;
}

export async function studioSave(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("ai.use");
    const [channel, format] = String(form.get("saveAs") ?? "").split(":");
    const start = String(form.get("startDate") ?? "");
    const saved = await S.saveOperation(actor, String(form.get("operationId") ?? ""), {
      title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "").slice(0, 60_000),
      parts: String(form.get("parts") ?? "").split(/\n\s*---\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 40),
      campaignId: String(form.get("campaignId") ?? "") || null, channel: channel || undefined, format: format || undefined, startDate: start ? new Date(start) : null,
    });
    revalidatePath("/app", "layout");
    return { ok: `Saved as ${saved.length === 1 ? "a draft" : `${saved.length} drafts`} in Content. It still needs review and approval before anything is published.` };
  });
}

export async function studioSaveCampaign(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("ai.use");
    const s = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
    const r = await S.saveBriefAsCampaign(actor, s("operationId", 60), {
      name: s("name", 160), engagementId: s("engagementId", 60) || null, goalId: s("goalId", 60) || null, objective: s("objective", 1000), audience: s("audience", 1000),
      keyMessage: s("keyMessage", 1000), offer: s("offer", 600), cta: s("cta", 200), channels: form.getAll("channels").map(String),
    });
    revalidatePath("/app", "layout");
    return { ok: r.created ? "Saved as a draft campaign. No credits were used." : "This brief was already saved as a campaign. Nothing new was created.", href: `/app/content/campaigns/${r.id}` };
  });
}

// ── credits: purchase, caps, staff authorisation ─────────────────────────────

export async function creditsBuy(_p: StudioState, form: FormData): Promise<StudioState> {
  let url = "";
  const out = await guard(async () => {
    const actor = await requireOrg("org.billing");
    const h = await headers();
    const origin = process.env.SITE_URL?.replace(/\/+$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    url = (await createCreditCheckout(actor, String(form.get("packId") ?? ""), origin, actor.email)).url;
    return {};
  });
  if (url) redirect(url);
  return out;
}

export async function creditsMemberLimit(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("team.manage");
    await assertWritable(actor.orgId);
    const userId = String(form.get("userId") ?? ""), raw = String(form.get("monthlyCredits") ?? "").trim();
    if (!(await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId }, select: { id: true } }))) throw new WorkError("Member not found.");
    if (raw === "") await db.cosCreditMemberLimit.deleteMany({ where: { orgId: actor.orgId, userId } });
    else {
      if (!/^\d{1,8}$/.test(raw)) throw new WorkError("Enter a whole number of credits, or leave blank for no personal limit.");
      await db.cosCreditMemberLimit.upsert({ where: { orgId_userId: { orgId: actor.orgId, userId } }, update: { monthlyCredits: Number(raw), updatedBy: actor.userId }, create: { orgId: actor.orgId, userId, monthlyCredits: Number(raw), updatedBy: actor.userId } });
    }
    await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "ai_credits.member_limit_set", entity: "LosUser", entityId: userId, data: { monthlyCredits: raw === "" ? null : Number(raw) } });
    revalidatePath("/app/settings/ai-credits");
    return { ok: "Saved." };
  });
}

export async function creditsSettings(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("org.billing");
    const raw = String(form.get("lowBalanceAt") ?? "").trim();
    if (raw !== "" && !/^\d{1,8}$/.test(raw)) throw new WorkError("Enter a whole number of credits, or leave blank for no notice.");
    const lowBalanceAt = raw === "" ? null : Number(raw), lowBalanceEmail = form.get("lowBalanceEmail") === "on";
    const before = await db.cosCreditWallet.findUnique({ where: { orgId: actor.orgId }, select: { lowBalanceAt: true } });
    // a changed threshold is a new question, so the emailed notice is re-armed (the 24 h cooldown still applies)
    await db.cosCreditWallet.upsert({ where: { orgId: actor.orgId }, update: { lowBalanceAt, lowBalanceEmail, ...(before?.lowBalanceAt !== lowBalanceAt ? { lowArmed: true } : {}) }, create: { orgId: actor.orgId, lowBalanceAt, lowBalanceEmail } });
    revalidatePath("/app/settings/ai-credits");
    return { ok: "Saved." };
  });
}

/** The CLIENT decides whether Catalyst staff may spend the client's credits — staff can never grant this to themselves. */
export async function creditsStaffAuth(_p: StudioState, form: FormData): Promise<StudioState> {
  return guard(async () => {
    const actor = await requireOrg("org.billing");
    if (isStaffRole(actor.role)) throw new WorkError("Forbidden.");
    await assertWritable(actor.orgId);
    const revoke = String(form.get("revokeId") ?? "");
    if (revoke) {
      await db.cosAiBillingAuth.updateMany({ where: { id: revoke, orgId: actor.orgId, revokedAt: null }, data: { revokedAt: new Date() } });
      await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "ai_credits.staff_auth_revoked", entity: "CosAiBillingAuth", entityId: revoke });
    } else {
      const max = String(form.get("maxCredits") ?? "").trim(), until = new Date(String(form.get("expiresAt") ?? "")), note = String(form.get("note") ?? "").trim().slice(0, 300);
      if (!/^\d{1,8}$/.test(max) || Number(max) <= 0) throw new WorkError("Enter the most credits staff may use.");
      if (Number.isNaN(until.getTime()) || until <= new Date()) throw new WorkError("Pick an end date in the future.");
      if (!note) throw new WorkError("Say what this is for, so it can be audited later.");
      const a = await db.cosAiBillingAuth.create({ data: { orgId: actor.orgId, grantedById: actor.userId, maxCredits: Number(max), expiresAt: until, note } });
      await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "ai_credits.staff_auth_granted", entity: "CosAiBillingAuth", entityId: a.id, data: { maxCredits: Number(max) } });
    }
    revalidatePath("/app/settings/ai-credits");
    return { ok: "Saved." };
  });
}
