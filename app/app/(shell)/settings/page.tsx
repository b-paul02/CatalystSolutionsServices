import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { Badge } from "@/components/leados/ui";
import OrgForm from "./OrgForm";

export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage() {
  const actor = await requireOrg();
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId } });
  if (!org) return null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--los-muted)]">
        <Badge tone="brand">{org.market === "IN" ? "India (₹)" : "United States ($)"}</Badge>
        <Badge>{org.intendedUse.toUpperCase()} leads</Badge>
        <span>Terms {org.termsVersion} accepted {org.termsAcceptedAt?.toLocaleDateString()}</span>
      </div>
      <OrgForm
        canManage={actor.role === "owner" || actor.role === "admin"}
        org={{ name: org.name, website: org.website ?? "", industry: org.industry ?? "" }}
      />
    </div>
  );
}
