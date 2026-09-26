"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrgAction } from "@/lib/leados/auth";
import { NOTIFICATION_KINDS } from "@/lib/os/notify";

type State = { error?: string; ok?: string };

/** One row per kind for the signed-in member; a kind with nothing ticked keeps no row (in-app only). */
export async function savePrefs(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  for (const { kind } of NOTIFICATION_KINDS) {
    const email = form.get(`email:${kind}`) === "on", slack = form.get(`slack:${kind}`) === "on";
    const where = { userId_orgId_kind: { userId: actor.userId, orgId: actor.orgId, kind } };
    if (!email && !slack) await db.cosNotificationPref.deleteMany({ where: { userId: actor.userId, orgId: actor.orgId, kind } });
    else await db.cosNotificationPref.upsert({ where, update: { email, slack, inApp: true }, create: { userId: actor.userId, orgId: actor.orgId, kind, email, slack, inApp: true } });
  }
  revalidatePath("/app/settings/notifications");
  return { ok: "Saved." };
}
