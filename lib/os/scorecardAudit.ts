// WP-10b/10c · scorecard submission → CosAuditRun (kind "scorecard", label self_reported) → findings for the lowest-band
// categories → baseline offer / retake version → draft goal suggestions for the weakest categories. Self-reported
// evidence is never blended with verified checks: it is its own run, paired to a verified one when the URL matches.
import { db } from "@/lib/audit/db";
import type { ScorecardSpec, ScoreResult } from "@/lib/leados/scorecard";
import { bandFor } from "@/lib/leados/scorecard";
import { logLosAudit } from "@/lib/leados/audit";
import { PILLARS, SCORING_VERSION, type DraftFinding, type PillarScore } from "./audit";
import { AUDIT_CATEGORY_PILLAR } from "./pillarDefs";

export const SCORECARD_RUN_KIND = "scorecard";

/** Pure mapping. Categories → audit pillars (averaged when several map to one); unmapped pillars stay "unavailable". */
export function auditFromScorecard(score: ScoreResult, spec: ScorecardSpec) {
  const scores: Record<string, PillarScore> = {};
  for (const p of PILLARS) {
    const cats = score.categories.filter((c) => c.pillar === p.key);
    scores[p.key] = cats.length ? { score: Math.round(cats.reduce((a, c) => a + c.pct, 0) / cats.length), label: "self_reported" } : { score: null, label: "unavailable" };
  }
  const lowest = spec.bands[0];
  const findings: DraftFinding[] = score.categories
    .filter((c) => lowest && c.pct >= lowest.min && c.pct <= lowest.max)
    .map((c) => ({ pillar: c.pillar, text: `${c.label}: ${lowest.headline || lowest.label} (self-reported ${c.pct}%)`, severity: "medium", label: "self_reported", evidence: `The person's own answers put "${c.label}" in the "${lowest.label}" band (${c.points}/${c.max} points). ${lowest.body}`.slice(0, 900), sourceUrl: null }));
  const summary = { snapshot: `Self-reported assessment: ${score.pct}/100, band "${score.band}".`, keyPoints: score.categories.map((c) => `${c.label}: ${c.pct}% (self-reported)`), limitations: ["Every score here is the person's own answer, not a measurement. Compare with the verified audit column when one exists.", ...PILLARS.filter((p) => scores[p.key].score === null).map((p) => `${p.label}: not covered by this scorecard.`)], overall: score.pct, selfReported: true };
  return { scores, summary, findings };
}

type Camp = { id: string; orgId: string; name: string; demo: boolean; createdById: string };

/** One run per submission (idempotent). Pairs with a verified run of the same site when the person gave a URL. */
export async function importScorecardRun(campaign: Camp, submissionId: string, score: ScoreResult, spec: ScorecardSpec) {
  const existing = await db.cosAuditRun.findFirst({ where: { sourceSubmissionId: submissionId } }); // one run per submission (checked here: a unique index would trip the no-data-loss push rule)
  if (existing) return existing;
  const sub = await db.losFormSubmission.findUnique({ where: { id: submissionId }, select: { data: true, leadId: true } });
  const values = sub ? (JSON.parse(sub.data) as Record<string, string>) : {};
  const site = values.website ?? values.url ?? values.site ?? "";
  let pairedRunId: string | null = null;
  if (site) {
    try {
      const host = new URL(/^https?:/.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, "");
      const verified = await db.cosAuditRun.findMany({ where: { orgId: campaign.orgId, kind: { not: SCORECARD_RUN_KIND } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, url: true } });
      pairedRunId = verified.find((r) => { try { return new URL(r.url).hostname.replace(/^www\./, "") === host; } catch { return false; } })?.id ?? null;
    } catch { /* not a URL */ }
  }
  const mapped = auditFromScorecard(score, spec);
  const run = await db.cosAuditRun.create({ data: { orgId: campaign.orgId, url: site || `scorecard:${campaign.id}`, kind: SCORECARD_RUN_KIND, scoringVersion: SCORING_VERSION, scores: JSON.stringify(mapped.scores), summary: JSON.stringify(mapped.summary), sourceSubmissionId: submissionId, pairedRunId, label: "self_reported", demo: campaign.demo } });
  if (mapped.findings.length) await db.cosFinding.createMany({ data: mapped.findings.map((f) => ({ ...f, orgId: campaign.orgId, auditRunId: run.id, observedAt: new Date() })) });
  await logLosAudit({ orgId: campaign.orgId, actorType: "system", action: "audit.scorecard_imported", entity: "CosAuditRun", entityId: run.id, data: { findings: mapped.findings.length, paired: Boolean(pairedRunId) } });
  // retake: the same person took it before and that earlier run is the recorded baseline ⇒ a new baseline VERSION (insert-only)
  if (sub?.leadId) {
    const earlier = await db.losFormSubmission.findMany({ where: { leadId: sub.leadId, score: { not: null }, id: { not: submissionId } }, select: { id: true } });
    const earlierRuns = earlier.length ? await db.cosAuditRun.findMany({ where: { sourceSubmissionId: { in: earlier.map((e) => e.id) } }, select: { id: true } }) : [];
    const latest = await db.cosBaseline.findFirst({ where: { orgId: campaign.orgId }, orderBy: { version: "desc" } });
    if (latest && earlierRuns.some((r) => r.id === latest.auditRunId)) {
      await db.cosBaseline.create({ data: { orgId: campaign.orgId, version: latest.version + 1, auditRunId: run.id, snapshot: JSON.stringify({ scores: mapped.scores, scoringVersion: SCORING_VERSION, takenAt: new Date().toISOString(), selfReported: true }), supersedesId: latest.id, reason: "scorecard_retake", approvedById: campaign.createdById } });
    }
  }
  await suggestGoalsFromScorecard(campaign.orgId, score, spec);
  return run;
}

/** WP-10c · draft goals (agreedAt null) for the weakest categories: metric scorecard.<category>, target = next band's lower bound. */
export async function suggestGoalsFromScorecard(orgId: string, score: ScoreResult, spec: ScorecardSpec, limit = 2) {
  const weakest = [...score.categories].sort((a, b) => a.pct - b.pct).slice(0, limit);
  let created = 0;
  for (const c of weakest) {
    const { index } = bandFor(spec, c.pct);
    const next = spec.bands[index + 1];
    if (!next) continue; // already in the top band: nothing to suggest
    const metric = `scorecard.${c.key}`;
    if (await db.cosGoal.findFirst({ where: { orgId, metric, archivedAt: null } })) continue;
    await db.cosGoal.create({ data: { orgId, metric, pillar: AUDIT_CATEGORY_PILLAR[c.pillar] ?? "market_intelligence", target: next.min, unit: "percent", horizon: "90 days", definition: `Suggested from the scorecard: "${c.label}" scored ${c.pct}% (self-reported). Reaching ${next.min}% is the "${next.label}" band.`, currentValue: c.pct, currentLabel: "estimated" } });
    created++;
  }
  return created;
}

/** The most recent scorecard run and its verified pair (either direction), for the Audit page and the Growth Plan. */
export async function pairedRuns(orgId: string) {
  const sc = await db.cosAuditRun.findFirst({ where: { orgId, kind: SCORECARD_RUN_KIND }, orderBy: { createdAt: "desc" } });
  if (!sc) return null;
  const verified = sc.pairedRunId ? await db.cosAuditRun.findUnique({ where: { id: sc.pairedRunId } }) : await db.cosAuditRun.findFirst({ where: { orgId, kind: { not: SCORECARD_RUN_KIND } }, orderBy: { createdAt: "desc" } });
  return { scorecard: sc, verified: verified && verified.orgId === orgId ? verified : null };
}

/** Facts for the "Where you are" narrative: only numbers that exist. */
export function whereYouAreFacts(sc: { scores: string }, verified: { scores: string } | null, goals: { metric: string; target: number; currentValue: number | null }[]) {
  const s = JSON.parse(sc.scores) as Record<string, PillarScore>, v = verified ? (JSON.parse(verified.scores) as Record<string, PillarScore>) : null;
  const facts: Record<string, string | number | null> = {};
  for (const p of PILLARS) { facts[`${p.label} (self-reported)`] = s[p.key]?.score ?? null; if (v) facts[`${p.label} (verified)`] = v[p.key]?.score ?? null; }
  for (const g of goals) facts[`Goal ${g.metric}`] = `${g.currentValue ?? "n/a"} → ${g.target}`;
  return facts;
}
