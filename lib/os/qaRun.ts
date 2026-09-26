// WP-41 · staging QA evidence: job `os.qa_run` for a work item in internal_qa. PSI mobile + desktop, HTML
// accessibility heuristics, broken links, mixed content. The report lands on the work item payload (`qa`) and as a
// private JSON asset; a failing run blocks internal_qa → client_review. "Automated heuristics, not a full audit."
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "@/lib/leados/jobs";
import { can } from "@/lib/leados/rbac";
import { safeUrl } from "./automation/definition";
import { uploadAsset } from "./assets";
import { notify } from "./notify";
import { assertWritable, getWorkItem, WorkError, type WorkActor } from "./work";

export const QA_JOB = "os.qa_run";
export const QA_LABEL = "Automated heuristics, not a full accessibility audit.";
export type QaIssue = { check: string; severity: "error" | "warning"; detail: string };
export type QaReport = { url: string; ranAt: string; passed: boolean; issues: QaIssue[]; psi: { mobile: number | null; desktop: number | null }; linksChecked: number; assetId?: string | null; label: string };

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.[2] ?? undefined;

/** Pure: heuristics over one HTML document. */
export function htmlHeuristics(html: string, pageUrl: string): QaIssue[] {
  const issues: QaIssue[] = [];
  const https = pageUrl.startsWith("https://");
  if (!/<html[^>]*\slang=/i.test(html)) issues.push({ check: "lang", severity: "error", detail: "<html> has no lang attribute." });
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push({ check: "viewport", severity: "error", detail: "No viewport meta tag (mobile layout)." });
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => attr(t, "alt") === undefined && !/\srole=["']presentation["']/i.test(t)).length;
  if (noAlt) issues.push({ check: "alt_text", severity: "error", detail: `${noAlt} image(s) without alt text.` });
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  if (!headings.includes(1)) issues.push({ check: "heading_order", severity: "warning", detail: "No <h1>." });
  for (let i = 1; i < headings.length; i++) if (headings[i] > headings[i - 1] + 1) { issues.push({ check: "heading_order", severity: "warning", detail: `Heading jumps from h${headings[i - 1]} to h${headings[i]}.` }); break; }
  const inputs = (html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? []).filter((t) => !/type=["'](hidden|submit|button|reset)["']/i.test(t));
  const unlabelled = inputs.filter((t) => { const id = attr(t, "id"); return !attr(t, "aria-label") && !attr(t, "aria-labelledby") && !attr(t, "title") && !(id && new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html)) && !/placeholder=/i.test(t); }).length;
  if (unlabelled) issues.push({ check: "form_labels", severity: "error", detail: `${unlabelled} form field(s) without a label.` });
  const vague = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1]).toLowerCase()).filter((t) => ["click here", "here", "read more", "more", "link"].includes(t)).length;
  if (vague) issues.push({ check: "link_text", severity: "warning", detail: `${vague} link(s) with vague text ("click here", "more").` });
  if (https) { const mixed = (html.match(/(src|href)=["']http:\/\//gi) ?? []).length; if (mixed) issues.push({ check: "mixed_content", severity: "error", detail: `${mixed} http:// resource(s) on an https page.` }); }
  // contrast: only literal hex pairs in inline style "color:#xxx;background(-color):#yyy" — computable without a browser
  for (const m of html.matchAll(/style=["'][^"']*color:\s*#([0-9a-f]{3,6})[^"']*background(?:-color)?:\s*#([0-9a-f]{3,6})/gi)) {
    if (contrast(m[1], m[2]) < 4.5) { issues.push({ check: "contrast", severity: "warning", detail: `Inline colours #${m[1]} on #${m[2]} are below 4.5:1.` }); break; }
  }
  return issues;
}
function lum(hex: string) { const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex; const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string) { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setQaFetchForTests = (f: typeof fetch) => { fetchImpl = f; };

async function psiScore(url: string, strategy: "mobile" | "desktop"): Promise<number | null> {
  if (!process.env.PAGESPEED_API_KEY) return null;
  try {
    const r = await fetchImpl(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${new URLSearchParams({ url, strategy, category: "performance", key: process.env.PAGESPEED_API_KEY })}`, { signal: AbortSignal.timeout(50_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const s = j.lighthouseResult?.categories?.performance?.score; return typeof s === "number" ? Math.round(s * 100) : null;
  } catch { return null; }
}

export async function runQa(workItemId: string): Promise<QaReport> {
  const item = await db.cosWorkItem.findUniqueOrThrow({ where: { id: workItemId } });
  const payload = (item.payload ? JSON.parse(item.payload) : {}) as { stagingUrl?: string; qa?: QaReport };
  const url = safeUrl(payload.stagingUrl ?? "").toString();
  const issues: QaIssue[] = [];
  let html = "";
  try { const r = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "CatalystGrowthOS-QA/1.0" } }); if (!r.ok) issues.push({ check: "http", severity: "error", detail: `Page answered HTTP ${r.status}.` }); html = await r.text(); } catch { issues.push({ check: "http", severity: "error", detail: "Page did not answer within 15 s." }); }
  issues.push(...htmlHeuristics(html, url));
  // broken links: first 25 same-origin links, HEAD
  const origin = new URL(url).origin;
  const links = [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"'#?]+)/gi)].map((m) => { try { return new URL(m[1], url).toString(); } catch { return null; } }).filter((u): u is string => !!u && u.startsWith(origin)))].slice(0, 25);
  let broken = 0;
  for (const l of links) { try { const r = await fetchImpl(l, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8_000) }); if (r.status >= 400) broken++; } catch { broken++; } }
  if (broken) issues.push({ check: "broken_links", severity: "error", detail: `${broken} of ${links.length} internal link(s) are broken.` });
  const [mobile, desktop] = await Promise.all([psiScore(url, "mobile"), psiScore(url, "desktop")]);
  if (mobile !== null && mobile < 50) issues.push({ check: "psi_mobile", severity: "warning", detail: `PageSpeed mobile performance ${mobile}/100.` });
  const report: QaReport = { url, ranAt: new Date().toISOString(), passed: !issues.some((i) => i.severity === "error"), issues, psi: { mobile, desktop }, linksChecked: links.length, label: QA_LABEL };
  const asset = await uploadAsset({ orgId: item.orgId, userId: "system", role: "cgo_lead" }, { name: `qa-${workItemId}-${report.ranAt.slice(0, 10)}.txt`, mime: "text/plain", bytes: Buffer.from(JSON.stringify(report, null, 2)), category: "production", clientVisible: false, workItemId, note: QA_LABEL }).catch(() => null);
  report.assetId = asset?.id ?? null;
  await db.cosWorkItem.update({ where: { id: workItemId }, data: { payload: JSON.stringify({ ...payload, qa: report }) } });
  await db.cosWorkEvent.create({ data: { orgId: item.orgId, workItemId, actorType: "system", kind: "comment", internal: true, data: JSON.stringify({ text: `Automated QA ${report.passed ? "passed" : "FAILED"}: ${issues.length} issue(s). ${QA_LABEL}` }) } });
  if (!report.passed) await notify({ orgId: item.orgId, userId: item.assigneeId ?? item.ownerId, audience: "staff", kind: "blocked", title: `QA failed: ${item.title}`, body: issues.filter((i) => i.severity === "error").map((i) => i.detail).join(" ").slice(0, 300), href: `/app/work/${workItemId}`, dedupeKey: `qa:${workItemId}:${report.ranAt}` });
  return report;
}

export async function startQa(actor: WorkActor, workItemId: string) {
  if (!can(actor.role, "work.review") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const item = await getWorkItem(actor, workItemId);
  const payload = (item.payload ? JSON.parse(item.payload) : {}) as { stagingUrl?: string };
  if (!payload.stagingUrl) throw new WorkError("Add the staging URL to the work item first.");
  safeUrl(payload.stagingUrl);
  await enqueueJob({ type: QA_JOB, payload: { workItemId }, idempotencyKey: `${QA_JOB}:${workItemId}:${Date.now()}`, maxAttempts: 1 });
}

registerJobHandler(QA_JOB, async (p) => { await runQa((p as { workItemId: string }).workItemId); });
