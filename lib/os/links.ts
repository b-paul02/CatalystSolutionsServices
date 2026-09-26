// WP-05 · short links (/l/:code). One CosShortLink per published variant, stable code, redirecting to the tagged
// destination; lead-capture tracking links (LosTrackingLink) resolve through the same route. Clicks are rows without
// IP or user-agent string — referrer host + a coarse UA class only. Attribution labels are unchanged: a click is a
// click, never a person or a cause.
import { db } from "@/lib/audit/db";
import { randomToken } from "@/lib/leados/crypto";
import { APP_URL } from "@/lib/leados/email";

export const SITE_ORIGIN = APP_URL.replace(/\/app$/, "");
export const shortUrl = (code: string) => `${SITE_ORIGIN}/l/${code}`;

export const uaClass = (ua: string | null): "bot" | "mobile" | "desktop" | "unknown" =>
  !ua ? "unknown" : /bot|crawl|spider|slurp|facebookexternalhit|preview|curl|wget|python-requests/i.test(ua) ? "bot" : /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";

export const refDomain = (referer: string | null): string | null => { if (!referer) return null; try { return new URL(referer).hostname.slice(0, 120); } catch { return null; } };

/** The short link for a variant (idempotent). `url` is the fully tagged destination. */
export async function shortLinkForVariant(orgId: string, variantId: string, url: string, label?: string) {
  const existing = await db.cosShortLink.findUnique({ where: { variantId } });
  if (existing) { if (existing.url !== url) await db.cosShortLink.update({ where: { id: existing.id }, data: { url } }); return { ...existing, url }; }
  for (let i = 0; ; i++) {
    try { return await db.cosShortLink.create({ data: { orgId, variantId, url, code: randomToken(5), label: label?.slice(0, 120) ?? null } }); }
    catch (e) { if ((e as { code?: string }).code !== "P2002" || i > 3) throw e; const again = await db.cosShortLink.findUnique({ where: { variantId } }); if (again) return again; }
  }
}

export type Resolved = { linkId: string; to: string } | null;

/** Code → destination. Content short links first, then lead-capture tracking links (hosted page with ?t=code). */
export async function resolveShortCode(code: string): Promise<Resolved> {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return null;
  const s = await db.cosShortLink.findUnique({ where: { code } });
  if (s) return { linkId: s.id, to: s.url };
  const t = await db.losTrackingLink.findUnique({ where: { code }, include: { campaign: { select: { publicId: true, status: true } } } });
  if (!t || t.campaign.status !== "active") return null;
  return { linkId: t.id, to: `${APP_URL}/c/${t.campaign.publicId}?t=${encodeURIComponent(t.code)}` };
}

export async function recordClick(linkId: string, headers: { referer: string | null; userAgent: string | null }) {
  await db.losLinkClick.create({ data: { linkId, refDomain: refDomain(headers.referer), uaClass: uaClass(headers.userAgent) } });
}

/** Human clicks per link id inside a range (bots excluded). Missing = 0 clicks here, because a click table is complete. */
export async function clicksFor(linkIds: string[], range?: { start: Date; end: Date }): Promise<Map<string, number>> {
  if (linkIds.length === 0) return new Map();
  const rows = await db.losLinkClick.groupBy({ by: ["linkId"], where: { linkId: { in: linkIds }, uaClass: { not: "bot" }, ...(range ? { at: { gte: range.start, lt: range.end } } : {}) }, _count: true });
  return new Map(rows.map((r) => [r.linkId, r._count]));
}

/** Clicks per variant for Results (content view): variantId → clicks in range. */
export async function clicksByVariant(orgId: string, variantIds: string[], range: { start: Date; end: Date }): Promise<Map<string, number>> {
  const links = await db.cosShortLink.findMany({ where: { orgId, variantId: { in: variantIds } }, select: { id: true, variantId: true } });
  const counts = await clicksFor(links.map((l) => l.id), range);
  return new Map(links.map((l) => [l.variantId!, counts.get(l.id) ?? 0]));
}
