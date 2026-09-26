import { db } from "@/lib/audit/db";
import { Tabs } from "@/components/os/v2";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import type { PlanPayload } from "@/lib/os/ai";
import { allocationDiff } from "@/lib/os/workflow";
import { PILLAR_LABEL, PILLARS5 } from "@/lib/os/pillars";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, field, human, PageHeader, SectionTitle } from "@/components/os/bits";
import { acceptGoal, archiveGoal, decidePlan, draftPlan, proposeLearning, reviewLearning, saveGoal, submitPlan } from "../_os/actions";
import { pairedRuns, whereYouAreFacts } from "@/lib/os/scorecardAudit";
import { factualNarrative } from "@/lib/os/ai";
import { PILLARS, type PillarScore } from "@/lib/os/audit";

export const metadata = { title: "Strategy" };

// AI CMO (blueprint §6.1): goals → evidence-cited plan → strategist review →
// client approval, with a visible allocation diff against the approved plan.
export default async function StrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { actor } = await requireModule("strategy", "work.view");
  const orgId = actor.orgId;
  const [goals, plans, learnings, findingIds] = await Promise.all([
    db.cosGoal.findMany({ where: { orgId, archivedAt: null }, orderBy: { createdAt: "asc" } }),
    db.cosPlan.findMany({ where: { orgId }, orderBy: { version: "desc" }, take: 6 }),
    db.cosLearning.findMany({ where: { orgId, status: { not: "rejected" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.cosFinding.findMany({ where: { orgId }, select: { id: true, text: true, label: true } }),
  ]);
  const strategist = can(actor.role, "strategy.manage");
  const decider = can(actor.role, "approvals.decide");
  const approved = plans.find((p) => p.status === "approved");
  const pair = await pairedRuns(orgId);
  const accepted = goals.filter((g) => g.agreedAt);
  const where = pair ? { facts: whereYouAreFacts(pair.scorecard, pair.verified, accepted), sc: JSON.parse(pair.scorecard.scores) as Record<string, PillarScore>, v: pair.verified ? (JSON.parse(pair.verified.scores) as Record<string, PillarScore>) : null } : null;
  const evidenceText = (id: string) => findingIds.find((f) => f.id === id);

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Growth Plan" sub="Goals you agree, a plan that cites its evidence, and a diff before anything changes." />
      <Tabs active="plan" items={[{ key: "plan", label: "Goals and plan", href: "/app/strategy" }, { key: "profile", label: "Business profile", href: "/app/strategy/profile" }, { key: "audit", label: "Diagnosis", href: "/app/audit" }]} />

      {where && (
        <Card className="mb-5 p-5 text-[13.5px]">
          <div className="mb-1 text-[15px] font-bold">Where you are</div>
          <p className="mb-3 text-[12.5px] text-[var(--los-muted)]">Self-reported scorecard answers next to the verified audit{where.v ? "" : " (no verified audit of the same site yet)"}. Numbers only — no causes are inferred.</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {PILLARS.map((p) => <div key={p.key} className="rounded-lg border border-[var(--los-line)] p-2"><div className="text-[12px] text-[var(--los-muted)]">{p.label}</div><div className="text-[13px]"><span className="text-[var(--los-faint)]">self </span><b>{where.sc[p.key]?.score ?? "—"}</b>{where.v && <> · <span className="text-[var(--los-faint)]">verified </span><b>{where.v[p.key]?.score ?? "—"}</b></>}</div></div>)}
          </div>
          <pre className="mt-3 whitespace-pre-wrap text-[12.5px] text-[var(--los-muted)]">{factualNarrative("latest scorecard and audit", where.facts, "Self-reported scores are the person's own answers; verified scores come from the audit pipeline. Missing means not measured.")}</pre>
        </Card>
      )}
      <Card className="mb-5">
        <SectionTitle>Goals</SectionTitle>
        <ul className="divide-y divide-[var(--los-line)]">
          {goals.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]">
              <div>{g.pillar && <span className="mr-1 rounded bg-[var(--los-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--los-muted)]">{PILLAR_LABEL[g.pillar as keyof typeof PILLAR_LABEL] ?? g.pillar}</span>}<span className="font-medium">{g.metric}</span> · target {g.target.toLocaleString()} {g.unit} in {g.horizon}{g.definition ? <span className="text-[var(--los-muted)]"> — {g.definition}</span> : null}</div>
              <div className="flex items-center gap-2 text-[12.5px]">
                <span>{g.currentValue === null ? "Not connected" : `${g.currentValue.toLocaleString()} now`}</span><EvidenceBadge label={g.currentLabel} />
                {!g.agreedAt && <span className="rounded bg-[var(--los-surface-2)] px-1.5 py-0.5 text-[11px]">suggested · draft</span>}
                {!g.agreedAt && (decider || strategist) && <ActionForm action={acceptGoal} submit="Accept" hidden={{ id: g.id }} />}
                {(strategist || can(actor.role, "org.manage")) && <ActionForm action={archiveGoal} submit="Archive" tone="ghost" hidden={{ id: g.id }} />}
              </div>
            </li>
          ))}
          {goals.length === 0 && <Empty>No goals yet.</Empty>}
        </ul>
        {(strategist || can(actor.role, "org.manage")) && (
          <ActionForm action={saveGoal} submit="Add goal" className="grid gap-3 border-t border-[var(--los-line)] px-5 py-4 text-[13.5px] md:grid-cols-5">
            <div><Label>Pillar</Label><select name="pillar" className={field} defaultValue={sp.pillar ?? ""}><option value="">—</option>{PILLARS5.map((p) => <option key={p} value={p}>{PILLAR_LABEL[p]}</option>)}</select></div>
            <div><Label>Metric</Label><Input name="metric" required placeholder="Qualified leads" defaultValue={sp.metric ?? ""} /></div>
            <div><Label>Target</Label><Input name="target" type="number" step="any" required defaultValue={sp.target ?? ""} /></div>
            <div><Label>Unit</Label><Input name="unit" placeholder="per month" /></div>
            <div><Label>Horizon</Label><Input name="horizon" placeholder="90 days" /></div>
            <div><Label>Current (if known)</Label><Input name="currentValue" type="number" step="any" /></div>
            <div className="md:col-span-5"><Label>Definition (what counts, source of truth)</Label><Input name="definition" placeholder="Form submissions marked qualified by sales in the CRM" /></div>
          </ActionForm>
        )}
      </Card>

      {strategist && (
        <Card className="mb-5 p-5">
          <div className="mb-2 text-[15px] font-bold">Draft a plan (AI CMO)</div>
          <p className="mb-3 text-[13px] text-[var(--los-muted)]">The model reads this workspace&apos;s audit, goals, brand profile and approved learnings only. Validators reject unsupported claims and strip citations that don&apos;t exist. You review before the client sees it.</p>
          {aiAvailable() ? (
            <ActionForm action={draftPlan} submit="Draft plan" className="space-y-2 text-[13.5px]">
              <textarea name="constraints" rows={2} placeholder="Constraints: budget ceiling, channels to avoid, seasonality, sales capacity…" className={field} />
            </ActionForm>
          ) : <p className="text-[13px] text-[var(--los-warn)]">AI is not configured (set LLM_API_KEY). Plans can still be reviewed and approved here once drafted.</p>}
        </Card>
      )}

      <div className="space-y-4">
        {plans.map((p) => {
          const payload = JSON.parse(p.payload) as PlanPayload & { validatorNotes?: string[] };
          const diff = approved && approved.id !== p.id ? allocationDiff((JSON.parse(approved.payload) as PlanPayload).allocation, payload.allocation) : null;
          const visibleToClient = p.status !== "draft";
          if (!visibleToClient && !strategist) return null;
          return (
            <Card key={p.id} className="p-5 text-[13.5px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[15px] font-bold">Plan v{p.version} <span className="text-[12.5px] font-normal text-[var(--los-faint)]">· {human(p.status)} · {p.origin === "ai" ? `AI draft (${p.model})` : "human"} · {day(p.createdAt)}</span></div>
                <div className="flex gap-2">
                  {strategist && p.status === "draft" && <ActionForm action={submitPlan} submit="Send to client" hidden={{ id: p.id }} />}
                  {decider && p.status === "in_review" && (
                    <>
                      <ActionForm action={decidePlan} submit="Approve plan" hidden={{ id: p.id, decision: "approve" }} />
                      <ActionForm action={decidePlan} submit="Reject" tone="danger" hidden={{ id: p.id, decision: "reject" }} className="flex items-end gap-2"><input name="note" required placeholder="Reason" className={`${field} !w-44`} /></ActionForm>
                    </>
                  )}
                </div>
              </div>
              <p className="mb-3">{payload.summary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 font-semibold">Allocation</div>
                  <table className="w-full text-[13px]">
                    <tbody>
                      {payload.allocation.map((a) => {
                        const row = diff?.rows.find((r) => r.channel === a.channel);
                        return (
                          <tr key={a.channel} className="border-t border-[var(--los-line)]">
                            <td className="py-1.5 pr-2 font-medium">{a.channel}</td>
                            <td className="py-1.5 pr-2 text-right">{a.pct}%{row && row.delta !== 0 && <span className={`ml-1 text-[12px] ${row.material ? "font-semibold text-[var(--los-warn)]" : "text-[var(--los-faint)]"}`}>({row.delta > 0 ? "+" : ""}{row.delta})</span>}</td>
                            <td className="py-1.5 text-[12.5px] text-[var(--los-muted)]">{a.rationale} {a.evidenceIds.length === 0 && <EvidenceBadge label="assumed" />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {diff?.material && <p className="mt-1 text-[12.5px] text-[var(--los-warn)]">Moves 5+ points from the approved plan — owner approval required.</p>}
                </div>
                <div>
                  <div className="mb-1 font-semibold">Focus areas</div>
                  <ul className="space-y-2">
                    {payload.focus.map((f) => (
                      <li key={f.title} className="rounded-lg border border-[var(--los-line)] p-2.5">
                        <div className="font-medium">{f.title} <span className="text-[12px] font-normal text-[var(--los-faint)]">· {f.effort} effort</span></div>
                        <div className="text-[12.5px] text-[var(--los-muted)]">{f.why}</div>
                        <div className="text-[12.5px]">Success: {f.successMetric} · Risk: {f.risk}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.evidenceIds.map((id) => { const e = evidenceText(id); return e ? <span key={id} className="inline-flex items-center gap-1 text-[11.5px]"><EvidenceBadge label={e.label} />{e.text.slice(0, 60)}</span> : null; })}
                          {f.evidenceIds.length === 0 && <EvidenceBadge label="assumed" />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {payload.assumptions.length > 0 && <p className="mt-3 text-[12.5px]"><span className="font-semibold">Assumptions:</span> {payload.assumptions.join(" · ")}</p>}
              {payload.risks.length > 0 && <p className="mt-1 text-[12.5px]"><span className="font-semibold">Risks:</span> {payload.risks.join(" · ")}</p>}
              {payload.alternatives.length > 0 && <p className="mt-1 text-[12.5px]"><span className="font-semibold">Alternatives:</span> {payload.alternatives.map((a) => `${a.name} (${a.tradeoff})`).join(" · ")}</p>}
              {strategist && payload.validatorNotes && payload.validatorNotes.length > 0 && <p className="mt-2 text-[12px] text-[var(--los-faint)]">Validator: {payload.validatorNotes.join(" ")}</p>}
              {p.reviewNote && <p className="mt-2 text-[12.5px] text-[var(--los-danger)]">Rejected: {p.reviewNote}</p>}
            </Card>
          );
        })}
        {plans.length === 0 && <Card><Empty>No plan yet.</Empty></Card>}
      </div>

      <Card className="mt-6">
        <SectionTitle>Learning store</SectionTitle>
        <ul className="divide-y divide-[var(--los-line)]">
          {learnings.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-2.5 text-[13.5px]">
              <div>
                <div className="font-medium">{l.hypothesis}</div>
                <div className="text-[12.5px] text-[var(--los-muted)]">{l.result}{l.uncertainty ? ` · uncertainty: ${l.uncertainty}` : ""}{l.counts ? ` · n=${l.counts}` : ""}{l.window ? ` · ${l.window}` : ""}</div>
              </div>
              <div className="flex items-center gap-2"><EvidenceBadge label={l.status === "approved" ? "verified" : "assumed"} />
                {can(actor.role, "work.review") && l.status === "proposed" && <><ActionForm action={reviewLearning} submit="Approve" tone="ghost" hidden={{ id: l.id, decision: "approve" }} /><ActionForm action={reviewLearning} submit="Reject" tone="ghost" hidden={{ id: l.id, decision: "reject" }} /></>}
              </div>
            </li>
          ))}
          {learnings.length === 0 && <Empty>Nothing learned yet — experiments promote here after review.</Empty>}
        </ul>
        {(strategist || can(actor.role, "work.review")) && (
          <ActionForm action={proposeLearning} submit="Propose learning" tone="ghost" className="grid gap-3 border-t border-[var(--los-line)] px-5 py-4 text-[13.5px] md:grid-cols-2">
            <div><Label>Hypothesis</Label><Input name="hypothesis" required /></div>
            <div><Label>Result</Label><Input name="result" required /></div>
            <div><Label>Segment</Label><Input name="segment" /></div>
            <div><Label>Window</Label><Input name="window" placeholder="2026-08-01 → 2026-08-31" /></div>
            <div><Label>Method</Label><Input name="method" placeholder="A/B, holdout, before/after…" /></div>
            <div><Label>Counts</Label><Input name="counts" placeholder="events / samples" /></div>
            <div className="md:col-span-2"><Label>Uncertainty</Label><Input name="uncertainty" /></div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
