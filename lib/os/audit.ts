// Audit → evidence-labelled findings → immutable baseline (blueprint §5.1, E02/E03).
// Reads the marketing-site audit (Lead/Report) but never writes to those tables.
import { db } from "@/lib/audit/db";
import type { ReportJSON } from "@/lib/audit/report-types";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { canMoveFinding, EVIDENCE_LABELS, type EvidenceLabel } from "./workflow";
import { createWorkItem, WorkError, type WorkActor } from "./work";

export const SCORING_VERSION = "scorecard-v2";

// The six scored pillars (PDF pp. 2–5). Keys match lib/audit/scorecard.ts where they exist.
// defined in pillarDefs.ts (pure) so client components can import it without the server graph
export { AUDIT_PILLARS as PILLARS } from "./pillarDefs";
import { AUDIT_PILLARS as PILLARS } from "./pillarDefs";

export type PillarScore = { score: number | null; label: EvidenceLabel; confidence?: string };
export type DraftFinding = { pillar: string; text: string; severity: string; label: EvidenceLabel; evidence: string; sourceUrl: string | null };

/**
 * Pure mapping from the marketing report to OS audit records. Missing inputs
 * are "unavailable" with a null score — never a verified failure, never 0.
 */
export function auditFromReport(report: ReportJSON, url: string) {
  const sc = report.scorecard ?? null;
  const scores: Record<string, PillarScore> = {};
  for (const p of PILLARS) {
    const sub = sc?.subscores.find((s) => s.key === p.key || s.label.toLowerCase() === p.label.toLowerCase());
    scores[p.key] = sub
      ? { score: sub.score, label: sub.confidence === "high" ? "verified" : sub.confidence === "medium" ? "detected" : "assumed", confidence: sub.confidence }
      : { score: null, label: "unavailable" };
  }
  const findings: DraftFinding[] = [];
  // deterministic failed checks keep the verification level they were measured at
  for (const c of sc?.checks ?? []) {
    if (c.pass) continue;
    findings.push({ pillar: c.pillar, text: c.label, severity: "medium", label: c.verification, evidence: c.detail ?? "Check failed during crawl.", sourceUrl: url });
  }
  // model-written findings are inference until a strategist checks the evidence
  for (const f of report.findings ?? []) {
    findings.push({ pillar: "narrative", text: f.text, severity: f.severity, label: "assumed", evidence: f.evidence, sourceUrl: url });
  }
  const summary = {
    businessName: report.business_name,
    snapshot: report.snapshot,
    keyPoints: report.key_points ?? [],
    routes: report.routes ?? [],
    // ICPs are hypotheses until validated with the client (§5.1)
    icps: (report.icps ?? []).map((i) => ({ ...i, hypothesis: true })),
    quickWins: report.quick_wins ?? [],
    assumptions: report.assumptions ?? [],
    limitations: [
      ...(sc ? [] : ["No website scorecard — site unreachable or not provided."]),
      ...PILLARS.filter((p) => scores[p.key].score === null).map((p) => `${p.label}: not measured (data unavailable).`),
    ],
    overall: sc?.overall ?? null,
    pagesReviewed: sc?.pagesReviewed ?? [],
  };
  return { scores, summary, findings, observedAt: sc?.checkedAt ? new Date(sc.checkedAt) : new Date() };
}

/** Copy a delivered marketing audit into a workspace. Idempotent per (org, lead). */
export async function importAudit(orgId: string, leadId: string, opts: { kind?: string; demo?: boolean } = {}) {
  const existing = await db.cosAuditRun.findFirst({ where: { orgId, sourceLeadId: leadId, kind: opts.kind ?? "initial" } });
  if (existing) return existing;
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { report: true } });
  if (!lead?.report) throw new WorkError("That audit has no report yet.");
  const mapped = auditFromReport(JSON.parse(lead.report.json) as ReportJSON, lead.url);
  const run = await db.cosAuditRun.create({
    data: {
      orgId, sourceLeadId: leadId, url: lead.url, kind: opts.kind ?? "initial", scoringVersion: SCORING_VERSION,
      scores: JSON.stringify(mapped.scores), summary: JSON.stringify(mapped.summary), demo: opts.demo ?? false,
    },
  });
  if (mapped.findings.length) {
    await db.cosFinding.createMany({
      data: mapped.findings.map((f) => ({ ...f, orgId, auditRunId: run.id, observedAt: mapped.observedAt })),
    });
  }
  await logLosAudit({ orgId, actorType: "system", action: "audit.imported", entity: "CosAuditRun", entityId: run.id, data: { findings: mapped.findings.length } });
  return run;
}

/**
 * INSERT-ONLY baseline. The first one is v1; a correction is v(n+1) pointing at
 * the row it supersedes and must say why. Nothing here ever UPDATEs a baseline.
 */
export async function createBaseline(actor: WorkActor, input: { auditRunId?: string | null; snapshot: unknown; reason?: string }) {
  if (!can(actor.role, "strategy.manage")) throw new WorkError("Forbidden.");
  const latest = await db.cosBaseline.findFirst({ where: { orgId: actor.orgId }, orderBy: { version: "desc" } });
  if (latest && !input.reason?.trim()) throw new WorkError("A corrected baseline must state the reason.");
  const baseline = await db.cosBaseline.create({
    data: {
      orgId: actor.orgId, version: (latest?.version ?? 0) + 1, auditRunId: input.auditRunId ?? null,
      snapshot: JSON.stringify(input.snapshot), supersedesId: latest?.id ?? null, reason: input.reason?.trim() || null, approvedById: actor.userId,
    },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "baseline.created", entity: "CosBaseline", entityId: baseline.id, data: { version: baseline.version, supersedes: latest?.id ?? null } });
  return baseline;
}

export async function moveFinding(actor: WorkActor, findingId: string, to: string, opts: { note?: string; label?: string } = {}) {
  const finding = await db.cosFinding.findFirst({ where: { id: findingId, orgId: actor.orgId } });
  if (!finding) throw new WorkError("Finding not found.");
  // the client decides accept / defer / reject; everything else is strategist work
  const clientDecision = finding.status === "proposed" && ["accepted", "deferred", "rejected"].includes(to);
  if (!can(actor.role, clientDecision ? "approvals.decide" : "strategy.manage")) throw new WorkError("Forbidden.");
  if (!canMoveFinding(finding.status, to)) throw new WorkError(`Cannot move a finding from ${finding.status} to ${to}.`);
  if (to === "rejected" && !opts.note?.trim()) throw new WorkError("A reason is required.");
  const label = opts.label && (EVIDENCE_LABELS as readonly string[]).includes(opts.label) && can(actor.role, "strategy.manage") ? opts.label : finding.label;
  await db.cosFinding.update({ where: { id: finding.id }, data: { status: to, statusNote: opts.note?.trim() || finding.statusNote, label } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "finding.moved", entity: "CosFinding", entityId: finding.id, data: { from: finding.status, to } });
}

/** An ACCEPTED finding becomes a traceable work item (E05). Out-of-scope → change request. */
export async function findingToWorkItem(actor: WorkActor, findingId: string, input: { title?: string; serviceSlug?: string | null; objective?: string; successMeasure?: string }) {
  const finding = await db.cosFinding.findFirst({ where: { id: findingId, orgId: actor.orgId } });
  if (!finding) throw new WorkError("Finding not found.");
  if (finding.status !== "accepted") throw new WorkError("Only an accepted finding becomes work.");
  if (finding.workItemId) throw new WorkError("This finding already has a work item.");
  const item = await createWorkItem(actor, {
    title: input.title?.trim() || finding.text.slice(0, 140),
    serviceSlug: input.serviceSlug ?? null,
    findingId: finding.id,
    decision: { problem: finding.text, objective: input.objective ?? null, successMeasure: input.successMeasure ?? null, evidence: [{ findingId: finding.id, label: finding.label, observedAt: finding.observedAt }] },
  });
  await db.cosFinding.update({ where: { id: finding.id }, data: { workItemId: item.id } });
  return item;
}
