"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/leados/auth";
import { WorkError } from "@/lib/os/work";
import { generateImageAsset } from "@/lib/os/imagegen";

type State = { error?: string; ok?: string };

export async function generateImage(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrg("work.execute").catch((e: unknown) => { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }); if ("error" in actor) return actor;
  try {
    await generateImageAsset(actor, String(form.get("prompt") ?? ""));
    revalidatePath("/app/assets");
    return { ok: "Draft image saved to Assets (internal, AI generated)." };
  } catch (e) {
    if (e instanceof WorkError) return { error: e.message };
    throw e;
  }
}
