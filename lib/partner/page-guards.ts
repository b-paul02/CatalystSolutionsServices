import { redirect } from "next/navigation";
import { currentActor, type Actor, type Role } from "./auth";

// Page-level guards REDIRECT (navigation UX). Mutation guards in ./auth throw
// 403 (access control). Never use these in a server action or route handler.

export async function partnerPage(): Promise<Actor & { partnerId: string }> {
  const actor = await currentActor();
  if (!actor || actor.role !== "partner" || !actor.partnerId) redirect("/partner/login");
  return actor as Actor & { partnerId: string };
}

export async function staffPage(...allowed: Role[]): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/admin/login");
  if (!allowed.includes(actor.role)) redirect("/admin/login");
  return actor;
}
