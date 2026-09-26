// WP-10d · scorecard → Results. Daily CosMetricSnapshot rows per campaign: scorecard.starts, scorecard.completions,
// scorecard.leads, scorecard.score_sum, scorecard.band.<label>. Values are RECOMPUTED from the stored rows for that day
// and upserted, so a retry never double counts. Average score = score_sum / completions, computed at read.
// Demo campaigns write demo rows, which stay out of real clients' reports.
import { db } from "@/lib/audit/db";
import type { ScoreResult } from "@/lib/leados/scorecard";
import { upsertSnapshot } from "./metrics";
import { notify } from "./notify";

export const SCORECARD_PROVIDER = "scorecard";
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

type Camp = { id: string; orgId: string; name: string; demo: boolean; marketingCampaignId: string | null };

/** Recompute one campaign-day from the submissions table (completions, leads, score sum, bands). */
export async function recomputeScorecardDay(campaign: Camp, day: string) {
  const start = new Date(`${day}T00:00:00.000Z`), end = new Date(start.getTime() + 86_400_000);
  const rows = await db.losFormSubmission.findMany({ where: { campaignId: campaign.id, score: { not: null }, createdAt: { gte: start, lt: end } }, select: { score: true, status: true } });
  const scores = rows.map((r) => JSON.parse(r.score!) as ScoreResult);
  const bands = new Map<string, number>();
  for (const s of scores) bands.set(s.band, (bands.get(s.band) ?? 0) + 1);
  const base = { provider: SCORECARD_PROVIDER, kind: "daily" as const, day, campaignId: campaign.marketingCampaignId, url: `los:${campaign.id}`, grade: "B", demo: campaign.demo, source: "api" as const };
  const w = (metric: string, value: number) => upsertSnapshot(campaign.orgId, { ...base, metric, value });
  await w("scorecard.completions", scores.length);
  await w("scorecard.leads", rows.filter((r) => r.status === "accepted").length);
  await w("scorecard.score_sum", scores.reduce((a, s) => a + s.pct, 0));
  for (const [band, n] of bands) await w(`scorecard.band.${band.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, n);
}

/** A visitor pressed Start (first answer): counted per campaign-day. Called from the public route, idempotent per visit key. */
export async function recordScorecardStart(campaign: Camp, day = dayOf(new Date())) {
  const key = `scorecard.starts:${campaign.id}:${day}`;
  // one row per day, incremented in place; a start is a counter (no submission to recompute from)
  await db.$transaction(async (tx) => {
    const hb = await tx.cosHeartbeat.upsert({ where: { key }, update: { note: "" }, create: { key, at: new Date(), note: "0" } });
    const n = (Number(hb.note) || 0) + 1;
    await tx.cosHeartbeat.update({ where: { key }, data: { note: String(n), at: new Date() } });
    await upsertSnapshot(campaign.orgId, { provider: SCORECARD_PROVIDER, kind: "daily", day, metric: "scorecard.starts", value: n, campaignId: campaign.marketingCampaignId, url: `los:${campaign.id}`, grade: "B", demo: campaign.demo, source: "api" });
  });
}

/** After processSubmission stored a scored submission. */
export async function onScorecardCompleted(campaign: Camp, submissionId: string, score: ScoreResult) {
  await recomputeScorecardDay(campaign, dayOf(new Date()));
  await notify({ orgId: campaign.orgId, audience: "client", kind: "new_lead", title: `New scorecard result: ${score.band} (${score.pct}%) — ${campaign.name}`, body: "Self-reported answers. Open the lead to follow up.", href: `/app/campaigns/${campaign.id}`, dedupeKey: `scorecard:${submissionId}` });
}

/** Read side for the Results widget and reports: totals over a range, per campaign. Missing = absent. */
export async function scorecardSummary(orgId: string, range: { start: Date; end: Date }, includeDemo: boolean) {
  const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, provider: SCORECARD_PROVIDER, kind: "daily", periodStart: { gte: range.start, lt: range.end }, ...(includeDemo ? {} : { demo: false }) } });
  const byCamp = new Map<string, { starts: number; completions: number; leads: number; scoreSum: number; bands: Record<string, number> }>();
  for (const r of rows) {
    const k = r.url ?? "org";
    const c = byCamp.get(k) ?? { starts: 0, completions: 0, leads: 0, scoreSum: 0, bands: {} };
    if (r.metric === "scorecard.starts") c.starts += r.value; else if (r.metric === "scorecard.completions") c.completions += r.value; else if (r.metric === "scorecard.leads") c.leads += r.value; else if (r.metric === "scorecard.score_sum") c.scoreSum += r.value;
    else if (r.metric.startsWith("scorecard.band.")) { const b = r.metric.slice("scorecard.band.".length); c.bands[b] = (c.bands[b] ?? 0) + r.value; }
    byCamp.set(k, c);
  }
  const ids = [...byCamp.keys()].filter((k) => k.startsWith("los:")).map((k) => k.slice(4));
  const names = new Map((await db.losCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return [...byCamp.entries()].map(([k, c]) => ({ campaignId: k.slice(4), name: names.get(k.slice(4)) ?? "Scorecard", ...c, averageScore: c.completions ? Math.round(c.scoreSum / c.completions) : null }));
}
