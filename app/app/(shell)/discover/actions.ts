"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import {
  revealCostPreview, revealRecords, searchPeople, type B2bSearchFilters, type B2bSearchHit, type RevealResult,
} from "@/lib/leados/b2bDiscovery";
import type { FormState } from "../../(auth)/actions";

export async function runSearch(filters: B2bSearchFilters): Promise<B2bSearchHit[]> {
  const actor = await requireOrg("leads.view");
  return searchPeople(actor.orgId, filters, 50);
}

export async function previewReveal(recordIds: string[]) {
  const actor = await requireOrg("leads.edit");
  return revealCostPreview(actor.orgId, recordIds);
}

export async function doReveal(recordIds: string[]): Promise<RevealResult[]> {
  const actor = await requireOrg("leads.edit");
  const results = await revealRecords(actor.orgId, recordIds, actor.userId);
  await logLosAudit({
    orgId: actor.orgId, actorUserId: actor.userId, actorType: "user",
    action: "b2b.reveal", entity: "LosReveal",
    data: { requested: recordIds.length, revealed: results.filter((r) => r.outcome === "revealed").length },
  });
  revalidatePath("/app/discover");
  return results;
}

export async function saveSearch(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.view");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const filters = String(form.get("filters") ?? "{}");
  const alert = form.get("alert") === "on";
  if (!name) return { error: "Name the search." };
  try {
    JSON.parse(filters);
  } catch {
    return { error: "Invalid filters." };
  }
  await db.losSavedSearch.create({
    data: { orgId: actor.orgId, name, filters, alert, createdById: actor.userId },
  });
  revalidatePath("/app/discover");
  return { ok: `Saved "${name}"${alert ? " with new-results alerts" : ""}.` };
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const actor = await requireOrg("leads.view");
  await db.losSavedSearch.deleteMany({ where: { id, orgId: actor.orgId } });
  revalidatePath("/app/discover");
}

export async function addExclusion(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("leads.edit");
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter a valid domain." };
  await db.losExclusion.upsert({
    where: { orgId_domain: { orgId: actor.orgId, domain } },
    update: {},
    create: { orgId: actor.orgId, domain },
  });
  revalidatePath("/app/discover");
  return { ok: `${domain} excluded from discovery.` };
}

export async function removeExclusion(id: string): Promise<void> {
  const actor = await requireOrg("leads.edit");
  await db.losExclusion.deleteMany({ where: { id, orgId: actor.orgId } });
  revalidatePath("/app/discover");
}
