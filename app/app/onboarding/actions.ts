"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireLosUser, setActiveOrg } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import type { FormState } from "../(auth)/actions";

import { TERMS_VERSION } from "@/lib/leados/terms";

export async function createOrg(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireLosUser();

  const name = String(form.get("name") ?? "").trim().slice(0, 160);
  const intendedUse = String(form.get("intendedUse") ?? "both");
  const market = String(form.get("market") ?? "IN");
  const jurisdiction = String(form.get("jurisdiction") ?? "").trim().slice(0, 80) || null;
  const industry = String(form.get("industry") ?? "").trim().slice(0, 80) || null;
  const website = String(form.get("website") ?? "").trim().slice(0, 200) || null;

  if (name.length < 2) return { error: "Enter your organization name." };
  if (!["b2b", "b2c", "both"].includes(intendedUse)) return { error: "Pick how you'll use LeadOS." };
  if (!["IN", "US"].includes(market)) return { error: "Pick your billing market." };
  if (form.get("acceptTerms") !== "on") return { error: "You must accept the terms and DPA to continue." };
  if (form.get("acceptProhibited") !== "on") return { error: "You must confirm the prohibited-use policy." };

  const now = new Date();
  const org = await db.losOrg.create({
    data: {
      name, intendedUse, market, jurisdiction, industry, website,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
      dpaAcceptedAt: now,
      prohibitedUseAcceptedAt: now,
      memberships: { create: { userId: actor.userId, role: "owner" } },
    },
  });
  await setActiveOrg(org.id);
  await logLosAudit({
    orgId: org.id, actorUserId: actor.userId, actorType: "user",
    action: "org.create", entity: "LosOrg", entityId: org.id,
    data: { intendedUse, market, termsVersion: TERMS_VERSION },
  });
  redirect("/app/dashboard");
}
