import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import Studio from "@/components/os/Studio";
import { field } from "@/components/os/bits";
import { newWorkItem, googleAdsCustomerSave } from "../_os/actions";
import { adsSummary } from "@/lib/os/adsSync";
import { approvalProviderEnabled } from "@/lib/os/connections";
import { periodBounds } from "@/lib/os/time";
import { db } from "@/lib/audit/db";
import { money } from "@/components/os/v2";

export const metadata = { title: "Ads Studio" };

// Read and recommend only (blueprint §6.4): the specialist executes in the ad
// platform, the client governs spend. A change proposal is a tier-3 work item.
export default async function AdsPage() {
  const { actor, ent } = await requireModule("ads", "work.view");
  const [synced, adAccounts, gsc] = await Promise.all([adsSummary(actor.orgId, periodBounds("last30", ent.timezone), ent.demo), db.cosConnection.count({ where: { orgId: actor.orgId, provider: "meta", accountType: "ad_account", status: "verified" } }), db.cosConnection.findFirst({ where: { orgId: actor.orgId, provider: "gsc", status: "verified" }, select: { config: true } })]);
  const gCustomer = gsc?.config ? ((JSON.parse(gsc.config) as { googleAdsCustomerId?: string }).googleAdsCustomerId ?? "") : "";
  return (
    <Studio
      actor={actor} title="Ads Studio" studio="Ads" provider="ads"
      sub="Spend, leads and cost per qualified lead with confidence grades. No budget ever changes without a named approval."
      metrics={[{ key: "spend", label: "Spend" }, { key: "clicks", label: "Clicks" }, { key: "leads", label: "Leads" }, { key: "sqls", label: "SQLs" }]}
      note="Automated pauses run only under pre-authorized rules; spend is never increased automatically."
      extras={<>
        <Card className="mb-4 p-4 text-[13px]">
          <div className="mb-1 text-[15px] font-bold">Synced from the ad platforms (last 30 days, read-only)</div>
          {synced.length === 0 ? <p className="text-[var(--los-muted)]">{adAccounts ? "No rows yet — the daily sync runs on the scheduler." : "Connect a Meta ad account (ads_read) on Settings → Connections. Google Ads shows as “Awaiting approval” until the developer token is in place."}</p> : (
            <table className="w-full text-left"><thead><tr className="text-[12px] text-[var(--los-muted)]"><th className="py-1">Campaign</th><th className="py-1">Platform</th><th className="py-1 text-right">Spend</th><th className="py-1 text-right">Clicks</th><th className="py-1 text-right">Conversions</th><th className="py-1 text-right">Days</th></tr></thead>
              <tbody>{synced.map((r) => <tr key={r.provider + r.campaign} className="border-t border-[var(--los-line)]"><td className="py-1">{r.campaign}</td><td className="py-1">{r.provider === "meta_ads" ? "Meta" : "Google"}</td><td className="py-1 text-right">{Object.entries(r.spend).map(([cur, v]) => money(Math.round(v * 100), cur)).join(" + ") || "—"}</td><td className="py-1 text-right">{r.clicks.toLocaleString("en")}</td><td className="py-1 text-right">{r.conversions.toLocaleString("en")}</td><td className="py-1 text-right">{r.days}</td></tr>)}</tbody></table>
          )}
          <p className="mt-2 text-[12px] text-[var(--los-faint)]">Platform-reported numbers, never blended across currencies. Budgets are only ever changed through an approved proposal below.</p>
          {can(actor.role, "os.settings") && approvalProviderEnabled("google_ads") && gsc && <ActionForm action={googleAdsCustomerSave} submit="Save" tone="ghost" className="mt-2 flex items-end gap-2"><div><Label>Google Ads customer ID</Label><Input name="customerId" defaultValue={gCustomer} placeholder="123-456-7890" /></div></ActionForm>}
        </Card>
        {can(actor.role, "work.manage") ? (
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
      </>}
    />
  );
}
