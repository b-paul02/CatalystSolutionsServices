"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { addMonitor, checkMonitor, removeMonitor } from "@/lib/os/monitors";
import { db } from "@/lib/audit/db";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string; href?: string };
const PATH = "/app/settings/monitoring";
const fail = (e: unknown): State => { if (e instanceof WorkError || (e instanceof Error && (e.name === "LosAuthError" || /address|internal/i.test(e.message)))) return { error: e.message }; throw e; };

export async function monitorAdd(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try { await addMonitor(actor, String(form.get("url") ?? ""), Number(form.get("everyMin") ?? 5)); revalidatePath(PATH); return { ok: "Monitor added. First check on the next scheduler tick.", href: `${PATH}?added=1` }; } catch (e) { return fail(e); }
}
export async function monitorRemove(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try { await removeMonitor(actor, String(form.get("id") ?? "")); revalidatePath(PATH); return { ok: "Removed." }; } catch (e) { return fail(e); }
}
export async function monitorCheck(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  const m = await db.cosMonitor.findFirst({ where: { id: String(form.get("id") ?? ""), orgId: actor.orgId } });
  if (!m) return { error: "Monitor not found." };
  const r = await checkMonitor(m.id);
  revalidatePath(PATH);
  return r?.ok ? { ok: `Up (HTTP ${r.status}).` } : { error: `Down: ${r?.reason ?? "no answer"}.` };
}
