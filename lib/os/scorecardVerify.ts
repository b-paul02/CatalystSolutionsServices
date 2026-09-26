// WP-10e · "Verify with a free site audit" on the public scorecard result: the deterministic check battery from the
// Growth Audit (lib/audit/scrape + scorecard, PSI) runs on the person's URL and lands NEXT TO the self-reported
// answers — a separate verified column, never blended. The result is stored on the submission and mirrored as a
// verified CosAuditRun paired with the scorecard run.
import { db } from "@/lib/audit/db";
import { scrapeSite } from "@/lib/audit/scrape";
import { fetchPageSpeed } from "@/lib/audit/pagespeed";
import { buildScorecard, type Scorecard } from "@/lib/audit/scorecard";
import type { ScoreResult } from "@/lib/leados/scorecard";
import { PILLARS, SCORING_VERSION, type PillarScore } from "./audit";
import { SCORECARD_RUN_KIND } from "./scorecardAudit";
import { WorkError } from "./work";

export type Verified = { url: string; checkedAt: string; overall: number; subscores: { key: string; label: string; score: number; confidence: string }[]; checks: { label: string; pass: boolean; verification: string; pillar: string }[]; pagespeed: { performanceScore: number; lcpSeconds: number | null } | null };
export type StoredScore = ScoreResult & { verified?: Verified };

const safeUrl = (raw: string): string => {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { throw new WorkError("Enter a valid website address."); }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || !u.hostname.includes(".")) throw new WorkError("Enter a public website address.");
  return u.toString();
};

/** Run the verified checks for a submission's URL (idempotent: a second call returns the stored result). */
export async function verifySubmission(publicId: string, submissionId: string, rawUrl: string): Promise<Verified> {
  const campaign = await db.losCampaign.findUnique({ where: { publicId }, select: { id: true, orgId: true, demo: true } });
  const sub = campaign ? await db.losFormSubmission.findFirst({ where: { id: submissionId, campaignId: campaign.id, score: { not: null } } }) : null;
  if (!campaign || !sub?.score) throw new WorkError("Result not found.");
  const stored = JSON.parse(sub.score) as StoredScore;
  if (stored.verified) return stored.verified;
  const url = safeUrl(rawUrl);
  const scraped = await scrapeSite(url);
  const card: Scorecard | null = buildScorecard(scraped, scraped.ok ? await fetchPageSpeed(url) : null);
  if (!card) throw new WorkError("We could not reach that website. Check the address and try again.");
  const verified: Verified = { url, checkedAt: card.checkedAt, overall: card.overall, subscores: card.subscores.map((s) => ({ key: s.key, label: s.label, score: s.score, confidence: s.confidence })), checks: card.checks.map((c) => ({ label: c.label, pass: c.pass, verification: c.verification, pillar: c.pillar })), pagespeed: card.pagespeed ? { performanceScore: card.pagespeed.performanceScore, lcpSeconds: card.pagespeed.lcpSeconds } : null };
  await db.losFormSubmission.update({ where: { id: sub.id }, data: { score: JSON.stringify({ ...stored, verified }) } });
  // mirror as a verified audit run paired with the scorecard run (same site) — never merged into it
  const scores: Record<string, PillarScore> = {};
  for (const p of PILLARS) { const s = card.subscores.find((x) => x.key === p.key || (p.key === "analytics" && x.key === "tracking")); scores[p.key] = s ? { score: s.score, label: s.confidence === "high" ? "verified" : s.confidence === "medium" ? "detected" : "assumed", confidence: s.confidence } : { score: null, label: "unavailable" }; }
  const run = await db.cosAuditRun.create({ data: { orgId: campaign.orgId, url, kind: "verified_scorecard", scoringVersion: SCORING_VERSION, scores: JSON.stringify(scores), summary: JSON.stringify({ snapshot: `Verified checks on ${url}: ${card.verdict}`, keyPoints: card.checks.filter((c) => !c.pass).slice(0, 6).map((c) => c.label), limitations: ["Deterministic checks on the homepage and up to four key pages; not a full audit."], overall: card.overall, sourceSubmissionId: sub.id }), sourceSubmissionId: null, demo: campaign.demo } });
  await db.cosAuditRun.updateMany({ where: { orgId: campaign.orgId, kind: SCORECARD_RUN_KIND, sourceSubmissionId: sub.id }, data: { pairedRunId: run.id, url } });
  return verified;
}

/** Self-reported vs verified per pillar for the combined page. */
export function combinedRows(score: StoredScore) {
  return PILLARS.map((p) => {
    const self = score.categories.filter((c) => c.pillar === p.key);
    const v = score.verified?.subscores.find((s) => s.key === p.key || (p.key === "analytics" && s.key === "tracking")) ?? null;
    return { key: p.key, label: p.label, self: self.length ? Math.round(self.reduce((a, c) => a + c.pct, 0) / self.length) : null, verified: v ? v.score : null, confidence: v?.confidence ?? null };
  });
}
