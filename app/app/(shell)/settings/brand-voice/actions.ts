"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { saveBrandRules } from "@/lib/os/brand";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string; href?: string };
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

export async function brandRulesSave(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("os.settings"); if ("error" in actor) return actor;
  try {
    const grade = String(form.get("maxReadingGrade") ?? "").trim();
    await saveBrandRules(actor, { bannedPhrases: lines(form.get("banned")), requiredPhrases: lines(form.get("required")), maxReadingGrade: grade ? Number(grade) : null, toneNotes: String(form.get("toneNotes") ?? ""), color: String(form.get("color") ?? "") });
    revalidatePath("/app/settings/brand-voice");
    return { ok: "Saved. Every draft is now checked against these rules.", href: "/app/settings/brand-voice?saved=1" };
  } catch (e) { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return { error: e.message }; throw e; }
}
