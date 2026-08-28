import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { parseWeights } from "@/lib/leados/scoring";
import ScoringForm from "./ScoringForm";

export const metadata = { title: "Lead scoring" };

export default async function ScoringPage() {
  const actor = await requireOrg("reports.view");
  const config = await db.losScoringConfig.findUnique({ where: { orgId: actor.orgId } });
  return (
    <ScoringForm
      canManage={can(actor.role, "pipeline.manage")}
      weights={parseWeights(config?.weights)}
    />
  );
}
