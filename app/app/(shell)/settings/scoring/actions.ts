"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "@/lib/leados/scoring";
import type { FormState } from "../../../(auth)/actions";

export async function saveScoringWeights(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireOrg("pipeline.manage");
  const num = (name: string, fallback: number) => {
    const v = parseInt(String(form.get(name) ?? ""), 10);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback;
  };
  const weights: ScoringWeights = {
    quality: Object.fromEntries(
      Object.keys(DEFAULT_WEIGHTS.quality).map((k) => [k, num(`quality.${k}`, DEFAULT_WEIGHTS.quality[k as keyof ScoringWeights["quality"]])]),
    ) as ScoringWeights["quality"],
    intent: Object.fromEntries(
      Object.keys(DEFAULT_WEIGHTS.intent).map((k) => [k, num(`intent.${k}`, DEFAULT_WEIGHTS.intent[k as keyof ScoringWeights["intent"]])]),
    ) as ScoringWeights["intent"],
    hotThreshold: num("hotThreshold", DEFAULT_WEIGHTS.hotThreshold),
    warmThreshold: num("warmThreshold", DEFAULT_WEIGHTS.warmThreshold),
  };
  await db.losScoringConfig.upsert({
    where: { orgId: actor.orgId },
    update: { weights: JSON.stringify(weights) },
    create: { orgId: actor.orgId, weights: JSON.stringify(weights) },
  });
  revalidatePath("/app/settings/scoring");
  return { ok: "Weights saved. Scores update on each lead change." };
}
