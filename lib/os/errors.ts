// WP-03 · error capture without a vendor. One row per fingerprint (normalised message + route), counted on repeat,
// staff notified once per fingerprint. Never stores request bodies, headers, cookies or personal data.
import { db } from "@/lib/audit/db";
import { notify } from "./notify";

export const ERROR_RETENTION_DAYS = 90;

/** Digits, ids and quoted values vary per request; strip them so the same bug has ONE fingerprint. */
export const normaliseMessage = (m: string): string => m.replace(/["'`][^"'`]{0,200}["'`]/g, '""').replace(/\b[0-9a-f]{8,}\b/gi, "#").replace(/\d+/g, "#").trim().slice(0, 300);
// ponytail: FNV-1a (two lanes) instead of node:crypto — instrumentation.ts is also bundled for the edge runtime, where node: modules are unavailable. Collisions only merge two error rows.
export const fingerprintOf = (message: string, route: string | null): string => {
  const s = `${normaliseMessage(message)}|${route ?? ""}`;
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).padEnd(32, "0");
};

export type ErrorContext = { route?: string | null; orgId?: string | null };

export async function captureError(err: unknown, ctx: ErrorContext = {}): Promise<{ fingerprint: string; fresh: boolean }> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500) || "Unknown error";
  const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 12).join("\n").slice(0, 2000) : null;
  const route = ctx.route?.slice(0, 200) ?? null;
  const fingerprint = fingerprintOf(message, route);
  const now = new Date();
  const existing = await db.cosErrorEvent.findUnique({ where: { fingerprint } });
  if (existing) {
    await db.cosErrorEvent.update({ where: { fingerprint }, data: { count: { increment: 1 }, lastAt: now, resolvedAt: null, orgId: existing.orgId ?? ctx.orgId ?? null } });
    return { fingerprint, fresh: false };
  }
  try { await db.cosErrorEvent.create({ data: { fingerprint, message, stack, route, orgId: ctx.orgId ?? null, firstAt: now, lastAt: now } }); }
  catch (e) { if ((e as { code?: string }).code === "P2002") { await db.cosErrorEvent.update({ where: { fingerprint }, data: { count: { increment: 1 }, lastAt: now } }); return { fingerprint, fresh: false }; } throw e; }
  if (ctx.orgId) await notify({ orgId: ctx.orgId, audience: "staff", kind: "app_error", title: `New error: ${message.slice(0, 120)}`, body: route ? `Route ${route}` : null, href: "/admin/os/errors", dedupeKey: `error:${fingerprint}` }).catch(() => undefined);
  return { fingerprint, fresh: true };
}

/** Retention sweep (tick.ts): rows not seen for ERROR_RETENTION_DAYS go. */
export async function sweepErrors(now = new Date()): Promise<number> {
  const r = await db.cosErrorEvent.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - ERROR_RETENTION_DAYS * 86_400_000) } } });
  return r.count;
}
