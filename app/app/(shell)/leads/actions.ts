"use server";

// Lead + import mutations. Permission checks inside every action.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { LEAD_STATUSES, suggestMapping, toCsv, fieldsForType } from "@/lib/leados/leads";
import { leadWhere } from "@/lib/leados/leadQuery";
import { parseCsv } from "@/lib/leados/csv";
import { createLead, type LeadInput } from "@/lib/leados/leadWrite";
import { enqueueJob, runPendingJobs } from "@/lib/leados/jobs";
import { IMPORT_JOB } from "@/lib/leados/importJob";
import "@/lib/leados/registerJobs";
import type { FormState } from "../../(auth)/actions";

const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

// ── manual create ────────────────────────────────────────────────────────────

export async function createLeadManual(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const leadType = String(form.get("leadType")) === "b2b" ? "b2b" : "b2c";
  const input: LeadInput = {};
  for (const f of fieldsForType(leadType)) {
    const v = String(form.get(f.key) ?? "").trim();
    if (v) (input as Record<string, string>)[f.key] = v.slice(0, 300);
  }
  const lawfulUse =
    leadType === "b2c"
      ? {
          purposes: String(form.get("luPurposes") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          channels: String(form.get("luChannels") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          evidenceNote: String(form.get("luEvidence") ?? "").trim() || undefined,
        }
      : undefined;
  const result = await createLead({
    orgId: actor.orgId, leadType, input, source: "manual", lawfulUse,
  });
  if (result.outcome === "invalid") return { error: result.problem };
  if (result.outcome === "duplicate") return { error: "A lead with this email or phone already exists." };
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.create", entity: "LosLead", entityId: result.leadId });
  redirect(`/app/leads/${result.leadId}`);
}

// ── edit / status / assign / delete ──────────────────────────────────────────

async function ownLead(orgId: string, leadId: string) {
  const lead = await db.losLead.findFirst({ where: { id: leadId, orgId, deletedAt: null } });
  if (!lead) throw new Error("Lead not found.");
  return lead;
}

export async function updateLeadBasics(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const leadId = String(form.get("leadId"));
  await ownLead(actor.orgId, leadId);
  const data: Record<string, string | null> = {};
  for (const k of ["firstName", "lastName", "city", "state", "country", "language"]) {
    data[k] = String(form.get(k) ?? "").trim().slice(0, 200) || null;
  }
  await db.losLead.update({ where: { id: leadId }, data });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.update", entity: "LosLead", entityId: leadId });
  revalidatePath(`/app/leads/${leadId}`);
  return { ok: "Saved." };
}

export async function setLeadStatus(leadId: string, status: string, lostReason?: string, conversionValue?: number): Promise<void> {
  const actor = await requireOrg("leads.edit");
  const { isValidStage } = await import("@/lib/leados/stages");
  if (!(await isValidStage(actor.orgId, status))) return;
  const lead = await ownLead(actor.orgId, leadId);
  await db.losLead.update({
    where: { id: leadId },
    data: {
      status,
      lostReason: status === "lost" ? (lostReason ?? null) : null,
      contactedAt: status === "contacted" ? new Date() : undefined,
      convertedAt: status === "converted" ? new Date() : undefined,
      conversionValue: status === "converted" && conversionValue && conversionValue > 0 ? BigInt(Math.round(conversionValue * 100)) : undefined,
    },
  });
  await db.losActivity.create({
    data: {
      orgId: actor.orgId, leadId, kind: "stage_change", actorId: actor.userId,
      data: JSON.stringify({ from: lead.status, to: status, lostReason: lostReason ?? null }),
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.status", entity: "LosLead", entityId: leadId, data: { status } });
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/leads");
  revalidatePath("/app/pipeline");
}

export async function assignLead(leadId: string, ownerId: string | null): Promise<void> {
  const actor = await requireOrg("leads.assign");
  await ownLead(actor.orgId, leadId);
  if (ownerId) {
    const member = await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId: ownerId } });
    if (!member) return;
  }
  await db.losLead.update({
    where: { id: leadId },
    data: { ownerId, status: ownerId ? "assigned" : undefined },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.assign", entity: "LosLead", entityId: leadId, data: { ownerId } });
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/leads");
}

export async function deleteLead(leadId: string): Promise<void> {
  const actor = await requireOrg("leads.delete");
  await ownLead(actor.orgId, leadId);
  await db.losLead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.delete", entity: "LosLead", entityId: leadId });
  redirect("/app/leads");
}

// ── export ───────────────────────────────────────────────────────────────────

export async function exportLeadsCsv(filters: { leadType?: string; status?: string; q?: string }): Promise<string> {
  const actor = await requireOrg("leads.export");
  // B2C export disabled by default (locked product decision).
  const where = leadWhere(actor.orgId, { ...filters, leadType: "b2b" });
  const leads = await db.losLead.findMany({
    where, take: 5000, orderBy: { createdAt: "desc" },
    include: { b2b: true, company: true },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.export", entity: "LosLead", data: { count: leads.length } });
  return toCsv(
    ["First name", "Last name", "Email", "Phone", "Company", "Job title", "City", "Country", "Status", "Created"],
    leads.map((l) => [
      l.firstName, l.lastName, l.email, l.phone, l.company?.name, l.b2b?.jobTitle,
      l.city, l.country, l.status, l.createdAt.toISOString().slice(0, 10),
    ]),
  );
}

// ── import wizard ────────────────────────────────────────────────────────────

export async function uploadImport(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.import");
  const file = form.get("file");
  const leadType = String(form.get("leadType")) === "b2b" ? "b2b" : "b2c";
  if (!(file instanceof File)) return { error: "Choose a CSV file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "File too large (8 MB max)." };
  if (!/\.csv$/i.test(file.name)) {
    return { error: "Only CSV files for now — in Excel or Sheets use File → Save as → CSV." };
  }
  const text = await file.text();
  const rows = parseCsv(text, MAX_IMPORT_ROWS + 1);
  if (rows.length < 2) return { error: "The file needs a header row and at least one data row." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Too many rows (${MAX_IMPORT_ROWS} max per import).` };
  const headers = rows[0].map((h) => h.trim());
  const imp = await db.losImport.create({
    data: {
      orgId: actor.orgId,
      createdById: actor.userId,
      fileName: file.name.slice(0, 200),
      leadType,
      headers: JSON.stringify(headers),
      rows: JSON.stringify(rows.slice(1)),
      mapping: JSON.stringify(suggestMapping(headers, leadType)),
    },
  });
  redirect(`/app/leads/import/${imp.id}`);
}

export async function saveImportMapping(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.import");
  const importId = String(form.get("importId"));
  const imp = await db.losImport.findFirst({ where: { id: importId, orgId: actor.orgId } });
  if (!imp || (imp.status !== "mapping" && imp.status !== "previewed")) return { error: "Import not editable." };
  const headers = JSON.parse(imp.headers) as string[];
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const v = String(form.get(`map:${h}`) ?? "");
    if (v) mapping[h] = v;
  }
  if (!Object.values(mapping).includes("email") && !Object.values(mapping).includes("phone")) {
    return { error: "Map at least an Email or Phone column." };
  }
  let lawfulUse: string | null = imp.lawfulUse;
  if (imp.leadType === "b2c") {
    const purposes = String(form.get("luPurposes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const channels = String(form.get("luChannels") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const evidenceNote = String(form.get("luEvidence") ?? "").trim();
    const retentionDays = parseInt(String(form.get("luRetention") ?? ""), 10) || undefined;
    if (purposes.length === 0) return { error: "B2C imports require at least one permitted purpose." };
    if (channels.length === 0) return { error: "B2C imports require at least one permitted channel." };
    if (!evidenceNote) return { error: "Describe the consent/permission evidence for this dataset." };
    lawfulUse = JSON.stringify({ purposes, channels, evidenceNote, retentionDays });
  }
  await db.losImport.update({
    where: { id: imp.id },
    data: { mapping: JSON.stringify(mapping), lawfulUse, status: "previewed" },
  });
  revalidatePath(`/app/leads/import/${imp.id}`);
  return { ok: "Mapping saved — review the preview below." };
}

export async function commitImport(importId: string): Promise<void> {
  const actor = await requireOrg("leads.import");
  const imp = await db.losImport.findFirst({ where: { id: importId, orgId: actor.orgId } });
  if (!imp || imp.status !== "previewed") return;
  await enqueueJob({ type: IMPORT_JOB, payload: { importId }, idempotencyKey: `import-${importId}` });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "leads.import_started", entity: "LosImport", entityId: importId });
  // Kick the queue now instead of waiting for the next cron tick.
  runPendingJobs(3).catch(() => {});
  revalidatePath(`/app/leads/import/${importId}`);
}

// ── notes, tasks, messages (lead workspace) ──────────────────────────────────

export async function addNote(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const leadId = String(form.get("leadId"));
  const body = String(form.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return { error: "Write something first." };
  await ownLead(actor.orgId, leadId);
  const mentions = [...body.matchAll(/@(\S+@\S+)/g)].map((m) => m[1]).slice(0, 10);
  await db.losNote.create({
    data: { orgId: actor.orgId, leadId, authorId: actor.userId, body, mentions: mentions.length ? JSON.stringify(mentions) : null },
  });
  await db.losActivity.create({
    data: { orgId: actor.orgId, leadId, kind: "note", actorId: actor.userId, data: JSON.stringify({ preview: body.slice(0, 120) }) },
  });
  revalidatePath(`/app/leads/${leadId}`);
  return { ok: "Note added." };
}

export async function addTask(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const leadId = String(form.get("leadId") ?? "") || null;
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const kind = ["call", "follow_up", "other"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "follow_up";
  const dueAt = new Date(String(form.get("dueAt") ?? ""));
  const assigneeId = String(form.get("assigneeId") ?? actor.userId);
  if (!title) return { error: "Give the task a title." };
  if (isNaN(dueAt.getTime())) return { error: "Set a due date." };
  if (leadId) await ownLead(actor.orgId, leadId);
  const member = await db.losMembership.findFirst({ where: { orgId: actor.orgId, userId: assigneeId } });
  if (!member) return { error: "Pick a valid assignee." };
  await db.losTask.create({
    data: { orgId: actor.orgId, leadId, title, kind, dueAt, assigneeId, createdById: actor.userId },
  });
  if (leadId) {
    await db.losActivity.create({
      data: { orgId: actor.orgId, leadId, kind: "task_created", actorId: actor.userId, data: JSON.stringify({ title, dueAt }) },
    });
    revalidatePath(`/app/leads/${leadId}`);
  }
  revalidatePath("/app/tasks");
  return { ok: "Task created." };
}

export async function toggleTask(taskId: string): Promise<void> {
  const actor = await requireOrg("leads.edit");
  const task = await db.losTask.findFirst({ where: { id: taskId, orgId: actor.orgId } });
  if (!task) return;
  const doneAt = task.doneAt ? null : new Date();
  await db.losTask.update({ where: { id: taskId }, data: { doneAt } });
  if (task.leadId && doneAt) {
    await db.losActivity.create({
      data: { orgId: actor.orgId, leadId: task.leadId, kind: "task_done", actorId: actor.userId, data: JSON.stringify({ title: task.title }) },
    });
  }
  revalidatePath("/app/tasks");
  if (task.leadId) revalidatePath(`/app/leads/${task.leadId}`);
}

export async function sendOneToOne(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.contact");
  const leadId = String(form.get("leadId"));
  const channel = String(form.get("channel"));
  if (!["whatsapp", "sms", "email"].includes(channel)) return { error: "Pick a channel." };
  const body = String(form.get("body") ?? "").trim().slice(0, 3000);
  const subject = String(form.get("subject") ?? "").trim().slice(0, 200) || undefined;
  if (!body) return { error: "Write the message." };
  await ownLead(actor.orgId, leadId);
  const { sendOutreachMessage } = await import("@/lib/leados/outreach");
  const result = await sendOutreachMessage({
    orgId: actor.orgId, leadId, channel: channel as "whatsapp" | "sms" | "email",
    body, subject, sentById: actor.userId,
  });
  revalidatePath(`/app/leads/${leadId}`);
  if (result.outcome === "blocked") {
    return { error: `Not sent: ${result.reason.replace(/_/g, " ")}. Channel permissions and suppression are enforced on every send.` };
  }
  return { ok: result.dev ? "Sent (dev mode — no provider configured, message logged)." : "Sent." };
}

export async function enrollInSequence(leadId: string, sequenceId: string): Promise<void> {
  const actor = await requireOrg("leads.contact");
  await ownLead(actor.orgId, leadId);
  const sequence = await db.losSequence.findFirst({ where: { id: sequenceId, orgId: actor.orgId } });
  if (!sequence) return;
  await db.losSequenceEnrollment.upsert({
    where: { sequenceId_leadId: { sequenceId, leadId } },
    update: {},
    create: { sequenceId, leadId, orgId: actor.orgId, nextRunAt: new Date() },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "sequence.enroll", entity: "LosSequenceEnrollment", data: { leadId, sequenceId } });
  revalidatePath(`/app/leads/${leadId}`);
}

export async function recomputeScore(leadId: string): Promise<void> {
  const actor = await requireOrg("leads.view");
  const lead = await db.losLead.findFirst({ where: { id: leadId, orgId: actor.orgId, deletedAt: null }, include: { b2c: true } });
  if (!lead) return;
  const { scoreLead, parseWeights } = await import("@/lib/leados/scoring");
  const config = await db.losScoringConfig.findUnique({ where: { orgId: actor.orgId } });
  const result = scoreLead(lead, parseWeights(config?.weights));
  await db.losLead.update({ where: { id: leadId }, data: { qualityScore: result.quality, intentScore: result.intent } });
  await db.losScoreEvent.create({
    data: { orgId: actor.orgId, leadId, quality: result.quality, intent: result.intent, explanation: JSON.stringify(result.explanation) },
  });
  revalidatePath(`/app/leads/${leadId}`);
}
