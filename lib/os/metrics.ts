// Metric catalogue + dimensional snapshots (GrowthOS v2, brief §I).
// Two kinds, never mixed: "daily" rows are increments (summable over a range); "lifetime" rows are
// running totals observed on a day (take the LATEST, never sum across days). Rolling lifetime totals
// up across publications is allowed only for additive metrics — reach/unique people never are.
import { createHash } from "node:crypto";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { decryptField } from "@/lib/leados/crypto";
import { WorkError, type WorkActor } from "./work";
import { adapterFor, ga4CampaignReport, AdapterError } from "./adapters";

export type MetricDef = { label: string; definition: string; unit: "count" | "minutes" | "seconds" | "currency" | "percent"; additive: boolean };
export const METRICS: Record<string, MetricDef> = {
  impressions: { label: "Impressions", definition: "Times the content was shown, as reported by the platform. Not people.", unit: "count", additive: true },
  reach: { label: "Reach", definition: "Accounts that saw the content, per platform. Cannot be added across posts or platforms.", unit: "count", additive: false },
  views: { label: "Views", definition: "Views as the platform counts them; definitions differ by platform.", unit: "count", additive: true },
  likes: { label: "Likes", definition: "Likes / reactions.", unit: "count", additive: true },
  comments: { label: "Comments", definition: "Comments and replies.", unit: "count", additive: true },
  shares: { label: "Shares", definition: "Shares / reposts.", unit: "count", additive: true },
  quotes: { label: "Quotes", definition: "Quote posts.", unit: "count", additive: true },
  saves: { label: "Saves", definition: "Saves / bookmarks.", unit: "count", additive: true },
  link_clicks: { label: "Link clicks", definition: "Clicks on the link, as reported by the platform.", unit: "count", additive: true },
  watch_time_minutes: { label: "Watch time", definition: "Estimated minutes watched (YouTube Analytics).", unit: "minutes", additive: true },
  avg_view_duration_sec: { label: "Average view duration", definition: "Average seconds watched per view.", unit: "seconds", additive: false },
  sessions: { label: "Website sessions", definition: "Sessions recorded by website analytics (GA4). Not search clicks.", unit: "count", additive: true },
  key_events: { label: "Key events", definition: "GA4 key events (conversions configured on the website).", unit: "count", additive: true },
  clicks: { label: "Search clicks", definition: "Clicks from Google Search results (Search Console). Not website sessions.", unit: "count", additive: true },
  spend: { label: "Ad spend", definition: "Spend in the ad account's currency.", unit: "currency", additive: true },
};
export const SOURCE_LABEL: Record<string, string> = { api: "Synced from the platform", manual: "Entered by a team member", import: "Imported from a file" };

const dayUtc = (d: Date | string) => new Date(`${(typeof d === "string" ? d : d.toISOString()).slice(0, 10)}T00:00:00.000Z`);

export type SnapshotInput = {
  provider: string; metric: string; kind: "daily" | "lifetime"; value: number; day: Date | string; source?: "api" | "manual" | "import";
  connectionId?: string | null; publicationId?: string | null; campaignId?: string | null; url?: string | null; currency?: string | null; paidMode?: string; grade?: string | null; enteredById?: string | null; demo?: boolean;
};

export const dimKeyOf = (s: Pick<SnapshotInput, "publicationId" | "campaignId" | "url" | "connectionId">): string =>
  s.publicationId ? `pub:${s.publicationId}` : s.campaignId ? `camp:${s.campaignId}` : s.url ? `url:${createHash("sha1").update(s.url).digest("hex").slice(0, 16)}` : s.connectionId ? `acct:${s.connectionId}` : "org";

/** Idempotent: the same (metric, kind, dimension, day) is overwritten, so re-syncs never double count. */
export async function upsertSnapshot(orgId: string, s: SnapshotInput) {
  if (!Number.isFinite(s.value) || s.value < 0) throw new WorkError("Metric values must be zero or more.");
  const periodStart = dayUtc(s.day), dimKey = dimKeyOf(s);
  const data = { value: s.value, source: s.source ?? "api", connectionId: s.connectionId ?? null, publicationId: s.publicationId ?? null, campaignId: s.campaignId ?? null, url: s.url ?? null, currency: s.currency ?? null, paidMode: s.paidMode ?? "unknown", grade: s.grade ?? null, enteredById: s.enteredById ?? null, syncedAt: new Date() };
  await db.cosMetricSnapshot.upsert({
    where: { orgId_provider_metric_kind_dimKey_periodStart: { orgId, provider: s.provider, metric: s.metric, kind: s.kind, dimKey, periodStart } },
    update: data, create: { ...data, orgId, provider: s.provider, metric: s.metric, kind: s.kind, dimKey, periodStart, demo: s.demo ?? false },
  });
}

/** A person enters a number (or a CSV row is imported). Always labelled as such; spend needs a currency. */
export async function recordManualSnapshot(actor: WorkActor, s: Omit<SnapshotInput, "source" | "enteredById"> & { source?: "manual" | "import" }) {
  if (!isStaffRole(actor.role) || !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  if (!METRICS[s.metric]) throw new WorkError("Unknown metric.");
  if (METRICS[s.metric].unit === "currency" && !/^[A-Z]{3}$/.test(s.currency ?? "")) throw new WorkError("Money metrics need a currency.");
  if (s.publicationId && !(await db.cosPublication.findFirst({ where: { id: s.publicationId, orgId: actor.orgId } }))) throw new WorkError("Publication not found.");
  if (s.campaignId && !(await db.cosCampaign.findFirst({ where: { id: s.campaignId, orgId: actor.orgId } }))) throw new WorkError("Campaign not found.");
  const ws = await db.cosWorkspace.findUnique({ where: { orgId: actor.orgId }, select: { demo: true } });
  await upsertSnapshot(actor.orgId, { ...s, source: s.source ?? "manual", enteredById: actor.userId, demo: ws?.demo ?? false });
}

/** CSV: date,provider,metric,kind,value[,campaign_code][,post_url][,currency]. Bad rows are reported, good rows kept. */
export async function importSnapshots(actor: WorkActor, csv: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift()?.toLowerCase().split(",").map((h) => h.trim()) ?? [];
  const col = (row: string[], name: string) => row[header.indexOf(name)]?.trim() ?? "";
  if (!["date", "provider", "metric", "value"].every((h) => header.includes(h))) throw new WorkError("The file needs the columns: date, provider, metric, value.");
  let imported = 0; const errors: string[] = [];
  for (const [i, line] of lines.slice(0, 2000).entries()) {
    const row = line.split(",");
    try {
      const code = col(row, "campaign_code"), url = col(row, "post_url");
      const [camp, pub] = await Promise.all([
        code ? db.cosCampaign.findUnique({ where: { orgId_code: { orgId: actor.orgId, code } } }) : null,
        url ? db.cosPublication.findFirst({ where: { orgId: actor.orgId, externalUrl: url } }) : null,
      ]);
      if (code && !camp) throw new WorkError(`unknown campaign "${code}"`);
      if (url && !pub) throw new WorkError("no publication with that link");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(col(row, "date"))) throw new WorkError("date must be YYYY-MM-DD");
      const kind = col(row, "kind") === "lifetime" ? "lifetime" : "daily";
      await recordManualSnapshot(actor, { provider: col(row, "provider"), metric: col(row, "metric"), kind, value: Number(col(row, "value")), day: col(row, "date"), campaignId: pub ? null : camp?.id ?? null, publicationId: pub?.id ?? null, currency: col(row, "currency") || null, source: "import" });
      imported++;
    } catch (e) { if (!(e instanceof WorkError)) throw e; errors.push(`Row ${i + 2}: ${e.message}`); }
  }
  return { imported, errors: errors.slice(0, 20) };
}

// ── sync ─────────────────────────────────────────────────────────────────────

export const METRIC_JOB = "os.metric_sync";

/** Pull platform numbers for ONE publication (identity: provider id stored at publish time). */
export async function syncPublicationMetrics(publicationId: string): Promise<number> {
  const pub = await db.cosPublication.findUnique({ where: { id: publicationId }, include: { variant: { select: { workItem: { select: { campaignId: true } } } } } });
  if (!pub || pub.status !== "published" || !pub.externalId || !pub.connectionId) return 0;
  const conn = await db.cosConnection.findFirst({ where: { id: pub.connectionId, orgId: pub.orgId } });
  if (!conn || conn.status !== "verified" || !conn.capabilities.includes("analytics")) return 0; // disconnected ⇒ no rows ⇒ shown as "not connected", never zero
  const adapter = adapterFor(conn.provider, pub.channel);
  if (!adapter?.metrics) return 0;
  let token = "test-token";
  if (conn.provider !== "test") {
    const { accessToken } = await import("./connectors");
    token = ["x", "youtube", "linkedin", "gsc"].includes(conn.provider) ? await accessToken(pub.orgId, conn.provider as never, conn.id) : decryptField(conn.accessTokenEnc!);
  }
  let rows;
  let config: Record<string, unknown> = {};
  try { config = conn.config ? (JSON.parse(conn.config) as Record<string, unknown>) : {}; } catch { /* no config */ }
  try { rows = await adapter.metrics(token, pub.externalId, { externalAccountId: conn.externalAccountId, accountType: conn.accountType, config }); }
  catch (e) {
    if (e instanceof AdapterError) { await db.cosConnection.update({ where: { id: conn.id }, data: { lastError: `Metrics: ${e.message}`.slice(0, 300), lastCheckedAt: new Date() } }); if (e.kind === "definite") return 0; }
    throw e; // job queue retries with backoff
  }
  const today = new Date();
  for (const r of rows) await upsertSnapshot(pub.orgId, { provider: conn.provider, metric: r.metric, kind: r.kind, value: r.value, day: r.day ?? today, publicationId: pub.id, connectionId: conn.id, campaignId: null, grade: "B", demo: conn.provider === "test" });
  await db.cosConnection.update({ where: { id: conn.id }, data: { lastCheckedAt: today, lastError: null } });
  return rows.length;
}

/** GA4 sessions / key events per campaign per day, matched on the stable utm_campaign code. */
export async function syncGa4(orgId: string): Promise<number> {
  const conn = await db.cosConnection.findFirst({ where: { orgId, provider: "gsc", status: "verified" } });
  const propertyId = conn?.config ? (JSON.parse(conn.config) as { ga4PropertyId?: string }).ga4PropertyId : null;
  if (!conn || !propertyId) return 0;
  const { accessToken } = await import("./connectors");
  const [rows, campaigns] = await Promise.all([ga4CampaignReport(await accessToken(orgId, "gsc", conn.id), propertyId), db.cosCampaign.findMany({ where: { orgId }, select: { id: true, code: true } })]);
  const byCode = new Map(campaigns.map((c) => [c.code, c.id]));
  // several mediums can share a campaign+day → add them before writing the single campaign/day row
  const acc = new Map<string, { campaignId: string; day: string; sessions: number; keyEvents: number; paid: boolean; organic: boolean }>();
  for (const r of rows) {
    const campaignId = byCode.get(r.campaign);
    if (!campaignId) continue;
    const k = `${campaignId}:${r.day}`, a = acc.get(k) ?? { campaignId, day: r.day, sessions: 0, keyEvents: 0, paid: false, organic: false };
    a.sessions += r.sessions; a.keyEvents += r.keyEvents; if (/^(cpc|ppc|paid)/i.test(r.medium)) a.paid = true; else a.organic = true;
    acc.set(k, a);
  }
  for (const a of acc.values()) {
    const paidMode = a.paid && a.organic ? "unknown" : a.paid ? "paid" : "organic";
    await upsertSnapshot(orgId, { provider: "ga4", metric: "sessions", kind: "daily", value: a.sessions, day: a.day, campaignId: a.campaignId, connectionId: conn.id, paidMode, grade: "B" });
    await upsertSnapshot(orgId, { provider: "ga4", metric: "key_events", kind: "daily", value: a.keyEvents, day: a.day, campaignId: a.campaignId, connectionId: conn.id, paidMode, grade: "B" });
  }
  return acc.size;
}

registerJobHandler(METRIC_JOB, async (payload) => {
  const p = payload as { publicationId?: string; ga4OrgId?: string };
  if (p.publicationId) await syncPublicationMetrics(p.publicationId);
  if (p.ga4OrgId) await syncGa4(p.ga4OrgId);
});

/** One job per publication per day for 60 days after publishing; one GA4 job per org per day. */
export async function enqueueMetricSyncs(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const pubs = await db.cosPublication.findMany({ where: { status: "published", adapter: { not: "manual" }, publishedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } }, select: { id: true } });
  for (const p of pubs) await enqueueJob({ type: METRIC_JOB, payload: { publicationId: p.id }, idempotencyKey: `${METRIC_JOB}:${p.id}:${day}` });
  const orgs = await db.cosConnection.findMany({ where: { provider: "gsc", status: "verified", config: { contains: "ga4PropertyId" } }, select: { orgId: true } });
  for (const o of orgs) await enqueueJob({ type: METRIC_JOB, payload: { ga4OrgId: o.orgId }, idempotencyKey: `${METRIC_JOB}:ga4:${o.orgId}:${day}` });
}

// ── read side ────────────────────────────────────────────────────────────────

export type MetricValue = { metric: string; value: number; kind: "daily" | "lifetime"; source: string; syncedAt: Date; provider: string };

/**
 * Value per metric for one dimension. lifetime → the latest observation; daily → the sum inside the range.
 * A metric with no rows is ABSENT from the result (the UI shows "not available"), never 0.
 */
export async function metricsFor(orgId: string, where: { publicationId?: string; campaignId?: string }, range: { start: Date; end: Date }, includeDemo: boolean): Promise<MetricValue[]> {
  const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, ...where, ...(includeDemo ? {} : { demo: false }), OR: [{ kind: "lifetime" }, { kind: "daily", periodStart: { gte: range.start, lt: range.end } }] }, orderBy: { periodStart: "asc" } });
  const out = new Map<string, MetricValue>();
  for (const r of rows) {
    const k = `${r.provider}:${r.metric}:${r.kind}`, prev = out.get(k);
    const kind = r.kind as "daily" | "lifetime";
    out.set(k, { metric: r.metric, provider: r.provider, kind, source: prev && prev.source !== r.source ? "mixed" : r.source, syncedAt: r.syncedAt, value: kind === "daily" ? (prev?.value ?? 0) + r.value : r.value });
  }
  return [...out.values()];
}

/** Campaign roll-up across its publications: ADDITIVE metrics only; reach and averages are left per post. */
export async function campaignContentTotals(orgId: string, campaignId: string, range: { start: Date; end: Date }, includeDemo: boolean) {
  const items = await db.cosWorkItem.findMany({ where: { orgId, campaignId }, select: { id: true } });
  const pubs = await db.cosPublication.findMany({ where: { orgId, status: "published", variant: { workItemId: { in: items.map((i) => i.id) } } }, select: { id: true, channel: true, adapter: true, externalUrl: true, publishedAt: true, variant: { select: { id: true, format: true, workItemId: true, workItem: { select: { title: true } } } } } });
  const totals = new Map<string, number>();
  const perPublication = [];
  for (const p of pubs) {
    const values = await metricsFor(orgId, { publicationId: p.id }, range, includeDemo);
    for (const v of values) if (METRICS[v.metric]?.additive) totals.set(v.metric, (totals.get(v.metric) ?? 0) + v.value);
    perPublication.push({ ...p, values });
  }
  return { publications: perPublication, totals: [...totals.entries()].map(([metric, value]) => ({ metric, value })), note: "Totals add platform-reported counts. They are not unique people, and definitions differ between platforms." };
}
