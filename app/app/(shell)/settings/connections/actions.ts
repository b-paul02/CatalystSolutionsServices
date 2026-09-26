"use server";

// Connections page actions. Tenant from requireOrg(); lib/os/connections re-checks the permission per row.
import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { disconnectConnection, testConnection } from "@/lib/os/connections";
import { saveKeyConnection } from "@/lib/os/automation/manage";
import { syncSearchConsole } from "@/lib/os/connectors";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string };
const PATH = "/app/settings/connections";
const str = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);
const fail = (e: unknown): State => { if (e instanceof WorkError || (e instanceof Error && (e.name === "LosAuthError" || /access test|not connected|failed/i.test(e.message)))) return { error: e.message }; throw e; };

export async function testConn(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try {
    const conn = await testConnection(actor, str(form, "id", 60));
    revalidatePath(PATH);
    return conn.status === "verified" ? { ok: "Live test passed." } : { error: conn.lastError ?? "Live test failed." };
  } catch (e) { revalidatePath(PATH); return fail(e); }
}

export async function disconnectConn(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try { await disconnectConnection(actor, str(form, "id", 60)); revalidatePath(PATH); return { ok: "Disconnected — stored credentials destroyed." }; } catch (e) { return fail(e); }
}

export async function connectKeyConn(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("automations.manage"); if ("error" in actor) return actor;
  try {
    const conn = await saveKeyConnection(actor, str(form, "provider", 20), String(form.get("secret") ?? ""));
    revalidatePath(PATH);
    return { ok: `Connected${conn.accountLabel ? ` — ${conn.accountLabel}` : ""}.` };
  } catch (e) { revalidatePath(PATH); return fail(e); }
}

export async function syncConn(_p: State, _form: FormData): Promise<State> {
  const actor = await requireOrgAction("os.settings"); if ("error" in actor) return actor;
  try { const n = await syncSearchConsole(actor.orgId); revalidatePath("/app/search"); return { ok: `Synced ${n} day(s) of Search Console data.` }; } catch (e) { return fail(e); }
}
