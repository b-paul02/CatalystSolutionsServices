// Page guard: tenant + permission via requireOrg, then the module entitlement.
// Convenience only — every action re-checks authorization itself.
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/leados/auth";
import type { Permission } from "@/lib/leados/rbac";
import { entitlements } from "./entitlements";
import type { ModuleKey } from "./catalog";

export async function requireModule(module: ModuleKey, ...anyOf: Permission[]) {
  const actor = await requireOrg(...anyOf);
  const ent = await entitlements(actor.orgId);
  if (!ent.modules.has(module)) redirect("/app/dashboard");
  return { actor, ent };
}
