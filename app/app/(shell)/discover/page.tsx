import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import DiscoverClient from "./DiscoverClient";

export const metadata = { title: "B2B Discovery" };

export default async function DiscoverPage() {
  const actor = await requireOrg("leads.view");
  const [savedSearches, exclusions, inventoryCount] = await Promise.all([
    db.losSavedSearch.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" } }),
    db.losExclusion.findMany({ where: { orgId: actor.orgId }, orderBy: { domain: "asc" } }),
    db.losInventoryRecord.count({ where: { leadType: "b2b", status: { in: ["available", "allocated"] }, dataset: { status: "approved" } } }),
  ]);
  return (
    <DiscoverClient
      canReveal={can(actor.role, "leads.edit")}
      inventoryCount={inventoryCount}
      savedSearches={savedSearches.map((s) => ({ id: s.id, name: s.name, filters: s.filters, alert: s.alert }))}
      exclusions={exclusions.map((e) => ({ id: e.id, domain: e.domain }))}
    />
  );
}
