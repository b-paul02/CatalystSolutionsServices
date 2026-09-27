// WP-47 · competitor observer, first-party only: weekly per tracked domain — sitemap URL count, blog feed cadence,
// tech signals, title/description of the top pages → a dated CosSource note in the Growth Plan market section.
// Never estimates traffic.
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { can } from "@/lib/leados/rbac";
import { safeUrl } from "./automation/definition";
import { assertWritable, WorkError, type WorkActor } from "./work";

export const COMPETITOR_JOB = "os.competitor_observe";
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setCompetitorFetchForTests = (f: typeof fetch) => { fetchImpl = f; };
const get = async (url: string, ms = 10_000) => { try { const r = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(ms), headers: { "user-agent": "CatalystGrowthOS-Observer/1.0" } }); return r.ok ? { text: (await r.text()).slice(0, 800_000), headers: r.headers } : null; } catch { return null; } };

export async function addCompetitor(actor: WorkActor, domain: string) {
  if (!can(actor.role, "strategy.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) throw new WorkError("Enter a domain like competitor.com.");
  safeUrl(`https://${d}/`);
  if ((await db.cosCompetitor.count({ where: { orgId: actor.orgId } })) >= 10) throw new WorkError("Up to 10 competitors per workspace.");
  return db.cosCompetitor.upsert({ where: { orgId_domain: { orgId: actor.orgId, domain: d } }, update: {}, create: { orgId: actor.orgId, domain: d } });
}
export async function removeCompetitor(actor: WorkActor, id: string) {
  if (!can(actor.role, "strategy.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await db.cosCompetitor.deleteMany({ where: { id, orgId: actor.orgId } });
}
export async function observeNow(actor: WorkActor, id: string) {
  if (!can(actor.role, "strategy.manage") && !can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  const c = await db.cosCompetitor.findFirst({ where: { id, orgId: actor.orgId } });
  if (!c) throw new WorkError("Competitor not found.");
  await enqueueJob({ type: COMPETITOR_JOB, payload: { id }, idempotencyKey: `${COMPETITOR_JOB}:${id}:${new Date().toISOString().slice(0, 13)}`, maxAttempts: 1 });
}

export type Observation = { domain: string; sitemapUrls: number | null; feed: { items: number; latest: string | null; perMonth: number | null } | null; tech: string[]; topPages: { url: string; title: string | null; description: string | null }[] };

export async function observe(domain: string): Promise<Observation> {
  const base = `https://${domain}`;
  const out: Observation = { domain, sitemapUrls: null, feed: null, tech: [], topPages: [] };
  // sitemap (follow one level of index, cap 5 children)
  const locs: string[] = [];
  const sm = await get(`${base}/sitemap.xml`);
  if (sm) {
    const children = [...sm.text.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()).slice(0, 5);
    if (children.length) { for (const c of children) { const s = await get(c); if (s) locs.push(...[...s.text.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim())); } }
    else locs.push(...[...sm.text.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()));
    out.sitemapUrls = locs.length;
  }
  // feed cadence
  for (const p of ["/feed", "/rss.xml", "/blog/feed", "/feed.xml", "/atom.xml"]) {
    const f = await get(base + p, 8_000); if (!f || !/<(rss|feed|rdf)/i.test(f.text.slice(0, 500))) continue;
    const dates = [...f.text.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)<\//gi)].map((m) => new Date(m[1].trim())).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => b.getTime() - a.getTime());
    const items = (f.text.match(/<(item|entry)\b/gi) ?? []).length;
    const span = dates.length > 1 ? (dates[0].getTime() - dates[dates.length - 1].getTime()) / (30 * 86_400_000) : null;
    out.feed = { items, latest: dates[0]?.toISOString().slice(0, 10) ?? null, perMonth: span && span > 0 ? Math.round((dates.length / span) * 10) / 10 : null };
    break;
  }
  // home: tech + top pages (home + first 4 sitemap URLs)
  const home = await get(`${base}/`);
  if (home) {
    const h = home.text, hd = home.headers;
    const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(h)?.[1]; if (gen) out.tech.push(gen);
    if (/wp-content\//i.test(h)) out.tech.push("WordPress"); if (/cdn\.shopify\.com/i.test(h)) out.tech.push("Shopify"); if (/_next\//.test(h)) out.tech.push("Next.js"); if (/webflow/i.test(h)) out.tech.push("Webflow"); if (/googletagmanager\.com/i.test(h)) out.tech.push("Google Tag Manager"); if (/hs-scripts\.com/i.test(h)) out.tech.push("HubSpot"); if (/connect\.facebook\.net/i.test(h)) out.tech.push("Meta Pixel");
    if (hd.get("cf-ray")) out.tech.push("Cloudflare"); if (hd.get("x-vercel-id")) out.tech.push("Vercel");
    out.tech = [...new Set(out.tech)];
  }
  const pages = [`${base}/`, ...locs.filter((l) => l !== `${base}/`).slice(0, 4)];
  for (const u of pages) { const p = u === `${base}/` ? home : await get(u, 8_000); if (!p) continue; out.topPages.push({ url: u, title: /<title[^>]*>([^<]*)<\/title>/i.exec(p.text)?.[1]?.trim().slice(0, 200) ?? null, description: /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(p.text)?.[1]?.trim().slice(0, 300) ?? null }); }
  return out;
}

export function observationText(o: Observation): string {
  const lines = [
    `Observed ${new Date().toISOString().slice(0, 10)} — first-party signals only; nothing is estimated.`,
    `Sitemap URLs: ${o.sitemapUrls === null ? "no sitemap found" : o.sitemapUrls}`,
    `Blog feed: ${o.feed ? `${o.feed.items} recent items, latest ${o.feed.latest ?? "unknown"}, about ${o.feed.perMonth ?? "?"} per month` : "no feed found"}`,
    `Tech signals: ${o.tech.length ? o.tech.join(", ") : "none detected"}`,
    ...o.topPages.map((p) => `• ${p.title ?? "(no title)"} — ${p.url}${p.description ? `\n  ${p.description}` : ""}`),
  ];
  return lines.join("\n").slice(0, 6000);
}

export async function observeCompetitor(id: string, now = new Date()) {
  const c = await db.cosCompetitor.findUnique({ where: { id } });
  if (!c) return null;
  const o = await observe(c.domain);
  const source = await db.cosSource.create({ data: { orgId: c.orgId, kind: "url", title: `Competitor observation: ${c.domain} — ${now.toISOString().slice(0, 10)}`, url: `https://${c.domain}/`, excerpt: observationText(o) } });
  await db.cosCompetitor.update({ where: { id }, data: { lastRunAt: now } });
  return source;
}

/** Weekly: every competitor not observed in the last 7 days. */
export async function tickCompetitors(now = new Date()) {
  const due = await db.cosCompetitor.findMany({ where: { OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }] }, take: 50 });
  for (const c of due) await enqueueJob({ type: COMPETITOR_JOB, payload: { id: c.id }, idempotencyKey: `${COMPETITOR_JOB}:${c.id}:${now.toISOString().slice(0, 10)}`, maxAttempts: 1 });
  return due.length;
}

export async function observations(orgId: string, take = 20) {
  return db.cosSource.findMany({ where: { orgId, archivedAt: null, title: { startsWith: "Competitor observation:" } }, orderBy: { createdAt: "desc" }, take });
}

registerJobHandler(COMPETITOR_JOB, async (p) => { await observeCompetitor((p as { id: string }).id); });
