import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import Studio from "@/components/os/Studio";
import { field } from "@/components/os/bits";
import { newWorkItem } from "../_os/actions";

export const metadata = { title: "Ads Studio" };

// Read and recommend only (blueprint §6.4): the specialist executes in the ad
// platform, the client governs spend. A change proposal is a tier-3 work item.
export default async function AdsPage() {
  const { actor } = await requireModule("ads", "work.view");
  return (
    <Studio
      actor={actor} title="Ads Studio" studio="Ads" provider="ads"
      sub="Spend, leads and cost per qualified lead with confidence grades. No budget ever changes without a named approval."
      metrics={[{ key: "spend", label: "Spend" }, { key: "clicks", label: "Clicks" }, { key: "leads", label: "Leads" }, { key: "sqls", label: "SQLs" }]}
      note="Automated pauses run only under pre-authorized rules; spend is never increased automatically."
      extras={can(actor.role, "work.manage") ? (
        <Card className="p-4">
          <div className="mb-2 text-[15px] font-bold">Propose a spend change</div>
          <ActionForm action={newWorkItem} submit="Create proposal" hidden={{ type: "task", serviceSlug: "paid-ads", riskTier: "3" }} className="space-y-2 text-[13px]">
            <div><Label>Proposal</Label><Input name="title" required placeholder="Raise Google Search daily cap ₹2,000 → ₹3,000" /></div>
            <div><Label>Rationale &amp; hard cap</Label><textarea name="problem" rows={2} required className={field} /></div>
            <div><Label>Success measure</Label><Input name="successMeasure" placeholder="CPL ≤ ₹800 at grade B or better over 14 days" /></div>
            <p className="text-[12px] text-[var(--los-faint)]">Tier 3 — goes to the workspace owner for approval after internal QA.</p>
          </ActionForm>
        </Card>
      ) : null}
    />
  );
}
