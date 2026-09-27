// WP-50 invoices export (CSV / JSON per month, GST fields blank when unknown) · WP-51 time-log CSV and the signed
// signature receipt (content hash, signer, time, IP class; HMAC over the receipt with LEADOS_SECRET).
import { createHash, createHmac } from "node:crypto";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { WorkError, type WorkActor } from "./work";

export const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s; };
const money = (minor: bigint | null | undefined) => (minor === null || minor === undefined ? "" : (Number(minor) / 100).toFixed(2));
const monthRange = (month: string) => { const start = new Date(`${month}-01T00:00:00.000Z`); return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) }; };

export async function invoicesExport(actor: WorkActor, month: string, format: "csv" | "json") {
  if (!can(actor.role, "org.billing") && !can(actor.role, "org.export") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new WorkError("Month must be YYYY-MM.");
  const { start, end } = monthRange(month);
  const [org, rows] = await Promise.all([db.losOrg.findUnique({ where: { id: actor.orgId }, select: { name: true } }), db.cosCommercialRecord.findMany({ where: { orgId: actor.orgId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "asc" }, include: { engagement: { select: { name: true } } } })]);
  const items = rows.map((r) => ({ id: r.id, date: r.createdAt.toISOString().slice(0, 10), engagement: r.engagement.name, kind: r.kind, description: r.description, invoiceRef: r.invoiceRef ?? "", status: r.status, currency: r.currency, amount: money(r.amountMinor), taxRatePercent: r.taxRateBp === null ? "" : (r.taxRateBp / 100).toFixed(2), tax: money(r.taxMinor), total: r.taxMinor === null ? "" : money(r.amountMinor + r.taxMinor), hsnSac: r.hsnSac ?? "", paid: money(r.paidMinor), paidBasis: r.paidBasis ?? "", dueAt: r.dueAt?.toISOString().slice(0, 10) ?? "", customer: org?.name ?? "" }));
  if (format === "json") return { body: JSON.stringify({ month, note: "GST fields are blank when they were not recorded. Amounts are per currency; never add across currencies.", items }, null, 2), type: "application/json", name: `invoices-${month}.json` };
  const cols = ["id", "date", "engagement", "kind", "description", "invoiceRef", "status", "currency", "amount", "taxRatePercent", "tax", "total", "hsnSac", "paid", "paidBasis", "dueAt", "customer"] as const;
  return { body: [cols.join(","), ...items.map((i) => cols.map((c) => csvCell(i[c])).join(","))].join("\n"), type: "text/csv", name: `invoices-${month}.csv` };
}

/** Time logs are private staffing economics (§11.3): staff with work.manage only. */
export async function timeLogExport(actor: WorkActor, month: string) {
  if (!can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new WorkError("Month must be YYYY-MM.");
  const { start, end } = monthRange(month);
  const rows = await db.cosWorkEvent.findMany({ where: { orgId: actor.orgId, kind: "time", createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "asc" }, include: { workItem: { select: { title: true, serviceSlug: true } } } });
  const users = await db.losUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((a): a is string => !!a))] } }, select: { id: true, name: true, email: true } });
  const who = (id: string | null) => { const u = users.find((x) => x.id === id); return u ? u.name ?? u.email : ""; };
  const cols = ["date", "workItem", "service", "member", "minutes", "note"];
  const lines = rows.map((r) => [r.createdAt.toISOString().slice(0, 16).replace("T", " "), r.workItem?.title ?? "", r.workItem?.serviceSlug ?? "", who(r.actorId), r.minutes ?? 0, (() => { try { return (JSON.parse(r.data ?? "{}") as { text?: string }).text ?? ""; } catch { return ""; } })()].map(csvCell).join(","));
  return { body: [cols.join(","), ...lines].join("\n"), type: "text/csv", name: `time-${month}.csv` };
}

/** Canonical bytes the client signs: services, modules, scope document, pricing, exclusions. */
export function contractHash(c: { services: string; modules: string; scopeDoc: string | null; pricing: string | null; exclusions: string | null; aiTools: string }) {
  return createHash("sha256").update(JSON.stringify({ services: c.services, modules: c.modules, scopeDoc: c.scopeDoc, pricing: c.pricing, exclusions: c.exclusions, aiTools: c.aiTools })).digest("hex");
}
export function ipClass(ip: string | null): "private" | "public" | "unknown" {
  if (!ip) return "unknown";
  const h = ip.trim().replace(/^\[|\]$/g, "");
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(h) ? "private" : /^[\d.]+$|^[0-9a-f:]+$/i.test(h) ? "public" : "unknown";
}

export async function signatureReceipt(actor: WorkActor, contractId: string) {
  if (!can(actor.role, "contract.sign") && !can(actor.role, "org.manage") && !can(actor.role, "work.manage")) throw new WorkError("Forbidden.");
  const c = await db.cosContract.findFirst({ where: { id: contractId, orgId: actor.orgId } });
  if (!c || !c.signedAt || !c.signedById) throw new WorkError("This contract has not been signed.");
  const [org, signer] = await Promise.all([db.losOrg.findUnique({ where: { id: c.orgId }, select: { name: true } }), db.losUser.findUnique({ where: { id: c.signedById }, select: { name: true, email: true } })]);
  const hash = c.signedHash ?? contractHash(c);
  const facts = { contractId: c.id, workspace: org?.name ?? c.orgId, signer: signer?.name ?? signer?.email ?? c.signedById, signerEmail: signer?.email ?? "", signedAt: c.signedAt.toISOString(), ipClass: c.signedIpClass ?? "unknown", contentHash: hash, services: JSON.parse(c.services) as string[], hashSource: c.signedHash ? "recorded at signing" : "recomputed from the stored scope" };
  const secret = process.env.LEADOS_SECRET; if (!secret) throw new WorkError("LEADOS_SECRET is required.");
  const seal = createHmac("sha256", secret).update(JSON.stringify(facts)).digest("hex");
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[ch]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signature receipt — ${esc(facts.workspace)}</title><style>body{font:14px/1.5 system-ui;margin:40px auto;max-width:720px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%}td{padding:6px 8px;border-top:1px solid #ddd;vertical-align:top}td:first-child{color:#555;width:200px}code{font-size:12px;word-break:break-all}@media print{body{margin:0}}</style></head><body>
<h1>Signature receipt</h1><p>Proof that the scope below was accepted by the client's signature in CatalystGrowthOS. The content hash identifies exactly what was signed; the seal lets Catalyst verify this receipt was issued by the platform.</p>
<table>${(["workspace", "signer", "signerEmail", "signedAt", "ipClass", "contractId"] as const).map((k) => `<tr><td>${k === "ipClass" ? "IP class" : k === "signedAt" ? "Signed at (UTC)" : k === "signerEmail" ? "Signer email" : k}</td><td>${esc(String(facts[k]))}</td></tr>`).join("")}<tr><td>Services</td><td>${esc(facts.services.join(", "))}</td></tr><tr><td>Content hash (sha256)</td><td><code>${facts.contentHash}</code> <small>(${facts.hashSource})</small></td></tr><tr><td>Platform seal (HMAC-SHA256)</td><td><code>${seal}</code></td></tr></table>
<p style="color:#555;font-size:12px">Generated ${new Date().toISOString()}. The raw IP address is never stored; only whether it was a public or private network.</p></body></html>`;
  return { html, facts, seal };
}
