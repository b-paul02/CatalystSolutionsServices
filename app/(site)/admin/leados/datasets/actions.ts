"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { parseCsv } from "@/lib/leados/csv";
import { suggestMapping } from "@/lib/leados/leads";
import { materializeDataset } from "@/lib/leados/datasets";
import type { FormState } from "@/app/app/(auth)/actions";

const INVENTORY_ROLES = ["super_admin", "inventory_admin"];
const APPROVE_ROLES = ["super_admin", "compliance_admin"];

export async function uploadDataset(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requirePlatform(...INVENTORY_ROLES);
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim().slice(0, 160);
  const leadType = String(form.get("leadType")) === "b2b" ? "b2b" : "b2c";
  const sourceName = String(form.get("sourceName") ?? "").trim().slice(0, 160);
  const contractEvidence = String(form.get("contractEvidence") ?? "").trim().slice(0, 1000);
  if (!name || !sourceName) return { error: "Dataset and source names are required." };
  if (!(file instanceof File) || !/\.csv$/i.test(file.name)) return { error: "Upload a CSV file." };
  if (file.size > 8 * 1024 * 1024) return { error: "File too large (8 MB max)." };
  const rows = parseCsv(await file.text(), 10_001);
  if (rows.length < 2) return { error: "Need a header row and at least one data row." };
  const headers = rows[0].map((h) => h.trim());

  const source =
    (await db.losDataSource.findFirst({ where: { name: sourceName } })) ??
    (await db.losDataSource.create({
      data: { name: sourceName, contractEvidence: contractEvidence || null, demo: form.get("demo") === "on" },
    }));

  const lawfulUse =
    leadType === "b2c"
      ? {
          purposes: String(form.get("luPurposes") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          channels: String(form.get("luChannels") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          evidenceNote: String(form.get("luEvidence") ?? "").trim(),
          retentionDays: parseInt(String(form.get("luRetention") ?? ""), 10) || undefined,
        }
      : null;
  if (leadType === "b2c") {
    if (!lawfulUse?.purposes.length || !lawfulUse.channels.length || !lawfulUse.evidenceNote) {
      return { error: "B2C datasets need permitted purposes, channels, and evidence." };
    }
  }

  const exclusivity = String(form.get("exclusivity")) === "shared" ? "shared" : "exclusive";
  const ds = await db.losDataset.create({
    data: {
      sourceId: source.id,
      name, leadType,
      status: "compliance_review",
      headers: JSON.stringify(headers),
      rows: JSON.stringify(rows.slice(1)),
      mapping: JSON.stringify(suggestMapping(headers, leadType)),
      lawfulUse: lawfulUse ? JSON.stringify(lawfulUse) : null,
      exclusivity,
      maxShare: exclusivity === "shared" ? Math.min(10, Math.max(1, parseInt(String(form.get("maxShare") ?? "3"), 10) || 3)) : 1,
      coolingDays: Math.max(0, parseInt(String(form.get("coolingDays") ?? "0"), 10) || 0),
      expiryDays: parseInt(String(form.get("expiryDays") ?? ""), 10) || null,
      createdById: admin.userId ?? admin.email,
      demo: form.get("demo") === "on",
    },
  });
  await db.losComplianceReview.create({
    data: {
      subjectKind: "dataset", subjectId: ds.id, status: "pending",
      submittedById: admin.userId ?? admin.email,
      evidence: JSON.stringify({ name, leadType, rows: rows.length - 1, source: sourceName, ...(lawfulUse ?? {}) }),
      demo: ds.demo,
    },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "dataset.upload", entity: "LosDataset", entityId: ds.id, data: { rows: rows.length - 1 } });
  redirect(`/admin/leados/datasets/${ds.id}`);
}

export async function approveDataset(datasetId: string): Promise<void> {
  const admin = await requirePlatform(...APPROVE_ROLES);
  const ds = await db.losDataset.findUnique({ where: { id: datasetId } });
  if (!ds || ds.status !== "compliance_review") return;
  const result = await materializeDataset(datasetId);
  await db.losComplianceReview.updateMany({
    where: { subjectKind: "dataset", subjectId: datasetId, status: "pending" },
    data: { status: "approved", reviewedById: admin.userId ?? admin.email },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "dataset.approved", entity: "LosDataset", entityId: datasetId, data: result });
  revalidatePath(`/admin/leados/datasets/${datasetId}`);
  revalidatePath("/admin/leados/datasets");
}

export async function rejectDataset(datasetId: string, note: string): Promise<void> {
  const admin = await requirePlatform(...APPROVE_ROLES);
  await db.losDataset.updateMany({ where: { id: datasetId, status: "compliance_review" }, data: { status: "rejected" } });
  await db.losComplianceReview.updateMany({
    where: { subjectKind: "dataset", subjectId: datasetId, status: "pending" },
    data: { status: "rejected", note: note || null, reviewedById: admin.userId ?? admin.email },
  });
  await logLosAudit({ actorType: "platform_admin", actorUserId: admin.userId, action: "dataset.rejected", entity: "LosDataset", entityId: datasetId });
  revalidatePath(`/admin/leados/datasets/${datasetId}`);
  revalidatePath("/admin/leados/datasets");
}

export async function saveDatasetMapping(_prev: FormState, form: FormData): Promise<FormState> {
  await requirePlatform(...INVENTORY_ROLES);
  const id = String(form.get("datasetId"));
  const ds = await db.losDataset.findUnique({ where: { id } });
  if (!ds || ds.status !== "compliance_review") return { error: "Dataset not editable." };
  const headers = JSON.parse(ds.headers) as string[];
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const v = String(form.get(`map:${h}`) ?? "");
    if (v) mapping[h] = v;
  }
  if (!Object.values(mapping).includes("email") && !Object.values(mapping).includes("phone")) {
    return { error: "Map at least an Email or Phone column." };
  }
  await db.losDataset.update({ where: { id }, data: { mapping: JSON.stringify(mapping) } });
  revalidatePath(`/admin/leados/datasets/${id}`);
  return { ok: "Mapping saved." };
}
