// WP-46 · company enrichment from the company's own public homepage: <meta>, schema.org Organization, social links,
// MX provider, hosting hints. Every field carries source + fetchedAt; a person accepts fields. No personal data,
// nothing purchased, robots.txt respected. Job `leados:enrich`.
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "./jobs";
import { can } from "./rbac";
import { WorkError, type WorkActor } from "@/lib/os/work";
import { safeUrl } from "@/lib/os/automation/definition";

export const ENRICH_JOB = "leados:enrich";
export type EnrichField = { value: string; source: string; fetchedAt: string };
export type Enrichment = { url: string | null; robotsAllowed: boolean; fields: Record<string, EnrichField> };
export const ACCEPTABLE: Record<string, keyof { name: 1; industry: 1; city: 1; country: 1; techAttributes: 1 }> = { name: "name", industry: "industry", city: "city", country: "country" };

let fetchImpl: typeof fetch = (...a) => fetch(...a);
let resolveMx: (d: string) => Promise<{ exchange: string }[]> = async (d) => (await import("node:dns")).promises.resolveMx(d);
export const setEnrichDepsForTests = (f: typeof fetch, mx: typeof resolveMx) => { fetchImpl = f; resolveMx = mx; };

const meta = (html: string, name: string) => new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i").exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i").exec(html)?.[1];

/** Pure: extract company fields from a homepage + headers + MX hosts. */
export function extract(html: string, headers: Record<string, string>, mx: string[], now: Date): Record<string, EnrichField> {
  const at = now.toISOString(), f: Record<string, EnrichField> = {};
  const set = (k: string, v: string | undefined | null, source: string) => { if (v && v.trim()) f[k] = { value: v.trim().slice(0, 300), source, fetchedAt: at }; };
  set("title", /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1], "html <title>");
  set("description", meta(html, "description") ?? meta(html, "og:description"), "<meta description>");
  set("name", meta(html, "og:site_name"), "<meta og:site_name>");
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]) as Record<string, unknown> | Record<string, unknown>[];
      const nodes = (Array.isArray(j) ? j : [j]).flatMap((n) => (Array.isArray(n["@graph"]) ? (n["@graph"] as Record<string, unknown>[]) : [n]));
      const org = nodes.find((n) => /Organization|LocalBusiness|Corporation/.test(String(n["@type"])));
      if (org) {
        set("name", typeof org.name === "string" ? org.name : undefined, "schema.org Organization");
        const addr = org.address as Record<string, unknown> | undefined;
        if (addr && typeof addr === "object") { set("city", typeof addr.addressLocality === "string" ? addr.addressLocality : undefined, "schema.org address"); set("country", typeof addr.addressCountry === "string" ? addr.addressCountry : undefined, "schema.org address"); }
        set("telephone", typeof org.telephone === "string" ? org.telephone : undefined, "schema.org Organization (company line)");
        if (Array.isArray(org.sameAs)) set("social", org.sameAs.filter((s) => typeof s === "string").join(" "), "schema.org sameAs");
      }
    } catch { /* ignore malformed */ }
  }
  if (!f.social) { const socials = [...new Set([...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com)\/[^"'?#]+)/gi)].map((m) => m[1]))].slice(0, 6); if (socials.length) set("social", socials.join(" "), "homepage links"); }
  const gen = meta(html, "generator"); if (gen) set("cms", gen, "<meta generator>");
  else if (/wp-content\//i.test(html)) set("cms", "WordPress", "homepage markup"); else if (/shopify/i.test(html)) set("cms", "Shopify", "homepage markup"); else if (/__next|_next\//.test(html)) set("cms", "Next.js", "homepage markup");
  const server = headers["server"] ?? "", powered = headers["x-powered-by"] ?? "";
  if (headers["cf-ray"]) set("hosting", "Cloudflare (proxy)", "response headers"); else if (/vercel/i.test(server) || headers["x-vercel-id"]) set("hosting", "Vercel", "response headers"); else if (/cloudfront/i.test(headers["via"] ?? "") || headers["x-amz-cf-id"]) set("hosting", "AWS CloudFront", "response headers"); else if (server) set("hosting", server, "Server header");
  if (powered) set("stack", powered, "X-Powered-By header");
  if (mx.length) { const h = mx.map((m) => m.toLowerCase()); const p = h.some((m) => /google|googlemail/.test(m)) ? "Google Workspace" : h.some((m) => /outlook|microsoft/.test(m)) ? "Microsoft 365" : h.some((m) => /zoho/.test(m)) ? "Zoho Mail" : h.some((m) => /pphosted|proofpoint/.test(m)) ? "Proofpoint" : h.some((m) => /mimecast/.test(m)) ? "Mimecast" : mx[0]; set("emailProvider", p, "MX records"); }
  return f;
}

export async function runEnrichment(leadId: string, now = new Date()) {
  const lead = await db.losLead.findUnique({ where: { id: leadId }, include: { company: true } });
  if (!lead || lead.deletedAt) return null;
  const domain = lead.company?.domain ?? (lead.normalizedEmail && !/gmail|yahoo|outlook|hotmail|icloud/.test(lead.normalizedEmail) ? lead.normalizedEmail.split("@")[1] : null);
  if (!domain) { await db.losLeadEnrichment.upsert({ where: { leadId }, update: { data: JSON.stringify({ url: null, robotsAllowed: true, fields: {} }), fetchedAt: now }, create: { leadId, orgId: lead.orgId, data: JSON.stringify({ url: null, robotsAllowed: true, fields: {} }), fetchedAt: now } }); return null; }
  const url = safeUrl(`https://${domain}/`).toString();
  let allowed = true;
  try { const r = await fetchImpl(new URL("/robots.txt", url).toString(), { signal: AbortSignal.timeout(8_000) }); if (r.ok) { const txt = await r.text(); const star = /user-agent:\s*\*([\s\S]*?)(?=user-agent:|$)/i.exec(txt)?.[1] ?? ""; if (/disallow:\s*\/\s*$/im.test(star)) allowed = false; } } catch { /* no robots = allowed */ }
  let fields: Record<string, EnrichField> = {};
  if (allowed) {
    let html = "", headers: Record<string, string> = {};
    try { const r = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "CatalystGrowthOS-Enrich/1.0" } }); html = (await r.text()).slice(0, 600_000); r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; }); } catch { /* unreachable: only MX */ }
    let mx: string[] = []; try { mx = (await resolveMx(domain)).map((m) => m.exchange); } catch { mx = []; }
    fields = extract(html, headers, mx, now);
  }
  const data: Enrichment = { url, robotsAllowed: allowed, fields };
  await db.losLeadEnrichment.upsert({ where: { leadId }, update: { data: JSON.stringify(data), fetchedAt: now, acceptedAt: null }, create: { leadId, orgId: lead.orgId, data: JSON.stringify(data), fetchedAt: now } });
  return data;
}

export async function startEnrichment(actor: WorkActor, leadId: string) {
  if (!can(actor.role, "leads.edit")) throw new WorkError("Forbidden.");
  const lead = await db.losLead.findFirst({ where: { id: leadId, orgId: actor.orgId, deletedAt: null }, select: { id: true, leadType: true } });
  if (!lead) throw new WorkError("Lead not found.");
  if (lead.leadType !== "b2b") throw new WorkError("Enrichment reads a company's website — it applies to B2B leads only.");
  await enqueueJob({ type: ENRICH_JOB, payload: { leadId }, idempotencyKey: `${ENRICH_JOB}:${leadId}:${new Date().toISOString().slice(0, 13)}`, maxAttempts: 1 });
}

/** Apply accepted fields to the company (creating one when the lead has none). */
export async function acceptFields(actor: WorkActor, leadId: string, keys: string[]) {
  if (!can(actor.role, "leads.edit")) throw new WorkError("Forbidden.");
  const [lead, row] = await Promise.all([db.losLead.findFirst({ where: { id: leadId, orgId: actor.orgId, deletedAt: null }, include: { company: true } }), db.losLeadEnrichment.findUnique({ where: { leadId } })]);
  if (!lead || !row) throw new WorkError("Nothing to accept yet.");
  const data = JSON.parse(row.data) as Enrichment;
  const patch: Record<string, string | undefined> = {};
  for (const k of keys) if (ACCEPTABLE[k] && data.fields[k]) patch[ACCEPTABLE[k]] = data.fields[k].value;
  const tech = ["cms", "hosting", "stack", "emailProvider"].filter((k) => keys.includes(k) && data.fields[k]).map((k) => `${k}:${data.fields[k].value}`);
  if (Object.keys(patch).length === 0 && tech.length === 0) return 0;
  const domain = data.url ? new URL(data.url).hostname.replace(/^www\./, "") : null;
  const company = lead.company ?? (await db.losCompany.create({ data: { orgId: actor.orgId, name: patch.name ?? domain ?? "Company", domain, demo: lead.demo } }));
  const existingTech = company.techAttributes ? (JSON.parse(company.techAttributes) as string[]) : [];
  await db.losCompany.update({ where: { id: company.id }, data: { ...patch, ...(tech.length ? { techAttributes: JSON.stringify([...new Set([...existingTech, ...tech])]) } : {}) } });
  if (!lead.companyId) await db.losLead.update({ where: { id: lead.id }, data: { companyId: company.id } });
  await db.losLeadEnrichment.update({ where: { leadId }, data: { acceptedAt: new Date() } });
  return Object.keys(patch).length + tech.length;
}

registerJobHandler(ENRICH_JOB, async (p) => { await runEnrichment((p as { leadId: string }).leadId); });
