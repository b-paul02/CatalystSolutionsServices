// WP-28 · Results widget layout (hide / reorder per workspace) and the monthly print report grouped by growth pillar.
// Every number follows the metric rules: daily adds up, lifetime takes the latest, missing is absent, money per currency,
// demo rows out of real reports. No PDF: a print-styled route the monthly job mails a link to.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import { PILLARS5, PILLAR_LABEL, type Pillar } from "./pillarDefs";
import { businessOutcomes } from "./outcomes";
import { metricsFor, METRICS } from "./metrics";
import { scorecardSummary } from "./scorecardResults";
import { adsSummary } from "./adsSync";
import { trackedPositions } from "./indexnow";
import { periodBounds } from "./time";
import { assertWritable, WorkError, type WorkActor } from "./work";

export const WIDGETS: { key: string; label: string; pillar: Pillar }[] = [
  { key: "enquiries", label: "Enquiries and qualified leads", pillar: "client_acquisition" },
  { key: "sales", label: "Recorded sales", pillar: "client_acquisition" },
  { key: "bookings", label: "Bookings", pillar: "client_acquisition" },
  { key: "scorecards", label: "Scorecards", pillar: "client_acquisition" },
  { key: "website", label: "Website sessions and key events", pillar: "digital_presence" },
  { key: "search", label: "Search clicks and tracked positions", pillar: "digital_visibility" },
  { key: "content", label: "Published content", pillar: "digital_visibility" },
  { key: "ads", label: "Ad spend and results", pillar: "digital_visibility" },
  { key: "delivery", label: "Work delivered", pillar: "business_operations" },
  { key: "ai", label: "AI usage", pillar: "business_operations" },
];
export type LayoutRow = { key: string; hidden: boolean; order: number };

export async function getLayout(orgId: string): Promise<LayoutRow[]> {
  const row = await db.cosReportLayout.findUnique({ where: { orgId } });
  const saved: LayoutRow[] = row ? (JSON.parse(row.widgets) as LayoutRow[]) : [];
  return WIDGETS.map((w, i) => saved.find((s) => s.key === w.key) ?? { key: w.key, hidden: false, order: i }).sort((a, b) => a.order - b.order);
}

export async function setWidget(actor: WorkActor, key: string, patch: { hidden?: boolean; move?: "up" | "down" }) {
  if (!can(actor.role, "reports.view") && !can(actor.role, "work.view")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  if (!WIDGETS.some((w) => w.key === key)) throw new WorkError("Unknown widget.");
  const rows = await getLayout(actor.orgId);
  const i = rows.findIndex((r) => r.key === key);
  if (patch.hidden !== undefined) rows[i].hidden = patch.hidden;
  if (patch.move === "up" && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
  if (patch.move === "down" && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
  const widgets = rows.map((r, order) => ({ ...r, order }));
  await db.cosReportLayout.upsert({ where: { orgId: actor.orgId }, update: { widgets: JSON.stringify(widgets) }, create: { orgId: actor.orgId, widgets: JSON.stringify(widgets) } });
  return widgets;
}

export type PillarSection = { pillar: Pillar; label: string; goals: { metric: string; target: number; unit: string; current: number | null; label: string }[]; facts: { label: string; value: string | number | null; note?: string }[] };

/** Everything the monthly report shows, grouped by pillar. Facts only; nothing inferred. */
export async function monthlyReport(orgId: string, month: string, tz: string, includeDemo: boolean): Promise<{ month: string; range: { start: Date; end: Date }; sections: PillarSection[]; limitations: string[] }> {
  const start = new Date(`${month}-01T00:00:00.000Z`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const range = { start, end };
  const [goals, o, delivered, site, search, tracked, sc, ads, pubs, ai, bookings] = await Promise.all([
    db.cosGoal.findMany({ where: { orgId, archivedAt: null } }),
    businessOutcomes(orgId, range, { includeDemo }),
    db.cosWorkItem.count({ where: { orgId, deliveredAt: { gte: start, lt: end }, ...(includeDemo ? {} : { demo: false }) } }),
    metricsFor(orgId, {}, range, includeDemo),
    db.cosMetricPoint.aggregate({ where: { orgId, provider: "gsc", metric: "clicks", day: { gte: start, lt: end } }, _sum: { value: true }, _count: true }),
    trackedPositions(orgId),
    scorecardSummary(orgId, range, includeDemo),
    adsSummary(orgId, range, includeDemo),
    db.cosPublication.count({ where: { orgId, status: "published", publishedAt: { gte: start, lt: end }, ...(includeDemo ? {} : { adapter: { not: "test" } }) } }),
    db.cosAiUsage.aggregate({ where: { orgId, createdAt: { gte: start, lt: end }, ...(includeDemo ? {} : { demo: false }) }, _count: { _all: true, costMicros: true }, _sum: { costMicros: true } }),
    db.cosBooking.count({ where: { orgId, status: "confirmed", createdAt: { gte: start, lt: end }, ...(includeDemo ? {} : { demo: false }) } }),
  ]);
  const val = (metric: string) => site.find((m) => m.metric === metric && m.kind === "daily")?.value ?? null;
  const sections: PillarSection[] = PILLARS5.map((pillar) => ({ pillar, label: PILLAR_LABEL[pillar], goals: goals.filter((g) => g.pillar === pillar).map((g) => ({ metric: g.metric, target: g.target, unit: g.unit, current: g.currentValue, label: g.currentLabel })), facts: [] }));
  const add = (pillar: Pillar, label: string, value: string | number | null, note?: string) => sections.find((s) => s.pillar === pillar)!.facts.push({ label, value, note });
  add("client_acquisition", "Enquiries", o.leads.total, `${o.leads.known} from a tagged link · ${o.leads.self_reported} told us · ${o.leads.unknown} unknown`);
  add("client_acquisition", "Qualified", o.qualified); add("client_acquisition", "Opportunities opened", o.opportunitiesOpened);
  if (Object.keys(o.sales).length === 0) add("client_acquisition", "Recorded sales", null, "no sale recorded this month"); else for (const [cur, s] of Object.entries(o.sales)) add("client_acquisition", `Recorded sales (${cur})`, `${(Number(s.valueMinor) / 100).toFixed(2)} ${cur}`, `${s.count} sale(s)`);
  add("client_acquisition", "Bookings made", bookings || null, bookings ? undefined : "none this month");
  for (const s of sc) add("client_acquisition", `Scorecard: ${s.name}`, `${s.completions} completed, ${s.leads} leads`, s.averageScore === null ? undefined : `average score ${s.averageScore} (self-reported)`);
  add("digital_presence", "Website sessions", val("sessions"), val("sessions") === null ? "website analytics not connected" : METRICS.sessions.definition);
  add("digital_presence", "Website key events", val("key_events"));
  add("digital_visibility", "Search clicks", search._count ? search._sum.value : null, search._count ? "Search Console" : "Search Console not connected");
  for (const t of tracked) add("digital_visibility", `Position: ${t.query}`, t.position, t.position === null ? "no data yet" : `${t.impressions} impressions · ${t.at?.toISOString().slice(0, 10)}`);
  add("digital_visibility", "Posts published", pubs);
  for (const a of ads) add("digital_visibility", `Ads: ${a.campaign}`, Object.entries(a.spend).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(" + ") || null, `${a.clicks} clicks · ${a.conversions} conversions · ${a.days} days`);
  add("business_operations", "Work delivered", delivered, "counted on the day each item was first delivered");
  add("business_operations", "AI calls", ai._count._all, ai._count._all > 0 && ai._count.costMicros === ai._count._all ? `provider cost $${((ai._sum.costMicros ?? 0) / 1_000_000).toFixed(4)}` : "provider cost unknown for at least one call");
  const rv = await import("./reviews").then((m) => m.reviewsSummary(orgId)).catch(() => null);
  if (rv) add("digital_visibility", "Google reviews", `${rv.count} reviews · average ${rv.average}`, `latest sync ${rv.syncedAt?.toISOString().slice(0, 10)} (lifetime, not per month)`);
  add("market_intelligence", "Scorecards completed", sc.reduce((a, s) => a + s.completions, 0) || null, sc.length ? undefined : "no scorecard ran this month");
  // hidden widgets drop their facts (coarse mapping by pillar + label prefix)
  const layout = await getLayout(orgId);
  const hidden = new Set(layout.filter((l) => l.hidden).map((l) => l.key));
  const drop = (label: string) => (hidden.has("enquiries") && /^(Enquiries|Qualified|Opportunities)/.test(label)) || (hidden.has("sales") && /^Recorded sales/.test(label)) || (hidden.has("bookings") && /^Bookings/.test(label)) || (hidden.has("scorecards") && /^Scorecard/.test(label)) || (hidden.has("website") && /^Website/.test(label)) || (hidden.has("search") && /^(Search|Position)/.test(label)) || (hidden.has("content") && /^Posts/.test(label)) || (hidden.has("ads") && /^Ads/.test(label)) || (hidden.has("delivery") && /^Work delivered/.test(label)) || (hidden.has("ai") && /^AI/.test(label));
  for (const s of sections) s.facts = s.facts.filter((f) => !drop(f.label));
  const limitations = ["Numbers are platform-reported or entered by a team member and labelled as such. Missing means not measured, never zero. Money is never added across currencies. Nothing here states a cause."];
  return { month, range, sections, limitations };
}

/** Once per org per month (tick): mail the print link to the workspace owners. Idempotent by heartbeat key. */
export async function monthlyReportMail(now = new Date()) {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  if (now.getUTCDate() < 2) return 0; // give the last syncs a day
  const wss = await db.cosWorkspace.findMany({ where: { kind: "client", accessMode: "active" }, select: { orgId: true } });
  let sent = 0;
  for (const ws of wss) {
    const key = `os.monthly_report:${ws.orgId}:${month}`;
    if (await db.cosHeartbeat.findUnique({ where: { key } })) continue;
    const owners = await db.losMembership.findMany({ where: { orgId: ws.orgId, role: { in: ["owner", "admin"] } }, include: { user: { select: { email: true } } } });
    const org = await db.losOrg.findUnique({ where: { id: ws.orgId }, select: { name: true } });
    for (const o of owners) await sendLosMail({ to: o.user.email, subject: `${org?.name ?? "Your"} monthly report — ${month}`, text: `Your monthly report for ${month} is ready. Open it (sign in first):\n${APP_URL}/reports/print?month=${month}\n\nUse your browser's Print for a paper copy.`, link: `${APP_URL}/reports/print?month=${month}` }).catch(() => undefined);
    await db.cosHeartbeat.create({ data: { key, at: now } }).catch(() => undefined);
    sent++;
  }
  return sent;
}
