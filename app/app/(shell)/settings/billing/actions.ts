"use server";

import { redirect } from "next/navigation";
import { requireOrgAction } from "@/lib/leados/auth";
import { createSubscriptionCheckout, createTokenCheckout } from "@/lib/leados/billing";
import type { FormState } from "../../../(auth)/actions";

export async function buyTokens(packId: string): Promise<FormState> {
  const actor = await requireOrgAction("org.billing"); if ("error" in actor) return actor;
  let url: string;
  try {
    url = await createTokenCheckout(actor.orgId, packId, actor.email);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start checkout." };
  }
  redirect(url);
}

export async function subscribe(packageId: string): Promise<FormState> {
  const actor = await requireOrgAction("org.billing"); if ("error" in actor) return actor;
  let url: string;
  try {
    url = await createSubscriptionCheckout(actor.orgId, packageId, actor.email);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start checkout." };
  }
  redirect(url);
}
