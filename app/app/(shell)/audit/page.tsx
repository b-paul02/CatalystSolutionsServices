import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { PILLARS, type PillarScore } from "@/lib/os/audit";
import { SERVICES } from "@/lib/os/catalog";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, field, human, PageHeader, SectionTitle } from "@/components/os/bits";
import { approveBaseline, findingMove, findingToWork } from "../_os/actions";

export const metadata = { title: "Growth Audit" };

type Summary = { snapshot?: string; keyPoints?: string[]; routes?: { name: string; involves: string; effort: string; tradeoffs: string }[]; icps?: { name: string; body: string }[]; quickWins?: string[]; limitations?: string[]; overall?: number | null };

export default async function AuditPage() {
  const { actor } = await requireModule("audit", "work.view");
  const orgId = actor.orgId;
  const [runs, baselines] = await Promise.all([
    db.cosAuditRun.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.cosBaseline.findMany({ where: { orgId }, orderBy: { version: "desc" } }),
  ]);
  const run = runs[0];
  const strategist = can(actor.role, "strategy.manage");
  const decider = can(actor.role, "approvals.decide");
  if (!run) {
    return (
      <div className="max-w-[900px]">
        <PageHeader title="Growth Audit" sub="Evidence first: six scored pillars, every claim linked to a source and a date." />
        <Card><Empty>No audit in this workspace yet. Run the free <a className="text-[var(--los-brand)] hover:underline" href="https://catalystsolutionservices.com/growth-audit">Growth Audit</a> — your Catalyst lead will attach it here.</Empty></Card>
      </div>
    );
  }
  const findings = await db.cosFinding.findMany({ where: { orgId, auditRunId: run.id, status: { not: "archived" } }, orderBy: [{ severity: "asc" }, { createdAt: "asc" }] });
  const scores = JSON.parse(run.scores) as Record<string, PillarScore>;
  const summary = JSON.parse(run.summary) as Summary;
  const previous = runs[1] ? (JSON.parse(runs[1].scores) as Record<string, PillarScore>) : null;
  const base = baselines[0] ? (JSON.parse(baselines[0].snapshot) as { scores?: Record<string, PillarScore> }).scores ?? null : null;
  const compare = previous ?? base;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Growth Audit" sub={`${run.url} · ${human(run.kind)} audit · ${day(run.createdAt)} · scoring ${run.scoringVersion}`} />

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
            {baselines.length === 0 && <p className="text-[var(--los-muted)]">Not recorded yet.</p>}
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
                  <div className="font-medium">{f.text}</div>
                  <div className="text-[12.5px] text-[var(--los-muted)]">Evidence: {f.evidence} · observed {day(f.observedAt)}{f.sourceUrl ? <> · <a className="hover:underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer">source</a></> : null}</div>
                  {f.statusNote && <div className="text-[12.5px] text-[var(--los-faint)]">{f.statusNote}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--los-faint)]"><EvidenceBadge label={f.label} /><span>{human(f.status)}</span></div>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {strategist && f.status === "identified" && (
                  <ActionForm action={findingMove} submit="Evidence checked" tone="ghost" hidden={{ id: f.id, to: "evidence_checked" }} className="flex items-end gap-2">
                    <select name="label" defaultValue={f.label} className={`${field} !w-auto`} aria-label="Evidence label">{["verified", "detected", "assumed", "unavailable"].map((l) => <option key={l}>{l}</option>)}</select>
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
