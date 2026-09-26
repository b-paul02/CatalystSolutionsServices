import { db } from "@/lib/audit/db";
import type { Enrichment } from "@/lib/leados/enrich";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { enrichAccept, enrichStart } from "../../_os/phase3";

const LABELS: Record<string, string> = { name: "Company name", title: "Homepage title", description: "Description", city: "City", country: "Country", telephone: "Company phone", social: "Social profiles", cms: "CMS", hosting: "Hosting", stack: "Stack", emailProvider: "Email provider" };
const ACCEPT = ["name", "industry", "city", "country", "cms", "hosting", "stack", "emailProvider"];

// WP-46 · company fields read from the company's own homepage; a person accepts what gets written to the company.
export default async function EnrichmentPanel({ leadId, canEdit }: { leadId: string; canEdit: boolean }) {
  const row = await db.losLeadEnrichment.findUnique({ where: { leadId } });
  const data = row ? (JSON.parse(row.data) as Enrichment) : null;
  const keys = data ? Object.keys(data.fields) : [];
  return (
    <Card className="mt-4 p-4 text-[13.5px]">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><div className="text-[15px] font-bold">Company enrichment</div>{canEdit && <ActionForm action={enrichStart} submit={row ? "Refresh" : "Enrich from website"} tone="ghost" hidden={{ leadId }} />}</div>
      <p className="mb-2 text-[12.5px] text-[var(--los-muted)]">Company fields only, read from the company&apos;s public homepage and DNS. Nothing purchased, no personal data, robots.txt respected. Each field names its source.</p>
      {!row ? <p className="text-[var(--los-faint)]">Not run yet.</p> : !data?.url ? <p className="text-[var(--los-faint)]">No company domain on this lead (work email or company website needed).</p> : !data.robotsAllowed ? <p className="text-[var(--los-faint)]">{data.url} disallows crawling in robots.txt — nothing read.</p> : keys.length === 0 ? <p className="text-[var(--los-faint)]">The homepage gave nothing usable.</p> : (
        <ActionForm action={enrichAccept} submit="Apply selected to company" tone="ghost" hidden={{ leadId }}>
          <ul className="divide-y divide-[var(--los-line)]">{keys.map((k) => <li key={k} className="flex items-start gap-2 py-1.5"><input type="checkbox" name="field" value={k} disabled={!canEdit || !ACCEPT.includes(k)} className="mt-1" /><div className="min-w-0 flex-1"><div className="text-[12px] text-[var(--los-faint)]">{LABELS[k] ?? k} · {data.fields[k].source} · {data.fields[k].fetchedAt.slice(0, 10)}</div><div className="break-words">{data.fields[k].value}</div></div></li>)}</ul>
          {row.acceptedAt && <p className="mt-1 text-[12px] text-[var(--los-faint)]">Last applied {row.acceptedAt.toISOString().slice(0, 10)}.</p>}
        </ActionForm>
      )}
      {row?.acceptedAt && <GrowthStep done="Company details applied." step={{ pillar: "market_intelligence", metric: "leads", metricLabel: "Enquiries", action: { kind: "work_item", label: "Plan the outreach", title: "Outreach plan for enriched B2B leads", type: "task" } }} />}
    </Card>
  );
}
