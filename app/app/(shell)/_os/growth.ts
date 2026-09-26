"use server";

// The one button on every "Growth step" panel. The step spec arrives as JSON in the form and is validated
// server-side (pillar enum, metric, lengths); the tenant comes from requireOrg().
import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { advancePillar, parseGrowthStep } from "@/lib/os/pillars";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string; href?: string };

export async function advancePillarAction(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try {
    const r = await advancePillar(actor, parseGrowthStep(String(form.get("step") ?? "")));
    for (const p of ["/app/dashboard", "/app/strategy", "/app/work"]) revalidatePath(p);
    return { ok: r.created ? (r.kind === "goal" ? "Goal added to your Growth Plan." : "Added to Work.") : (r.kind === "goal" ? "That goal already exists." : "Already on the work list."), href: r.href };
  } catch (e) {
    if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return { error: e.message };
    throw e;
  }
}
