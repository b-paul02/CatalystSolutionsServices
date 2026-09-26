"use server";

// GrowthOS v2 server actions. Same rules as actions.ts: the tenant comes from requireOrg()
// (membership rows), form ids are only looked up INSIDE that org, and lib/os/* re-checks the
// capability for every mutation. Module entitlement is enforced here too — not just in the nav.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { isStaffRole, type Permission } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { WorkError, assertWritable, instantiateProject } from "@/lib/os/work";
import { entitlements } from "@/lib/os/entitlements";
import type { ModuleKey } from "@/lib/os/catalog";
import * as E from "@/lib/os/engagement";
import * as C from "@/lib/os/content";
import * as P from "@/lib/os/publishing";
import * as M from "@/lib/os/commercial";
import { createOpportunity, setOpportunityStatus } from "@/lib/os/outcomes";
import { recordManualSnapshot, importSnapshots } from "@/lib/os/metrics";
import { updateAsset } from "@/lib/os/assets";
import { markRead } from "@/lib/os/notify";
import { validTimeZone } from "@/lib/os/time";
import { aiAvailable, draftVariants } from "@/lib/os/ai";
import { CHANNELS, formatSpec } from "@/lib/os/channels";

type State = { error?: string; ok?: string };
const str = (form: FormData, key: string, max = 4000) => String(form.get(key) ?? "").trim().slice(0, max);
const opt = (form: FormData, key: string, max = 4000) => (form.has(key) ? str(form, key, max) : undefined);
const date = (form: FormData, key: string): Date | null => { const v = str(form, key, 40); const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const int = (form: FormData, key: string): number | null => { const v = str(form, key, 12); return v && /^\d+$/.test(v) ? Number(v) : null; };
const lines = (form: FormData, key: string) => str(form, key, 20000).split(/\n\s*---\s*\n|\n{2,}/).map((s) => s.trim()).filter(Boolean);

async function actorFor(module: ModuleKey | null, ...anyOf: Permission[]) {
  const actor = await requireOrg(...anyOf);
  if (module) {
    const ent = await entitlements(actor.orgId);
    if (!ent.modules.has(module)) throw new WorkError("This area is not part of your current scope.");
  }
  return actor;
}

async function run(fn: () => Promise<State | void>, paths: string[] = ["/app"]): Promise<State> {
  try {
    const out = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return out ?? { ok: "Saved." };
  } catch (e) {
    if (e instanceof WorkError) return { error: e.message };
    if (e instanceof Error && e.name === "LosAuthError") return { error: e.message };
    throw e;
  }
}

// ── engagement ───────────────────────────────────────────────────────────────

export async function engagementMove(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await E.moveEngagement(a, str(form, "id", 60), str(form, "to", 30), str(form, "reason", 1000)); });
}
export async function engagementHold(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await E.setHold(a, str(form, "id", 60), str(form, "hold", 30), str(form, "reason", 1000), str(form, "ownerId", 60) || null); });
}
export async function engagementUpdate(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("engagement");
    const fee = (k: string) => (form.has(k) ? (str(form, k, 20) ? M.toMinor(str(form, k, 20)) : null) : undefined);
    await E.updateEngagement(a, str(form, "id", 60), {
      name: opt(form, "name", 160), goalFocus: form.has("goalFocusSent") ? form.getAll("goalFocus").map(String) : undefined, readiness: opt(form, "readiness", 30),
      nextAction: opt(form, "nextAction", 300), nextActionSide: opt(form, "nextActionSide", 12), nextActionDueAt: form.has("nextActionDueAt") ? date(form, "nextActionDueAt") : undefined,
      currency: opt(form, "currency", 3)?.toUpperCase() || undefined, setupFeeMinor: fee("setupFee"), recurringFeeMinor: fee("recurringFee"), billingInterval: opt(form, "billingInterval", 12),
      reviewCycles: form.has("reviewCycles") ? int(form, "reviewCycles") : undefined, responseHours: form.has("responseHours") ? int(form, "responseHours") : undefined,
      startsAt: form.has("startsAt") ? date(form, "startsAt") : undefined, endsAt: form.has("endsAt") ? date(form, "endsAt") : undefined, renewalAt: form.has("renewalAt") ? date(form, "renewalAt") : undefined,
      renewalNoticeDays: int(form, "renewalNoticeDays") ?? undefined, renewalMode: opt(form, "renewalMode", 10),
    });
  });
}
export async function kickoffBuild(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("engagement", "work.manage");
    const id = str(form, "id", 60);
    await E.getEngagement(a, id);
    await db.cosEngagement.update({ where: { id }, data: { kickoffSummary: await E.buildKickoffSummary(a.orgId, id) } });
    return { ok: "Kickoff summary refreshed from the stored records." };
  });
}
export async function checklistAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await E.addChecklistItem(a, str(form, "engagementId", 60), { kind: str(form, "kind", 10), label: str(form, "label", 300), ownerSide: str(form, "ownerSide", 10), dueAt: date(form, "dueAt"), note: str(form, "note", 1000) }); });
}
export async function checklistResolve(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await E.resolveChecklistItem(a, str(form, "id", 60), str(form, "status", 20), { note: opt(form, "note", 1000), assetId: str(form, "assetId", 60) || undefined, dueAt: form.has("dueAt") ? date(form, "dueAt") : undefined }); });
}
export async function dependencyAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await E.addDependency(a, str(form, "workItemId", 60), { workItemId: str(form, "onWorkItemId", 60) || undefined, checklistId: str(form, "onChecklistId", 60) || undefined }, str(form, "note", 300)); }, ["/app/work"]);
}
export async function dependencyRemove(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await E.removeDependency(a, str(form, "id", 60)); }, ["/app/work"]);
}
export async function cycleGenerate(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("engagement", "work.manage");
    const e = await E.getEngagement(a, str(form, "id", 60));
    const r = await E.generateCycle(a.orgId, e.id);
    return r.skipped ? { ok: `Nothing generated: ${r.skipped}.` } : { ok: `${r.created} recurring item(s) created for this period.` };
  });
}
export async function roadmapStart(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("engagement", "work.manage");
    const e = await E.getEngagement(a, str(form, "id", 60));
    const slug = str(form, "serviceSlug", 40);
    const p = await instantiateProject(a, slug, str(form, "title", 160) || slug, false, { engagementId: e.id, goalId: str(form, "goalId", 60) || null });
    return { ok: p.type === "project" ? "Delivery project created with its milestones, owners and dependencies." : "That service is outside the signed scope — a change request was raised for the client to approve." };
  });
}
export async function handover(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); const r = await E.handOver(a, str(form, "id", 60)); return { ok: r.readOnly ? "Handed over. The workspace is now read-only; history and exports stay available." : "Handed over. Other engagements keep this workspace active." }; });
}

// ── discovery profile, sources, claims, workspace time ───────────────────────

const PROFILE_FIELDS = ["businessModel", "audience", "offers", "geography", "website", "tools", "salesProcess", "baseline", "targets", "constraints", "competitors", "brandVoice"] as const;
export async function profileSave(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    // the client describes their own business; staff help fill it in
    const a = await actorFor(null, "os.settings", "work.request", "work.manage");
    await assertWritable(a.orgId);
    const data = Object.fromEntries(PROFILE_FIELDS.filter((f) => form.has(f)).map((f) => [f, str(form, f, 4000) || null]));
    const pillars = form.has("contentPillars") ? str(form, "contentPillars", 1000).split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 8) : undefined;
    const prev = await db.cosBusinessProfile.findUnique({ where: { orgId: a.orgId } });
    await db.cosBusinessProfile.upsert({ where: { orgId: a.orgId }, update: { ...data, ...(pillars ? { contentPillars: pillars } : {}), version: (prev?.version ?? 0) + 1, updatedById: a.userId }, create: { orgId: a.orgId, ...data, contentPillars: pillars ?? [], updatedById: a.userId } });
    // discovery input on the checklist completes itself once the essentials are in
    const p = await db.cosBusinessProfile.findUniqueOrThrow({ where: { orgId: a.orgId } });
    if (p.businessModel && p.audience && p.offers) {
      const items = await db.cosChecklistItem.findMany({ where: { orgId: a.orgId, key: "discovery_profile", status: "pending" } });
      for (const it of items) await E.resolveChecklistItem({ ...a, role: a.role }, it.id, "available", { note: "Discovery profile completed." }).catch(() => {});
    }
    await logLosAudit({ orgId: a.orgId, actorUserId: a.userId, actorType: "user", action: "profile.saved", entity: "CosBusinessProfile", entityId: a.orgId });
  });
}
export async function sourceAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await C.addSource(a, { title: str(form, "title", 200), url: str(form, "url", 500) || undefined, excerpt: str(form, "excerpt", 6000), assetId: str(form, "assetId", 60) || null }); return { ok: "Source added." }; });
}
export async function claimPropose(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await C.proposeClaim(a, str(form, "text", 500), { sourceId: str(form, "sourceId", 60) || null, evidenceNote: str(form, "evidenceNote", 500) }); return { ok: "Claim proposed — the client approves it before it is used." }; });
}
export async function claimDecide(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await C.decideClaim(a, str(form, "id", 60), str(form, "status", 10) === "retired" ? "retired" : "approved"); });
}
export async function workspaceTime(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor(null, "os.settings");
    const tz = str(form, "timezone", 60), currency = str(form, "currency", 3).toUpperCase();
    if (!validTimeZone(tz)) throw new WorkError("Unknown time zone.");
    if (currency && !/^[A-Z]{3}$/.test(currency)) throw new WorkError("Currency must be a 3-letter code.");
    await db.cosWorkspace.updateMany({ where: { orgId: a.orgId }, data: { timezone: tz, currency: currency || null } });
    return { ok: "Saved. Scheduled times keep their instant; they are shown in the new zone." };
  });
}

// ── content studio ───────────────────────────────────────────────────────────

export async function campaignCreate(_p: State, form: FormData): Promise<State> {
  let id = "";
  const out = await run(async () => {
    const a = await actorFor("content");
    id = (await C.createCampaign(a, { name: str(form, "name", 160), goalId: str(form, "goalId", 60) || null, engagementId: str(form, "engagementId", 60) || null, objective: str(form, "objective", 1000), audience: str(form, "audience", 1000), keyMessage: str(form, "keyMessage", 1000), offer: str(form, "offer", 600), cta: str(form, "cta", 200), destinationUrl: str(form, "destinationUrl", 500) || undefined, channels: form.getAll("channels").map(String), paidMode: str(form, "paidMode", 10), startsAt: date(form, "startsAt"), endsAt: date(form, "endsAt") })).id;
  }, ["/app/content"]);
  if (id) redirect(`/app/content/campaigns/${id}`);
  return out;
}
export async function campaignUpdate(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content");
    const r = await C.updateCampaign(a, str(form, "id", 60), { name: opt(form, "name", 160), status: opt(form, "status", 12), goalId: opt(form, "goalId", 60), objective: opt(form, "objective", 1000), audience: opt(form, "audience", 1000), keyMessage: opt(form, "keyMessage", 1000), offer: opt(form, "offer", 600), cta: opt(form, "cta", 200), destinationUrl: opt(form, "destinationUrl", 500), channels: form.has("channelsSent") ? form.getAll("channels").map(String) : undefined, paidMode: opt(form, "paidMode", 10) });
    return { ok: r.briefChanged ? "Saved. Open variants of this campaign are flagged for review against the new brief — their approvals are unchanged." : "Saved." };
  }, ["/app/content"]);
}
export async function captureFormLink(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content", "work.manage", "campaigns.manage");
    const camp = await db.cosCampaign.findFirst({ where: { id: str(form, "campaignId", 60), orgId: a.orgId } });
    const lf = await db.losCampaign.findFirst({ where: { id: str(form, "losCampaignId", 60), orgId: a.orgId } });
    if (!camp || !lf) throw new WorkError("Campaign or form not found.");
    await db.losCampaign.update({ where: { id: lf.id }, data: { marketingCampaignId: camp.id } });
    return { ok: "Lead-capture form linked: its enquiries count towards this campaign." };
  }, ["/app/content"]);
}
export async function masterCreate(_p: State, form: FormData): Promise<State> {
  let id = "";
  const out = await run(async () => {
    const a = await actorFor("content");
    const item = await C.createMaster(a, { title: str(form, "title", 160), campaignId: str(form, "campaignId", 60) || null, goalId: str(form, "goalId", 60) || null, brief: str(form, "brief", 4000), body: str(form, "body", 20000), pillar: str(form, "pillar", 80), sourceIds: form.getAll("sourceIds").map(String), claimIds: form.getAll("claimIds").map(String) });
    if (item.type !== "content") return { ok: "Content is outside the signed scope — a change request was raised for the client to approve." };
    id = item.id;
  }, ["/app/content"]);
  if (id) redirect(`/app/content/${id}`);
  return out;
}
const variantInput = (form: FormData) => ({ title: opt(form, "title", 200), body: opt(form, "body", 20000), parts: form.has("parts") ? lines(form, "parts") : undefined, cta: opt(form, "cta", 200), destinationUrl: opt(form, "destinationUrl", 500), mediaAssetIds: form.has("mediaSent") ? form.getAll("mediaAssetIds").map(String) : undefined, connectionId: form.has("connectionId") ? str(form, "connectionId", 60) || null : undefined });
export async function variantCreate(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content");
    const [channel, format] = str(form, "channelFormat", 40).split(":");
    await C.createVariant(a, str(form, "masterId", 60), { channel, format, ...variantInput(form) });
    return { ok: "Variant added." };
  }, ["/app/content"]);
}
export async function variantEdit(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content");
    const r = await C.editVariant(a, str(form, "id", 60), variantInput(form));
    return { ok: r.approvalsRevoked ? "Saved as a new version. Its approval was withdrawn and any scheduled publication cancelled — it needs review again." : r.material ? "Saved as a new version." : "Saved." };
  }, ["/app/content", "/app/approvals"]);
}
export async function variantMove(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await C.moveVariant(a, str(form, "id", 60), str(form, "to", 20)); }, ["/app/content", "/app/approvals"]);
}
export async function variantBulk(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content");
    const r = await C.bulkMoveVariants(a, form.getAll("ids").map(String), str(form, "to", 20));
    return r.failed.length ? { error: `${r.done.length} moved. ${r.failed.length} not moved: ${r.failed.map((f) => f.reason).slice(0, 3).join(" | ")}` } : { ok: `${r.done.length} moved.` };
  }, ["/app/content", "/app/approvals"]);
}
export async function variantAckSource(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await C.acknowledgeSourceChange(a, str(form, "id", 60)); return { ok: "Marked as reviewed against the current source." }; }, ["/app/content"]);
}
export async function variantComment(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await C.commentOnVariant(a, str(form, "id", 60), str(form, "text", 4000), form.get("internal") === "on"); return { ok: "Comment added." }; }, ["/app/content", "/app/approvals"]);
}
export async function variantDecide(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("approvals");
    const d = str(form, "decision", 30);
    if (d !== "approved" && d !== "approved_with_edits" && d !== "rejected") throw new WorkError("Pick a decision.");
    await C.decideVariantApproval(a, str(form, "approvalId", 60), d, { reason: str(form, "reason", 1000), editedBody: d === "approved_with_edits" ? str(form, "editedBody", 20000) : undefined });
    return { ok: d === "rejected" ? "Sent back for revision." : "Approved." };
  }, ["/app/content", "/app/approvals"]);
}
export async function variantsAiDraft(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content", "work.execute", "work.manage");
    if (!aiAvailable()) throw new WorkError("AI drafting requires setup — write the variants by hand for now.");
    const master = await db.cosWorkItem.findFirst({ where: { id: str(form, "masterId", 60), orgId: a.orgId, type: "content" } });
    if (!master) throw new WorkError("Master content not found.");
    const targets = form.getAll("targets").map(String).map((t) => t.split(":")).filter(([c, f]) => formatSpec(c, f)).map(([channel, format]) => ({ channel, format, maxChars: formatSpec(channel, format)!.maxChars ?? formatSpec(channel, format)!.parts?.maxChars }));
    if (!targets.length) throw new WorkError("Pick at least one channel.");
    const payload = JSON.parse(master.payload ?? "{}") as { brief?: string; body?: string };
    const drafts = await draftVariants(a.orgId, { title: master.title, brief: payload.brief ?? "", body: payload.body ?? "" }, targets, str(form, "instruction", 500));
    let made = 0; const dropped: string[] = [];
    for (const d of drafts) {
      if (d.problems.length) { dropped.push(`${CHANNELS[d.channel]?.label}: ${d.problems[0]}`); continue; } // failed drafts are discarded, never shown to the client
      const v = await C.createVariant(a, master.id, { channel: d.channel, format: d.format, title: d.title, body: d.body, parts: d.parts, cta: d.cta }, { aiDrafted: true });
      if (d.flags.length) await C.commentOnVariant(a, v.id, `AI draft — resolve before review:\n${d.flags.join("\n")}`, true);
      made++;
    }
    return { ok: `${made} draft variant(s) created for editing${dropped.length ? `; ${dropped.length} discarded (${dropped[0]})` : ""}. Nothing is sent for approval automatically.` };
  }, ["/app/content"]);
}

// ── publishing ───────────────────────────────────────────────────────────────

export async function publicationSchedule(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("content");
    const r = await P.schedulePublication(a, str(form, "variantId", 60), { localTime: str(form, "localTime", 20) || undefined, timezone: str(form, "timezone", 60) || undefined, now: form.get("now") === "1" });
    const note = r.dstNote === "gap_shifted_forward" ? " That time does not exist on that day (clocks go forward) — it was moved to the next valid time." : r.dstNote === "ambiguous_first_used" ? " That time happens twice that day (clocks go back) — the first one was used." : "";
    return { ok: `Scheduled.${note}` };
  }, ["/app/content"]);
}
export async function publicationCancel(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await P.cancelPublication(a, str(form, "id", 60)); return { ok: "Cancelled. The variant stays approved." }; }, ["/app/content"]);
}
export async function publicationReschedule(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await P.reschedulePublication(a, str(form, "id", 60), str(form, "localTime", 20), str(form, "timezone", 60) || undefined); return { ok: "Rescheduled." }; }, ["/app/content"]);
}
export async function publicationReconcile(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await P.reconcilePublication(a, str(form, "id", 60), str(form, "verdict", 10) === "live" ? "live" : "not_live", { externalUrl: str(form, "externalUrl", 500), note: str(form, "note", 300) }); }, ["/app/content"]);
}
export async function publicationManual(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("content"); await P.recordManualPublication(a, str(form, "variantId", 60), str(form, "externalUrl", 500), str(form, "note", 300)); return { ok: "Recorded as published by hand, with the link as evidence." }; }, ["/app/content"]);
}

// ── assets, results, outcomes ────────────────────────────────────────────────

export async function assetUpdate(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("assets"); await updateAsset(a, str(form, "id", 60), { name: opt(form, "name", 200), category: opt(form, "category", 20), rightsNote: opt(form, "rightsNote", 600), sourceNote: opt(form, "sourceNote", 600), status: opt(form, "status", 12), tags: form.has("tags") ? str(form, "tags", 300).split(",") : undefined, clientVisible: form.has("visibilitySent") ? form.get("clientVisible") === "on" : undefined }); }, ["/app/assets"]);
}
export async function metricRecord(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await actorFor("results");
    await recordManualSnapshot(a, { provider: str(form, "provider", 30) || "manual", metric: str(form, "metric", 40), kind: str(form, "kind", 10) === "lifetime" ? "lifetime" : "daily", value: Number(str(form, "value", 20)), day: str(form, "day", 10) || new Date(), publicationId: str(form, "publicationId", 60) || null, campaignId: str(form, "campaignId", 60) || null, currency: str(form, "currency", 3).toUpperCase() || null, grade: str(form, "grade", 1) || "C" });
    return { ok: "Recorded — shown as entered by a team member." };
  }, ["/app/results"]);
}
export async function metricImport(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("results"); const r = await importSnapshots(a, str(form, "csv", 200_000)); return r.errors.length ? { error: `${r.imported} imported. ${r.errors.join(" ")}` } : { ok: `${r.imported} row(s) imported.` }; }, ["/app/results"]);
}
export async function opportunityCreate(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("crm"); await createOpportunity(a, { leadId: str(form, "leadId", 60), title: str(form, "title", 200), value: str(form, "value", 20) || undefined, currency: str(form, "currency", 3).toUpperCase() || undefined }); return { ok: "Opportunity opened." }; }, ["/app/leads", "/app/pipeline", "/app/results"]);
}
export async function opportunityStatus(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("crm"); await setOpportunityStatus(a, str(form, "id", 60), str(form, "status", 12), { value: str(form, "value", 20) || undefined, currency: str(form, "currency", 3).toUpperCase() || undefined, closeDate: form.has("closeDate") ? date(form, "closeDate") : undefined, lostReason: str(form, "lostReason", 300) }); }, ["/app/leads", "/app/pipeline", "/app/results"]);
}

// ── commercial ───────────────────────────────────────────────────────────────

export async function recordCreate(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await M.createRecord(a, { engagementId: str(form, "engagementId", 60), kind: str(form, "kind", 12), description: str(form, "description", 300), amount: str(form, "amount", 20), currency: str(form, "currency", 3).toUpperCase(), dueAt: date(form, "dueAt"), invoiceRef: str(form, "invoiceRef", 80), invoiceUrl: str(form, "invoiceUrl", 500) || undefined }); });
}
export async function recordIssue(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await M.issueRecord(a, str(form, "id", 60), str(form, "invoiceRef", 80), str(form, "invoiceUrl", 500) || undefined, form.has("dueAt") ? date(form, "dueAt") : undefined); });
}
export async function recordPayment(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await M.recordExternalPayment(a, str(form, "id", 60), str(form, "amount", 20), str(form, "reference", 80)); return { ok: "Payment recorded (entered by a team member, not provider-verified)." }; });
}
export async function recordVoid(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor("engagement"); await M.voidRecord(a, str(form, "id", 60), str(form, "reason", 300)); });
}
export async function recordPay(_p: State, form: FormData): Promise<State> {
  let url = "";
  const out = await run(async () => {
    const a = await actorFor("engagement", "org.billing");
    const { headers } = await import("next/headers");
    const h = await headers();
    url = await M.createRecordCheckout(a, str(form, "id", 60), `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`, a.email);
  });
  if (url) redirect(url);
  return out;
}

export async function notificationsRead(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await actorFor(null); await markRead(a.orgId, a.userId, isStaffRole(a.role), str(form, "id", 60) || undefined); });
}

