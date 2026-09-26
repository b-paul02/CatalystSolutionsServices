import Link from "next/link";
import { db } from "@/lib/audit/db";
import { pillarTiles } from "@/lib/os/pillars";
import { METRICS } from "@/lib/os/metrics";
import { AUDIT_CATEGORY_PILLAR, type Pillar } from "@/lib/os/pillarDefs";
import { Card } from "@/components/leados/ui";

// Growth rule · five pillar tiles: goal, latest metric with its date, next action. "Set a goal" opens the goal form
// pre-filled from the weakest scorecard / audit category. Above them, the three-step onboarding checklist until a
// profile, a goal and a connection exist.
export default async function PillarTiles({ orgId, includeDemo, canGoal }: { orgId: string; includeDemo: boolean; canGoal: boolean }) {
  const [tiles, profile, connections, run] = await Promise.all([
    pillarTiles(orgId, includeDemo),
    db.cosBusinessProfile.findFirst({ where: { orgId }, select: { orgId: true } }),
    db.cosConnection.count({ where: { orgId, status: "verified" } }),
    db.cosAuditRun.findFirst({ where: { orgId, label: null, ...(includeDemo ? {} : { demo: false }) }, orderBy: { createdAt: "desc" }, select: { scores: true } }),
  ]);
  const goals = tiles.filter((t) => t.goal).length;
  // weakest category from the latest audit run summary ({scores: {category: number}}), mapped to its pillar
  let weakest: { pillar: Pillar; category: string } | null = null;
  try { const s = JSON.parse(run?.scores ?? "{}") as Record<string, { score: number | null }>; const worst = Object.entries(s).filter(([, v]) => typeof v?.score === "number").sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0))[0]; if (worst && AUDIT_CATEGORY_PILLAR[worst[0]]) weakest = { pillar: AUDIT_CATEGORY_PILLAR[worst[0]], category: worst[0] }; } catch { weakest = null; }
  const defaultMetric = (p: Pillar) => Object.entries(METRICS).find(([, d]) => d.pillar === p)?.[0] ?? "leads";
  const steps = [
    { done: !!profile, label: "Business profile", href: "/app/strategy/profile" },
    { done: goals > 0, label: "First goal", href: `/app/strategy?pillar=${weakest?.pillar ?? "client_acquisition"}&metric=${defaultMetric(weakest?.pillar ?? "client_acquisition")}` },
    { done: connections > 0, label: "First connection", href: "/app/settings/connections" },
  ];
  return (
    <>
      {steps.some((s) => !s.done) && (
        <Card className="mb-5 p-4 text-[13.5px]">
          <div className="mb-1 font-bold">Getting started · {steps.filter((s) => s.done).length} of 3</div>
          <ol className="flex flex-wrap gap-3">{steps.map((s, i) => <li key={s.label} className={s.done ? "text-[var(--los-faint)] line-through" : ""}>{i + 1}. {s.done ? s.label : <Link href={s.href} className="text-[var(--los-brand)] hover:underline">{s.label} →</Link>}</li>)}</ol>
        </Card>
      )}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.pillar} className="p-3 text-[13px]" data-pillar={t.pillar}>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--los-muted)]">{t.label}</div>
            <div className="mt-1">{t.goal ? <><b>Goal:</b> {t.goal.definition ?? t.goal.metric} · {t.goal.target} {t.goal.unit}</> : canGoal ? <Link href={`/app/strategy?pillar=${t.pillar}&metric=${defaultMetric(t.pillar)}${weakest?.pillar === t.pillar ? `&from=${weakest.category}` : ""}`} className="text-[var(--los-brand)] hover:underline">Set a goal →</Link> : <span className="text-[var(--los-faint)]">No goal yet</span>}</div>
            <div className="mt-1">{t.latest ? <><b>{METRICS[t.latest.metric]?.label ?? t.latest.metric}:</b> {t.latest.value.toLocaleString()} <span className="text-[var(--los-faint)]">· {t.latest.at.toISOString().slice(0, 10)}</span></> : <span className="text-[var(--los-faint)]">No measurement yet</span>}</div>
            <div className="mt-1">{t.next ? <Link href={`/app/work/${t.next.id}`} className="hover:underline"><b>Next:</b> {t.next.title}</Link> : <span className="text-[var(--los-faint)]">No next action</span>}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
