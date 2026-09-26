"use server";

// Operator actions for the AI-credit economy. Platform role re-checked in every action; every balance change is a
// reasoned, audited, idempotent ledger entry (the form carries a one-time ref so a double click cannot grant twice).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { WorkError } from "@/lib/os/work";
import { activateRateCard, adjustCredits, createRateCard, grantCredits, type GrantKind } from "@/lib/os/credits";
import { retirePack, savePack } from "@/lib/os/creditPurchase";
import { resolveUncertain } from "@/lib/os/studio";
import type { FormState } from "@/app/app/(auth)/actions";

const ROLES = ["super_admin", "support_admin"];
const str = (form: FormData, key: string, max = 4000) => String(form.get(key) ?? "").trim().slice(0, max);
const whole = (form: FormData, key: string) => { const v = str(form, key, 12); if (!/^-?\d{1,9}$/.test(v)) throw new WorkError(`“${key}” must be a whole number.`); return Number(v); };

async function run(fn: (admin: { userId: string | null; email: string }) => Promise<string>): Promise<FormState> {
  const admin = await requirePlatform(...ROLES);
  try { const ok = await fn(admin); revalidatePath("/admin/os/credits"); return { ok }; } catch (e) { if (e instanceof WorkError) return { error: e.message }; throw e; }
}

export async function rateCardCreate(_p: FormState, form: FormData): Promise<FormState> {
  return run(async (admin) => { const c = await createRateCard(str(form, "rates", 20_000), str(form, "note", 300), admin.email, form.get("synthetic") === "on"); return `Draft rate card v${c.version} saved. Activate it when it has been reviewed.`; });
}
export async function rateCardActivate(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await activateRateCard(str(form, "id", 60)); return "Activated. Quotes already issued keep the version they were priced under."; });
}
export async function packCreate(_p: FormState, form: FormData): Promise<FormState> {
  return run(async (admin) => { await savePack({ label: str(form, "label", 80), credits: whole(form, "credits"), currency: str(form, "currency", 3).toUpperCase(), amountMinor: whole(form, "amountMinor"), market: str(form, "market", 2).toUpperCase() || null, synthetic: form.get("synthetic") === "on" }, admin.email); return "Pack published."; });
}
export async function packRetire(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await retirePack(str(form, "id", 60)); return "Pack retired. Existing orders are unaffected."; });
}

/** Included / promotional grant, or a signed adjustment. Expiry is always an explicit choice. */
export async function walletGrant(_p: FormState, form: FormData): Promise<FormState> {
  return run(async (admin) => {
    const orgId = str(form, "orgId", 60), kind = str(form, "kind", 20), amount = whole(form, "amount"), reason = str(form, "reason", 300), ref = str(form, "ref", 64);
    if (!(await db.losOrg.findUnique({ where: { id: orgId }, select: { id: true } }))) throw new WorkError("Workspace not found.");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(ref)) throw new WorkError("Reload the page and try again.");
    const expiry = str(form, "expiresAt", 20);
    let r: { duplicate: boolean };
    if (kind === "adjustment") r = await adjustCredits({ orgId, delta: amount, reason, actorId: admin.email, ref });
    else {
      if (!["included", "promotional"].includes(kind)) throw new WorkError("Purchased credits come only from a verified payment.");
      if (!expiry && form.get("noExpiry") !== "on") throw new WorkError("Choose an expiry date, or tick “does not expire” — it is shown to the client either way.");
      r = await grantCredits({ orgId, kind: kind as GrantKind, amount, expiresAt: expiry ? new Date(`${expiry}T23:59:59Z`) : null, sourceRef: `admin:${ref}`, reason, createdBy: admin.email });
    }
    if (r.duplicate) return "Already recorded — nothing was added twice.";
    await logLosAudit({ orgId, actorUserId: admin.userId, actorType: "platform_admin", action: "ai_credits.admin_grant", entity: "CosCreditWallet", entityId: orgId, data: { kind, amount, reason } });
    return "Recorded in the ledger.";
  });
}

export async function operationRelease(_p: FormState, form: FormData): Promise<FormState> {
  return run(async (admin) => { await resolveUncertain(str(form, "id", 60), str(form, "reason", 300), admin.email); return "Closed without charge; the held credits were returned."; });
}
