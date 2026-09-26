// WP-14 · keyword opportunities from Search Console (query × page rows). Three deterministic views plus an LLM topic
// clustering whose every cited query MUST exist in the rows (invented strings are dropped). No volumes: impressions,
// clicks and position are the only numbers, and they are the site's own.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { callClaude } from "@/lib/audit/anthropic";
import { inventedStrings, metered, parseJsonOutput } from "./ai";
import { WorkError, type WorkActor } from "./work";

export type QueryRow = { query: string; page: string; impressions: number; clicks: number; position: number };

/** Rows from the most recent sync day (absent when Search Console has never synced). */
export async function latestQueryRows(orgId: string): Promise<{ day: Date | null; rows: QueryRow[] }> {
  const latest = await db.cosSearchQuery.findFirst({ where: { orgId }, orderBy: { day: "desc" }, select: { day: true } });
  if (!latest) return { day: null, rows: [] };
  const rows = await db.cosSearchQuery.findMany({ where: { orgId, day: latest.day }, select: { query: true, page: true, impressions: true, clicks: true, position: true }, orderBy: { impressions: "desc" }, take: 2000 });
  return { day: latest.day, rows };
}

/** Position 8–20 with impressions: a page already ranking near page one. Sorted by impressions. */
export const strikingDistance = (rows: QueryRow[], minImpressions = 20) => rows.filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= minImpressions).sort((a, b) => b.impressions - a.impressions);

/** One query, two or more pages each with impressions: the site competes with itself. */
export function cannibalisation(rows: QueryRow[], minImpressions = 10) {
  const byQuery = new Map<string, QueryRow[]>();
  for (const r of rows) if (r.impressions >= minImpressions) byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);
  return [...byQuery.entries()].filter(([, pages]) => pages.length >= 2).map(([query, pages]) => ({ query, pages: pages.sort((a, b) => a.position - b.position), impressions: pages.reduce((a, p) => a + p.impressions, 0) })).sort((a, b) => b.impressions - a.impressions);
}

/** Impressions but zero clicks: the snippet is shown and ignored. */
export const noClick = (rows: QueryRow[], minImpressions = 50) => rows.filter((r) => r.impressions >= minImpressions && r.clicks === 0).sort((a, b) => b.impressions - a.impressions);

export type Topic = { name: string; intent: string; queries: string[] };

/** Every query a topic cites must be one of the supplied rows; topics left with no real query are dropped. */
export function validateTopics(raw: unknown, known: string[]): { topics: Topic[]; dropped: string[] } {
  const list = Array.isArray((raw as { topics?: unknown })?.topics) ? (raw as { topics: unknown[] }).topics : [];
  const topics: Topic[] = []; const dropped: string[] = [];
  const allowed = new Set(known.map((k) => k.toLowerCase()));
  for (const t of list) {
    const o = (t ?? {}) as { name?: unknown; intent?: unknown; queries?: unknown };
    const name = String(o.name ?? "").trim().slice(0, 80);
    const cited = Array.isArray(o.queries) ? o.queries.map((q) => String(q).trim()).filter(Boolean) : [];
    const invented = inventedStrings(cited, [...allowed]);
    if (invented.length) dropped.push(...invented.map((q) => `"${q}" (not in your Search Console rows)`));
    const queries = cited.filter((q) => allowed.has(q.toLowerCase()));
    if (!name || queries.length === 0) { if (name) dropped.push(`topic "${name}" cited no real query`); continue; }
    topics.push({ name, intent: ["informational", "commercial", "transactional", "navigational"].includes(String(o.intent)) ? String(o.intent) : "unknown", queries: [...new Set(queries)].slice(0, 40) });
  }
  return { topics, dropped };
}

/** LLM clustering of the top queries into topics. Catalyst-internal metering. Only query strings go to the model. */
export const clusterTopics = (orgId: string, rows: QueryRow[]) => metered(orgId, "keyword_clusters", async () => {
  const queries = [...new Set(rows.map((r) => r.query))].slice(0, 300);
  if (queries.length === 0) return { topics: [] as Topic[], dropped: [] as string[] };
  const text = await callClaude(
    `You group search queries into content topics for an SEO specialist to review. Use ONLY the queries given — never add, edit or invent a query, and never state search volumes. Respond with JSON only.
JSON shape: {"topics":[{"name":string,"intent":"informational|commercial|transactional|navigational","queries":string[]}]}`,
    `Queries (one per line):\n${queries.join("\n")}`,
    3000,
  );
  return parseJsonOutput(text, (raw) => validateTopics(raw, queries));
});

/** "Add to brief": the topic becomes a CosSource (note) the Search brief can cite; optionally a comment on a brief work item. */
export async function addTopicToBrief(actor: WorkActor, topic: Topic, rows: QueryRow[], workItemId?: string | null) {
  if (!can(actor.role, "work.manage") && !can(actor.role, "strategy.manage")) throw new WorkError("Forbidden.");
  const detail = topic.queries.map((q) => { const r = rows.filter((x) => x.query === q); const imp = r.reduce((a, x) => a + x.impressions, 0), clicks = r.reduce((a, x) => a + x.clicks, 0); const pos = r.length ? Math.min(...r.map((x) => x.position)) : null; return `${q} — ${imp} impressions, ${clicks} clicks${pos !== null ? `, best position ${pos.toFixed(1)}` : ""}`; });
  const source = await db.cosSource.create({ data: { orgId: actor.orgId, kind: "note", title: `Keyword topic: ${topic.name}`.slice(0, 200), excerpt: `Intent: ${topic.intent}. From Search Console (impressions, clicks, position — no volumes).\n${detail.join("\n")}`.slice(0, 6000), createdById: actor.userId } });
  if (workItemId) {
    const item = await db.cosWorkItem.findFirst({ where: { id: workItemId, orgId: actor.orgId }, select: { id: true } });
    if (item) await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId: item.id, actorId: actor.userId, actorType: "user", kind: "comment", data: JSON.stringify({ text: `Added keyword topic "${topic.name}" (${topic.queries.length} queries) as source ${source.id}.` }) } });
  }
  return source;
}
