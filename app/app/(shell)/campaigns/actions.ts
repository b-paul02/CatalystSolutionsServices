"use server";

// Campaign lifecycle actions (client side). Status machine:
// draft → in_review → approved → active ⇄ paused → completed / rejected.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import {
  defaultFormSpec, defaultPageSpec, sanitizeFormSpec, validateCampaign,
  type Distribution, type PageSpec,
} from "@/lib/leados/campaigns";
import { randomToken } from "@/lib/leados/crypto";
import type { FormState } from "../../(auth)/actions";

export async function createCampaign(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("campaigns.manage");
  const name = String(form.get("name") ?? "").trim().slice(0, 160);
  const type = String(form.get("type") ?? "hosted_page");
  const objective = String(form.get("objective") ?? "generate_inquiries");
  if (name.length < 3) return { error: "Name the campaign." };
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId } });
  const campaign = await db.losCampaign.create({
    data: {
      orgId: actor.orgId, name, type, objective,
      formSpec: JSON.stringify(defaultFormSpec()),
      pageSpec: JSON.stringify(defaultPageSpec(org?.name ?? "our team")),
      distribution: JSON.stringify({ mode: "round_robin", userIds: [], slaMinutes: 60, ackEmail: true } satisfies Distribution),
      offer: JSON.stringify({ product: "", geography: "", language: "en", budget: "", expectedVolume: "" }),
      createdById: actor.userId,
      demo: org?.demo ?? false,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "campaign.create", entity: "LosCampaign", entityId: campaign.id });
  redirect(`/app/campaigns/${campaign.id}`);
}

async function ownCampaign(orgId: string, id: string) {
  const c = await db.losCampaign.findFirst({ where: { id, orgId } });
  if (!c) throw new Error("Campaign not found.");
  return c;
}

/** Saves one wizard section (offer | form | page | distribution) from JSON. */
export async function saveCampaignSection(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("campaigns.manage");
  const id = String(form.get("campaignId"));
  const section = String(form.get("section"));
  const campaign = await ownCampaign(actor.orgId, id);
  if (!["draft", "rejected", "approved", "active", "paused"].includes(campaign.status)) {
    return { error: "This campaign can't be edited right now." };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return { error: "Invalid data." };
  }
  const data: Record<string, string> = {};
  if (section === "form") data.formSpec = JSON.stringify(sanitizeFormSpec(payload));
  else if (section === "page") {
    const p = payload as Partial<PageSpec>;
    const current = JSON.parse(campaign.pageSpec ?? "{}") as PageSpec;
    data.pageSpec = JSON.stringify({
      ...current,
      template: p.template && ["clean", "split", "compact"].includes(p.template) ? p.template : current.template ?? "clean",
      headline: String(p.headline ?? current.headline).slice(0, 200),
      body: String(p.body ?? current.body).slice(0, 2000),
      cta: String(p.cta ?? current.cta).slice(0, 60),
      brandColor: p.brandColor && /^#[0-9a-fA-F]{6}$/.test(p.brandColor) ? p.brandColor : current.brandColor ?? "#6d28d9",
      thankYouMessage: String(p.thankYouMessage ?? current.thankYouMessage).slice(0, 500),
      thankYouRedirect: p.thankYouRedirect ? String(p.thankYouRedirect).slice(0, 300) : undefined,
      whatsappNumber: p.whatsappNumber ? String(p.whatsappNumber).slice(0, 20) : undefined,
      calendarUrl: p.calendarUrl ? String(p.calendarUrl).slice(0, 300) : undefined,
    } satisfies PageSpec);
  } else if (section === "offer") {
    data.offer = JSON.stringify(payload).slice(0, 4000);
  } else if (section === "distribution") {
    const d = payload as Partial<Distribution>;
    const members = await db.losMembership.findMany({ where: { orgId: actor.orgId }, select: { userId: true } });
    const valid = new Set(members.map((m) => m.userId));
    data.distribution = JSON.stringify({
      mode: d.mode === "fixed" ? "fixed" : "round_robin",
      userIds: (Array.isArray(d.userIds) ? d.userIds : []).filter((u) => valid.has(String(u))).slice(0, 50),
      slaMinutes: Math.max(5, Math.min(24 * 60, Number(d.slaMinutes) || 60)),
      ackEmail: Boolean(d.ackEmail),
      ackTemplate: d.ackTemplate ? String(d.ackTemplate).slice(0, 2000) : undefined,
    } satisfies Distribution);
  } else {
    return { error: "Unknown section." };
  }
  await db.losCampaign.update({ where: { id }, data });
  revalidatePath(`/app/campaigns/${id}`);
  return { ok: "Saved." };
}

export async function submitCampaignForReview(campaignId: string): Promise<{ problems: { severity: string; message: string }[] }> {
  const actor = await requireOrg("campaigns.manage");
  const campaign = await ownCampaign(actor.orgId, campaignId);
  if (!["draft", "rejected"].includes(campaign.status)) return { problems: [] };
  const problems = validateCampaign({
    name: campaign.name,
    formSpec: sanitizeFormSpec(JSON.parse(campaign.formSpec ?? "{}")),
    pageSpec: JSON.parse(campaign.pageSpec ?? "{}"),
    offerText: campaign.offer ?? "",
  });
  if (problems.some((p) => p.severity === "error")) return { problems };
  await db.losCampaign.update({ where: { id: campaignId }, data: { status: "in_review", reviewNote: null } });
  await db.losComplianceReview.create({
    data: {
      subjectKind: "campaign", subjectId: campaignId, orgId: actor.orgId,
      status: "pending", submittedById: actor.userId,
      evidence: JSON.stringify({
        name: campaign.name, type: campaign.type, objective: campaign.objective,
        consent: JSON.parse(campaign.formSpec ?? "{}"),
        warnings: problems,
      }),
      demo: campaign.demo,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "campaign.submit_review", entity: "LosCampaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { problems };
}

export async function launchCampaign(campaignId: string): Promise<FormState> {
  const actor = await requireOrg("campaigns.manage");
  const campaign = await ownCampaign(actor.orgId, campaignId);
  if (!["approved", "paused"].includes(campaign.status)) {
    return { error: "Campaign must be approved before launch." };
  }
  const last = await db.losCampaignVersion.findFirst({ where: { campaignId }, orderBy: { version: "desc" } });
  await db.$transaction([
    db.losCampaignVersion.create({
      data: {
        campaignId, version: (last?.version ?? 0) + 1,
        formSpec: campaign.formSpec ?? "{}", pageSpec: campaign.pageSpec ?? "{}",
      },
    }),
    db.losCampaign.update({ where: { id: campaignId }, data: { status: "active", launchedAt: campaign.launchedAt ?? new Date() } }),
  ]);
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "campaign.launch", entity: "LosCampaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { ok: "Campaign is live." };
}

export async function setCampaignStatus(campaignId: string, status: "paused" | "completed"): Promise<void> {
  const actor = await requireOrg("campaigns.manage");
  const campaign = await ownCampaign(actor.orgId, campaignId);
  if (campaign.status !== "active" && status === "paused") return;
  await db.losCampaign.update({ where: { id: campaignId }, data: { status } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: `campaign.${status}`, entity: "LosCampaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
}

export async function addTrackingLink(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("campaigns.manage");
  const campaignId = String(form.get("campaignId"));
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  if (!label) return { error: "Label the link (e.g. 'Facebook post', 'Event QR')." };
  await ownCampaign(actor.orgId, campaignId);
  await db.losTrackingLink.create({
    data: { campaignId, label, code: randomToken(6) },
  });
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { ok: "Link created." };
}
