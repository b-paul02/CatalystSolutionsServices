import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { PILLARS, type PillarScore } from "@/lib/os/audit";
import { SERVICES } from "@/lib/os/catalog";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, field, human, PageHeader, SectionTitle } from "@/components/os/bits";
import { approveBaseline, findingMove, findingToWork, startSiteAuditAction } from "../_os/actions";
import { auditState, SITE_AUDIT_KIND } from "@/lib/os/siteAudit";
import { AutoRefresh } from "@/components/os/StudioForm";
import { isStaffRole } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { pairedRuns, SCORECARD_RUN_KIND } from "@/lib/os/scorecardAudit";
import GrowthStep from "@/components/os/GrowthStep";
import { AUDIT_CATEGORY_PILLAR } from "@/lib/os/pillarDefs";

export const metadata = { title: "Growth Audit" };

type Summary = { snapshot?: string; keyPoints?: string[]; routes?: { name: string; involves: string; effort: string; tradeoffs: string }[]; icps?: { name: string; body: string }[]; quickWins?: string[]; limitations?: string[]; overall?: number | null };

export default async function AuditPage() {
  const { actor } = await requireModule("audit", "work.view");
  const orgId = actor.orgId;
  const [runs, baselines] = await Promise.all([
    db.cosAuditRun.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.cosBaseline.findMany({ where: { orgId }, orderBy: { version: "desc" } }),
  ]);
  // WP-13: a crawl in progress is shown separately; finished site audits are ordinary runs
  const inProgress = runs.filter((r) => r.kind === SITE_AUDIT_KIND && ["crawling", "psi"].includes(auditState(r)?.status ?? "")).map((r) => ({ r, st: auditState(r)! }));
  const failedRun = runs.find((r) => r.kind === SITE_AUDIT_KIND && auditState(r)?.status === "failed");
  const finished = runs.filter((r) => !(r.kind === SITE_AUDIT_KIND && ["crawling", "psi", "failed"].includes(auditState(r)?.status ?? "")));
  const run = finished[0];
  const strategist = can(actor.role, "strategy.manage");
  const decider = can(actor.role, "approvals.decide");
  const staff = isStaffRole(actor.role);
  const ent = await entitlements(orgId);
  const org = await db.losOrg.findUnique({ where: { id: orgId }, select: { website: true } });
  const runPanel = (
    <Card className="mb-5 p-5 text-[13.5px]">
      {inProgress.length > 0 && <AutoRefresh everyMs={5000} />}
      <div className="mb-1 text-[15px] font-bold">Site audit</div>
      {inProgress.map(({ r, st }) => <div key={r.id} role="status" className="mb-2 rounded-lg bg-[var(--los-surface-2)] px-3 py-2">{st.status === "crawling" ? `Crawling ${r.url}: ${st.pages} page(s) checked, ${st.queue.length} queued…` : `Running PageSpeed on ${st.psiQueue.length + 1} page(s)…`} This page updates by itself.</div>)}
      {failedRun && !inProgress.length && <div role="alert" className="mb-2 rounded-lg border border-[var(--los-danger)] px-3 py-2 text-[var(--los-danger)]">The last crawl of {failedRun.url} failed: {auditState(failedRun)?.error}. Run it again below.</div>}
      {staff && ent.accessMode === "active" ? (
        <ActionForm action={startSiteAuditAction} submit={inProgress.length ? "Run another" : "Run site audit"} className="flex flex-wrap items-end gap-2"><div className="min-w-[240px] flex-1"><Label>Website address</Label><Input name="url" defaultValue={org?.website ?? ""} required /></div></ActionForm>
      ) : ent.aiTools.has("site_audit") && can(actor.role, "ai.use") ? (
        <p>Crawl your site for titles, descriptions, headings, alt text, broken links, mixed content and PageSpeed: <Link className="font-semibold text-[var(--los-brand)] hover:underline" href="/app/studio/site_audit">run a site audit from AI Studio →</Link></p>
      ) : <p className="text-[var(--los-muted)]">Site audits are run by your Catalyst team, or by you when the Site audit tool is part of your engagement.</p>}
      <p className="mt-2 text-[12px] text-[var(--los-faint)]">Up to 300 pages, same site only, robots.txt respected. HTML checks are deterministic parsing, not a browser render.</p>
    </Card>
  );
  if (!run) {
    return (
      <div className="max-w-[900px]">
        <PageHeader title="Growth Audit" sub="Evidence first: six scored pillars, every claim linked to a source and a date." />
        {runPanel}
        <Card><Empty>No finished audit in this workspace yet. Run a site audit above, or the free <a className="text-[var(--los-brand)] hover:underline" href="https://catalystsolutionservices.com/growth-audit">Growth Audit</a> — your Catalyst lead will attach it here.</Empty></Card>
      </div>
    );
  }
  const pair = await pairedRuns(orgId);
  // the verified run is the main column; the self-reported scorecard run sits next to it (never blended)
  const main = run.kind === SCORECARD_RUN_KIND && pair?.verified ? pair.verified : run;
  const selfRun = pair?.scorecard ?? null;
  const selfScores = selfRun ? (JSON.parse(selfRun.scores) as Record<string, PillarScore>) : null;
  const findings = await db.cosFinding.findMany({ where: { orgId, auditRunId: { in: [main.id, ...(selfRun ? [selfRun.id] : [])] }, status: { not: "archived" } }, orderBy: [{ severity: "asc" }, { createdAt: "asc" }] });
  const scores = JSON.parse(main.scores) as Record<string, PillarScore>;
  const weakest = PILLARS.map((p) => ({ p, s: scores[p.key]?.score ?? selfScores?.[p.key]?.score ?? null })).filter((x) => x.s !== null).sort((a, b) => a.s! - b.s!)[0] ?? null;
  const summary = JSON.parse(main.summary) as Summary;
  const previous = finished[1] ? (JSON.parse(finished[1].scores) as Record<string, PillarScore>) : null;
  const base = baselines[0] ? (JSON.parse(baselines[0].snapshot) as { scores?: Record<string, PillarScore> }).scores ?? null : null;
  const compare = previous ?? base;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Growth Audit" sub={`${main.url} · ${human(main.kind)} audit · ${day(main.createdAt)} · scoring ${main.scoringVersion}${selfRun ? ` · self-reported scorecard ${day(selfRun.createdAt)}${selfRun.pairedRunId === main.id ? " (same site)" : " (unpaired)"}` : ""}`} />
      {runPanel}
      {weakest && (
        <div className="mb-4"><GrowthStep done="Audit finished." note={`weakest: ${weakest.p.label}`} step={{ pillar: AUDIT_CATEGORY_PILLAR[weakest.p.key] ?? "market_intelligence", metric: `audit.${weakest.p.key}`, metricLabel: `${weakest.p.label} score`, action: { kind: "goal", label: `Set a goal for ${weakest.p.label}`, title: `Raise ${weakest.p.label} from ${weakest.s}`, unit: "score", target: Math.min(100, (weakest.s ?? 0) + 20), horizon: "90 days" } }} /></div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {PILLARS.map((p) => {
          const s = scores[p.key] ?? { score: null, label: "unavailable" };
          const was = compare?.[p.key]?.score;
          const delta = s.score !== null && was !== null && was !== undefined ? s.score - was : null;
          return (
            <Card key={p.key} className="p-4">
              <div className="text-[12px] font-medium text-[var(--los-muted)]">{p.label}</div>
              <div className="mt-1 text-[24px] font-extrabold">
                {s.score === null ? <span className="text-[14px] font-semibold text-[var(--los-faint)]">Not measured</span> : s.score}
                {delta !== null && delta !== 0 && <span className={`ml-1 text-[12.5px] ${delta > 0 ? "text-[var(--los-success)]" : "text-[var(--los-danger)]"}`}>{delta > 0 ? "+" : ""}{delta}</span>}
              </div>
              <EvidenceBadge label={s.label} />
              {selfScores && main.kind !== SCORECARD_RUN_KIND && (() => { const sr = selfScores[p.key]; const d = sr?.score !== null && sr?.score !== undefined && s.score !== null ? sr.score - s.score : null; return (
                <div className="mt-2 border-t border-dashed border-[var(--los-line)] pt-1.5 text-[12.5px]"><span className="text-[var(--los-muted)]">Self-reported: </span><b>{sr?.score ?? "—"}</b>{d !== null && <span className="ml-1 text-[var(--los-faint)]">({d > 0 ? "+" : ""}{d} vs verified)</span>}</div>
              ); })()}
            </Card>
          );
        })}
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 text-[13.5px] lg:col-span-2">
          <div className="mb-2 text-[15px] font-bold">Snapshot</div>
          <p className="whitespace-pre-wrap">{summary.snapshot}</p>
          {summary.keyPoints && summary.keyPoints.length > 0 && <ul className="ml-4 mt-2 list-disc">{summary.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>}
          {summary.routes && summary.routes.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {summary.routes.map((r) => (
                <div key={r.name} className="rounded-lg border border-[var(--los-line)] p-3">
                  <div className="font-semibold">{r.name} <span className="text-[12px] font-normal text-[var(--los-faint)]">· {r.effort} effort</span></div>
                  <div className="text-[13px] text-[var(--los-muted)]">{r.involves}</div>
                  <div className="mt-1 text-[12.5px]">Trade-off: {r.tradeoffs}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5 text-[13px]">
            <div className="mb-2 text-[15px] font-bold">Limitations</div>
            {summary.limitations?.length ? <ul className="ml-4 list-disc text-[var(--los-muted)]">{summary.limitations.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="text-[var(--los-muted)]">All six pillars were measured.</p>}
            {summary.icps && summary.icps.length > 0 && <p className="mt-3 text-[12.5px] text-[var(--los-faint)]">Suggested ICPs ({summary.icps.map((i) => i.name).join(", ")}) are hypotheses until validated with you.</p>}
          </Card>
          <Card className="p-5 text-[13px]">
            <div className="mb-2 text-[15px] font-bold">Baseline</div>
            {baselines.map((b) => (
              <div key={b.id} className="mb-1 flex justify-between"><span>v{b.version}{b.supersedesId ? " (correction)" : ""}</span><span className="text-[var(--los-faint)]">{day(b.createdAt)}</span></div>
            ))}
            {baselines.length === 0 && <p className="text-[var(--los-muted)]">Not recorded yet.{selfRun && !pair?.verified ? " The first scorecard run can be recorded as the starting baseline (self-reported)." : ""}</p>}
            {baselines[0]?.reason && <p className="text-[12.5px] text-[var(--los-muted)]">Latest correction: {baselines[0].reason}</p>}
            {strategist && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-[var(--los-brand)]">{baselines.length ? "Record a corrected baseline" : "Record the starting baseline"}</summary>
                <ActionForm action={approveBaseline} submit="Record baseline" className="mt-2 space-y-2" confirm="Baselines are permanent — they can only be superseded, never edited. Continue?">
                  {baselines.length > 0 && <div><Label>Reason for correction (required)</Label><Input name="reason" required /></div>}
                  <div><Label>What&apos;s working</Label><textarea name="working" rows={2} className={field} /></div>
                  <div><Label>What&apos;s not</Label><textarea name="notWorking" rows={2} className={field} /></div>
                  <div><Label>Opportunities</Label><textarea name="opportunities" rows={2} className={field} /></div>
                </ActionForm>
              </details>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle>Findings &amp; recommendations</SectionTitle>
        <ul className="divide-y divide-[var(--los-line)]">
          {findings.map((f) => (
            <li key={f.id} className="px-5 py-3 text-[13.5px]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{f.text}{f.label === "self_reported" && <span className="ml-1 text-[11px] font-normal text-[var(--los-faint)]">(scorecard answer)</span>}</div>
                  <div className="text-[12.5px] text-[var(--los-muted)]">Evidence: {f.evidence} · observed {day(f.observedAt)}{f.sourceUrl ? <> · <a className="hover:underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer">source</a></> : null}</div>
                  {f.statusNote && <div className="text-[12.5px] text-[var(--los-faint)]">{f.statusNote}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--los-faint)]"><EvidenceBadge label={f.label} /><span>{human(f.status)}</span></div>
              </div>
              {f.severity !== "medium" && <div className="mt-1 text-[11.5px] uppercase tracking-wide text-[var(--los-faint)]">{f.severity}</div>}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {strategist && f.status === "identified" && (
                  <ActionForm action={findingMove} submit="Evidence checked" tone="ghost" hidden={{ id: f.id, to: "evidence_checked" }} className="flex items-end gap-2">
                    <select name="label" defaultValue={f.label} className={`${field} !w-auto`} aria-label="Evidence label">{["verified", "detected", "assumed", "unavailable", "self_reported"].map((l) => <option key={l}>{l}</option>)}</select>
                  </ActionForm>
                )}
                {strategist && (f.status === "evidence_checked" || f.status === "deferred") && <ActionForm action={findingMove} submit="Propose to client" hidden={{ id: f.id, to: "proposed" }} />}
                {strategist && ["identified", "evidence_checked", "deferred", "rejected"].includes(f.status) && <ActionForm action={findingMove} submit="Archive" tone="ghost" hidden={{ id: f.id, to: "archived" }} />}
                {decider && f.status === "proposed" && (
                  <>
                    <ActionForm action={findingMove} submit="Accept" hidden={{ id: f.id, to: "accepted" }} />
                    <ActionForm action={findingMove} submit="Defer" tone="ghost" hidden={{ id: f.id, to: "deferred" }} />
                    <ActionForm action={findingMove} submit="Reject" tone="danger" hidden={{ id: f.id, to: "rejected" }} className="flex items-end gap-2"><input name="note" required placeholder="Reason" className={`${field} !w-48`} /></ActionForm>
                  </>
                )}
                {can(actor.role, "work.manage") && f.status === "accepted" && !f.workItemId && (
                  <ActionForm action={findingToWork} submit="Create work item" hidden={{ id: f.id }} className="flex flex-wrap items-end gap-2">
                    <select name="serviceSlug" className={`${field} !w-auto`} aria-label="Service"><option value="">— service —</option>{SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}</select>
                    <input name="successMeasure" placeholder="Success measure" className={`${field} !w-56`} />
                  </ActionForm>
                )}
                {f.workItemId && <Link href={`/app/work/${f.workItemId}`} className="text-[13px] font-medium text-[var(--los-brand)] hover:underline">View work item →</Link>}
              </div>
            </li>
          ))}
          {findings.length === 0 && <Empty>No open findings.</Empty>}
        </ul>
      </Card>
    </div>
  );
}
