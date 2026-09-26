// Page guard: tenant + permission via requireOrg, then the module entitlement.
// Convenience only — every action re-checks authorization itself.
import { redirect } from "next/navigation";
import { requireOrg, requireOrgAction, type OrgActor } from "@/lib/leados/auth";
import type { Permission } from "@/lib/leados/rbac";
import { entitlements } from "./entitlements";
import type { ModuleKey } from "./catalog";

/**
 * requireOrg for PAGES. Being signed out, lacking a role, or opening an area outside the workspace's scope are
 * ordinary conditions (stale bookmark, switched workspace) — they get a deliberate screen, never a thrown error
 * (which Next renders as a 500, and whose message is stripped in production so an error boundary cannot tell it
 * apart). Actions and route handlers keep calling requireOrg and turn the same errors into a form message / 401 / 403.
 */
export async function requireOrgPage(...anyOf: Permission[]): Promise<OrgActor> {
  try { return await requireOrg(...anyOf); } catch (e) {
    if (!(e instanceof Error) || e.name !== "LosAuthError") throw e;
    const status = (e as { status?: number }).status;
    if (status === 401) redirect("/app/login");
    if (e.message === "No organization.") redirect("/app/onboarding");
    redirect(`/app/denied?why=${/scope/i.test(e.message) ? "scope" : "role"}`);
  }
}

export async function requireModule(module: ModuleKey, ...anyOf: Permission[]) {
  const actor = await requireOrgPage(...anyOf);
  const ent = await entitlements(actor.orgId);
  if (!ent.modules.has(module)) redirect("/app/denied?why=scope");
  return { actor, ent };
}

/** requireOrgAction + the module entitlement, for actions that return a form state. */
export async function requireModuleAction(module: ModuleKey, ...anyOf: Permission[]): Promise<OrgActor | { error: string }> {
  const actor = await requireOrgAction(...anyOf);
  if ("error" in actor) return actor;
  if (!(await entitlements(actor.orgId)).modules.has(module)) return { error: "This area is not part of this workspace's scope." };
  return actor;
}
