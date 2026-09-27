// WP-25 · read-only ad metrics: Meta Marketing API insights (existing meta connection with ads_read) and Google Ads
// (needs an approved developer token — GOOGLE_ADS_DEVELOPER_TOKEN — else the Connections card says "Awaiting approval").
// Daily spend / clicks / conversions per campaign → CosMetricSnapshot (daily, per currency, paidMode "paid").
// Spend CHANGES stay manual Tier-3 proposals; nothing here writes to an ad platform.
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { upsertSnapshot } from "./metrics";
import { approvalProviderEnabled } from "./connections";

export const ADS_JOB = "os.ads_sync";
const META = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}`;
const DAYS = 28;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const range = (now: Date) => ({ since: iso(new Date(now.getTime() - DAYS * 86_400_000)), until: iso(new Date(now.getTime() - 86_400_000)) });

/** Meta: /act_<id>/insights at campaign level, one row per day. */
export async function syncMetaAds(orgId: string, connectionId: string, now = new Date()): Promise<number> {
  const conn = await db.cosConnection.findFirst({ where: { id: connectionId, orgId, provider: "meta", accountType: "ad_account", status: "verified" } });
  if (!conn?.accessTokenEnc) return 0;
  const { decryptField } = await import("@/lib/leados/crypto");
  const token = decryptField(conn.accessTokenEnc);
  const { since, until } = range(now);
  const url = `${META}/${encodeURIComponent(conn.externalAccountId ?? "")}/insights?level=campaign&time_increment=1&fields=campaign_id,campaign_name,spend,clicks,actions,account_currency&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) { await db.cosConnection.update({ where: { id: conn.id }, data: { lastError: `Ads insights: ${res.status}`, lastCheckedAt: now } }); if (res.status >= 500 || res.status === 429) throw new Error(`Meta insights ${res.status}`); return 0; }
  const rows = ((await res.json()) as { data?: { campaign_id: string; campaign_name?: string; date_start: string; spend?: string; clicks?: string; account_currency?: string; actions?: { action_type: string; value: string }[] }[] }).data ?? [];
  let n = 0;
  for (const r of rows) {
    const currency = (r.account_currency ?? "USD").toUpperCase();
    const conversions = (r.actions ?? []).filter((a) => /^(lead|offsite_conversion\.|onsite_conversion\.lead|purchase|complete_registration)/.test(a.action_type)).reduce((a, x) => a + Number(x.value || 0), 0);
    const base = { provider: "meta_ads", kind: "daily" as const, day: r.date_start, connectionId: conn.id, url: `ads:meta:${r.campaign_id}`, paidMode: "paid", grade: "B", demo: false };
    await upsertSnapshot(orgId, { ...base, metric: "spend", value: Number(r.spend ?? 0), currency });
    await upsertSnapshot(orgId, { ...base, metric: "link_clicks", value: Number(r.clicks ?? 0) });
    await upsertSnapshot(orgId, { ...base, metric: "key_events", value: conversions });
    n++;
  }
  await db.cosConnection.update({ where: { id: conn.id }, data: { lastCheckedAt: now, lastError: null, config: JSON.stringify({ ...(conn.config ? JSON.parse(conn.config) : {}), campaigns: Object.fromEntries(rows.map((r) => [r.campaign_id, r.campaign_name ?? r.campaign_id])) }) } });
  return n;
}

/** Google Ads: searchStream GAQL per day per campaign. Only when the developer token exists and the connection carries a customer id. */
export async function syncGoogleAds(orgId: string, connectionId: string, now = new Date()): Promise<number> {
  if (!approvalProviderEnabled("google_ads")) return 0;
  const conn = await db.cosConnection.findFirst({ where: { id: connectionId, orgId, provider: "gsc", status: "verified" } });
  const cfg = conn?.config ? (JSON.parse(conn.config) as { googleAdsCustomerId?: string }) : {};
  if (!conn || !cfg.googleAdsCustomerId || !(conn.scopes ?? "").includes("adwords")) return 0;
  const { accessToken } = await import("./connectors");
  const token = await accessToken(orgId, "gsc", conn.id);
  const { since, until } = range(now);
  const customer = cfg.googleAdsCustomerId.replace(/-/g, "");
  const res = await fetch(`https://googleads.googleapis.com/v19/customers/${customer}/googleAds:searchStream`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "", ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "") } : {}), "Content-Type": "application/json" }, body: JSON.stringify({ query: `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions, customer.currency_code FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'` }), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) { await db.cosConnection.update({ where: { id: conn.id }, data: { lastError: `Google Ads: ${res.status}`, lastCheckedAt: now } }); if (res.status >= 500 || res.status === 429) throw new Error(`Google Ads ${res.status}`); return 0; }
  const chunks = (await res.json()) as { results?: { campaign: { id: string; name?: string }; segments: { date: string }; metrics: { costMicros?: string; clicks?: string; conversions?: number }; customer?: { currencyCode?: string } }[] }[];
  let n = 0;
  for (const r of chunks.flatMap((c) => c.results ?? [])) {
    const base = { provider: "google_ads", kind: "daily" as const, day: r.segments.date, connectionId: conn.id, url: `ads:google:${r.campaign.id}`, paidMode: "paid", grade: "B", demo: false };
    await upsertSnapshot(orgId, { ...base, metric: "spend", value: Number(r.metrics.costMicros ?? 0) / 1_000_000, currency: (r.customer?.currencyCode ?? "USD").toUpperCase() });
    await upsertSnapshot(orgId, { ...base, metric: "link_clicks", value: Number(r.metrics.clicks ?? 0) });
    await upsertSnapshot(orgId, { ...base, metric: "key_events", value: Number(r.metrics.conversions ?? 0) });
    n++;
  }
  await db.cosConnection.update({ where: { id: conn.id }, data: { lastCheckedAt: now, lastError: null } });
  return n;
}

registerJobHandler(ADS_JOB, async (payload) => {
  const p = payload as { orgId: string; connectionId: string; provider: "meta" | "google" };
  if (p.provider === "meta") await syncMetaAds(p.orgId, p.connectionId); else await syncGoogleAds(p.orgId, p.connectionId);
});

/** One job per ad connection per day (tick). */
export async function enqueueAdsSyncs(now = new Date()) {
  const day = iso(now);
  const meta = await db.cosConnection.findMany({ where: { provider: "meta", accountType: "ad_account", status: "verified" }, select: { id: true, orgId: true } });
  for (const c of meta) await enqueueJob({ type: ADS_JOB, payload: { orgId: c.orgId, connectionId: c.id, provider: "meta" }, idempotencyKey: `${ADS_JOB}:meta:${c.id}:${day}` });
  if (approvalProviderEnabled("google_ads")) {
    const google = await db.cosConnection.findMany({ where: { provider: "gsc", status: "verified", config: { contains: "googleAdsCustomerId" } }, select: { id: true, orgId: true } });
    for (const c of google) await enqueueJob({ type: ADS_JOB, payload: { orgId: c.orgId, connectionId: c.id, provider: "google" }, idempotencyKey: `${ADS_JOB}:google:${c.id}:${day}` });
  }
}

/** Read side for the Ads page: per campaign totals over a range, money per currency. Missing = absent. */
export async function adsSummary(orgId: string, range: { start: Date; end: Date }, includeDemo: boolean) {
  const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, provider: { in: ["meta_ads", "google_ads"] }, kind: "daily", periodStart: { gte: range.start, lt: range.end }, ...(includeDemo ? {} : { demo: false }) } });
  const conns = await db.cosConnection.findMany({ where: { orgId, id: { in: [...new Set(rows.map((r) => r.connectionId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, config: true } });
  const names = new Map<string, string>();
  for (const c of conns) { try { for (const [id, name] of Object.entries((JSON.parse(c.config ?? "{}") as { campaigns?: Record<string, string> }).campaigns ?? {})) names.set(`ads:meta:${id}`, name); } catch { /* none */ } }
  const by = new Map<string, { provider: string; campaign: string; spend: Record<string, number>; clicks: number; conversions: number; days: Set<string> }>();
  for (const r of rows) {
    const k = r.url ?? "org", c = by.get(k) ?? { provider: r.provider, campaign: names.get(k) ?? k.split(":").pop() ?? k, spend: {}, clicks: 0, conversions: 0, days: new Set<string>() };
    if (r.metric === "spend" && r.currency) c.spend[r.currency] = (c.spend[r.currency] ?? 0) + r.value; else if (r.metric === "link_clicks") c.clicks += r.value; else if (r.metric === "key_events") c.conversions += r.value;
    c.days.add(r.periodStart.toISOString().slice(0, 10)); by.set(k, c);
  }
  return [...by.values()].map((c) => ({ ...c, days: c.days.size }));
}
