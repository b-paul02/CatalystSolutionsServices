import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import type { OrgActor } from "@/lib/leados/auth";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "./ActionForm";
import { day, Empty, EvidenceBadge, field, PageHeader, SectionTitle, StateBadge, TierBadge } from "./bits";
import { recordMetric } from "@/app/app/(shell)/_os/actions";

// Shared Search / Ads studio surface: dated channel metrics with attribution
// grades, the studio's work items, and studio-specific extras. Metrics arrive
// via connectors when credentialed, or are entered by the specialist — either
// way the grade says how much a number can be trusted.
export default async function Studio({
  actor, title, sub, studio, provider, metrics, extras, note,
}: {
  actor: OrgActor; title: string; sub: string; studio: string; provider: string;
  metrics: { key: string; label: string; unit?: string }[];
  extras?: React.ReactNode; note?: React.ReactNode;
}) {
  const since = new Date(Date.now() - 28 * 86_400_000);
  const [points, items, connection] = await Promise.all([
    db.cosMetricPoint.findMany({ where: { orgId: actor.orgId, provider, day: { gte: since } }, orderBy: { day: "desc" } }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, studio, parentId: null, state: { notIn: ["closed", "cancelled"] } }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.cosConnection.findFirst({ where: { orgId: actor.orgId, provider } }),
  ]);
  const totals = metrics.map((m) => {
    const rows = points.filter((p) => p.metric === m.key);
    const grades = new Set(rows.map((r) => r.grade).filter(Boolean));
    return { ...m, value: rows.length ? rows.reduce((a, r) => a + r.value, 0) : null, grade: grades.size === 1 ? [...grades][0] : grades.size > 1 ? "mixed" : null, days: rows.length };
  });
  const staff = can(actor.role, "work.execute") || can(actor.role, "strategy.manage");

  return (
    <div className="max-w-[1100px]">
      <PageHeader title={title} sub={sub}>
        <span className="text-[12.5px] text-[var(--los-faint)]">
          {connection?.status === "verified" ? `Connected · ${connection.accountLabel ?? provider} · checked ${day(connection.lastCheckedAt)}` : connection ? `Connection ${connection.status}` : "Not connected — numbers below are specialist-entered"}
        </span>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {totals.map((t) => (
          <Card key={t.key} className="p-4">
            <div className="text-[12.5px] font-medium text-[var(--los-muted)]">{t.label} · 28d</div>
            <div className="mt-1 text-[24px] font-extrabold">{t.value === null ? <span className="text-[14px] font-semibold text-[var(--los-faint)]">Not connected</span> : `${t.value.toLocaleString()}${t.unit ?? ""}`}</div>
            <div className="mt-1 text-[12px] text-[var(--los-faint)]">{t.grade ? <>grade {t.grade} · </> : null}{t.days} day{t.days === 1 ? "" : "s"} of data</div>
          </Card>
        ))}
      </div>
      {note && <p className="mb-5 text-[12.5px] text-[var(--los-faint)]">{note}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>{studio} work</SectionTitle>
          <ul className="divide-y divide-[var(--los-line)]">
            {items.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]">
                <Link href={`/app/work/${w.id}`} className="min-w-0 truncate font-medium text-[var(--los-brand)] hover:underline">{w.title}</Link>
                <div className="flex shrink-0 gap-2"><TierBadge tier={w.riskTier} /><StateBadge state={w.state} /></div>
              </li>
            ))}
            {items.length === 0 && <Empty>No {studio.toLowerCase()} work yet.</Empty>}
          </ul>
        </Card>
        <div className="space-y-5">
          {extras}
          {staff && (
            <Card className="p-4">
              <div className="mb-2 text-[15px] font-bold">Record a metric</div>
              <ActionForm action={recordMetric} submit="Record" tone="ghost" hidden={{ provider }} className="grid gap-2 text-[13px]">
                <div><Label>Metric</Label><select name="metric" className={field}>{metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Day</Label><Input name="day" type="date" required /></div>
                  <div><Label>Value</Label><Input name="value" type="number" step="any" required /></div>
                </div>
                <div><Label>Attribution grade</Label>
                  <select name="grade" className={field}><option value="">— unknown (D) —</option><option value="A">A · validated first-party, reconciled</option><option value="B">B · traceable, documented gaps</option><option value="C">C · partial / modelled</option><option value="D">D · unverified</option></select>
                </div>
              </ActionForm>
            </Card>
          )}
          <Card className="p-4 text-[12.5px] text-[var(--los-muted)]">
            <div className="mb-1 font-semibold text-[var(--los-fg)]">Reading the grades</div>
            <div className="flex flex-wrap gap-1"><EvidenceBadge label="measured" /> A/B — can back performance claims</div>
            <div className="mt-1 flex flex-wrap gap-1"><EvidenceBadge label="estimated" /> C/D — directional only, never drives budget</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
