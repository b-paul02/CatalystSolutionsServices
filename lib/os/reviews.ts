// WP-49 · Google Business Profile reviews (behind GOOGLE_BUSINESS_PROFILE_ENABLED — the owner applies for API access):
// rating + snippet per review, reviewer names never stored. Shown on Results (lifetime: latest count / average) and, when
// the workspace links a lead by email, never — GBP does not expose reviewer emails, so the lead timeline only gets the
// review-request send. Review requests are a workflow block under purpose `review_request` (sendOutreachMessage).
import { db } from "@/lib/audit/db";
import { accessToken, primaryConnection } from "./connectors";
import { approvalProviderEnabled } from "./connections";
import { WorkError } from "./work";

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setReviewsFetchForTests = (f: typeof fetch) => { fetchImpl = f; };
const api = async (url: string, token: string) => { const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new WorkError(`Google Business Profile answered HTTP ${r.status}.`); return r.json() as Promise<Record<string, unknown>>; };
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function syncReviews(orgId: string, now = new Date()) {
  if (!approvalProviderEnabled("gbp")) throw new WorkError("Google Business Profile is awaiting API approval on this server.");
  const conn = await primaryConnection(orgId, "gsc");
  if (!conn || conn.status !== "verified") throw new WorkError("Connect Google first (Settings → Connections).");
  const token = await accessToken(orgId, "gsc");
  const accounts = (await api("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token)).accounts as { name: string }[] | undefined;
  let synced = 0, locations = 0;
  for (const a of (accounts ?? []).slice(0, 3)) {
    const locs = (await api(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title`, token)).locations as { name: string; title?: string }[] | undefined;
    for (const l of (locs ?? []).slice(0, 5)) {
      locations++;
      const j = await api(`https://mybusiness.googleapis.com/v4/${a.name}/${l.name}/reviews?pageSize=50`, token);
      for (const r of (j.reviews as { reviewId: string; starRating: string; comment?: string; createTime: string }[] | undefined) ?? []) {
        await db.cosReview.upsert({ where: { orgId_provider_externalId: { orgId, provider: "gbp", externalId: r.reviewId } }, update: { rating: STARS[r.starRating] ?? 0, snippet: r.comment?.slice(0, 500) ?? null, syncedAt: now }, create: { orgId, provider: "gbp", externalId: r.reviewId, rating: STARS[r.starRating] ?? 0, snippet: r.comment?.slice(0, 500) ?? null, at: new Date(r.createTime), syncedAt: now } });
        synced++;
      }
    }
  }
  // lifetime snapshot: latest count and average (never summed)
  const agg = await db.cosReview.aggregate({ where: { orgId, provider: "gbp" }, _count: true, _avg: { rating: true } });
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ws = await db.cosWorkspace.findUnique({ where: { orgId }, select: { demo: true } });
  for (const [metric, value] of [["reviews.count", agg._count], ["reviews.average", Math.round((agg._avg.rating ?? 0) * 100) / 100]] as const) {
    await db.cosMetricSnapshot.upsert({ where: { orgId_provider_metric_kind_dimKey_periodStart: { orgId, provider: "gbp", metric, kind: "lifetime", dimKey: "org", periodStart: day } }, update: { value, source: "api" }, create: { orgId, provider: "gbp", metric, kind: "lifetime", dimKey: "org", periodStart: day, value, source: "api", demo: ws?.demo ?? false } });
  }
  return { synced, locations };
}

export async function reviewsSummary(orgId: string) {
  const [agg, latest] = await Promise.all([db.cosReview.aggregate({ where: { orgId, provider: "gbp" }, _count: true, _avg: { rating: true }, _max: { syncedAt: true } }), db.cosReview.findMany({ where: { orgId, provider: "gbp" }, orderBy: { at: "desc" }, take: 5 })]);
  return agg._count ? { count: agg._count, average: Math.round((agg._avg.rating ?? 0) * 10) / 10, syncedAt: agg._max.syncedAt, latest } : null;
}

export async function tickReviews(now = new Date()) {
  if (!approvalProviderEnabled("gbp") || now.getUTCHours() !== 5) return 0;
  const conns = await db.cosConnection.findMany({ where: { provider: "gsc", status: "verified" }, select: { orgId: true }, distinct: ["orgId"] });
  let n = 0;
  for (const c of conns) { const done = await db.cosMetricSnapshot.findFirst({ where: { orgId: c.orgId, provider: "gbp", metric: "reviews.count", periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } }); if (done) continue; await syncReviews(c.orgId, now).then(() => n++).catch(() => undefined); }
  return n;
}
