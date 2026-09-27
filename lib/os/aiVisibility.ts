// WP-48 · AI-search visibility: tracked questions per workspace; weekly the configured LLM provider (the only one we
// have) answers each question and we record brand / competitor mentions and cited URLs as dated observations.
// Metered internally (Catalyst production AI). Counts only — never a ranking claim.
import { db } from "@/lib/audit/db";
import { callClaude } from "@/lib/audit/anthropic";
import { can } from "@/lib/leados/rbac";
import { metered } from "./ai";
import { assertWritable, WorkError, type WorkActor } from "./work";

let ask: (question: string) => Promise<string> = (q) => callClaude("You are a search assistant. Answer the user's question the way a general AI search engine would: name specific companies, products or services where relevant and cite the web addresses you rely on as plain URLs.", q, 1200);
export const setAskForTests = (f: typeof ask) => { ask = f; };

export async function addQuestion(actor: WorkActor, question: string) {
  if (!can(actor.role, "strategy.manage") && !can(actor.role, "os.settings") && !can(actor.role, "campaigns.manage")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const q = question.trim().replace(/\s+/g, " ").slice(0, 300);
  if (q.length < 8) throw new WorkError("Ask a full question, e.g. “Which dental clinic in Pune offers invisible aligners?”.");
  if ((await db.cosTrackedQuestion.count({ where: { orgId: actor.orgId } })) >= 20) throw new WorkError("Up to 20 tracked questions per workspace.");
  return db.cosTrackedQuestion.create({ data: { orgId: actor.orgId, question: q } });
}
export async function removeQuestion(actor: WorkActor, id: string) {
  if (!can(actor.role, "strategy.manage") && !can(actor.role, "os.settings") && !can(actor.role, "campaigns.manage")) throw new WorkError("Forbidden.");
  await db.cosTrackedQuestion.deleteMany({ where: { id, orgId: actor.orgId } });
}

/** Pure: mentions and citations in an answer. */
export function analyse(answer: string, brand: string, competitors: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(answer);
  const has = (name: string) => { const n = norm(name); return n.length >= 3 && a.includes(n); };
  return { brandMentioned: has(brand), competitors: competitors.filter(has), citedUrls: [...new Set((answer.match(/https?:\/\/[^\s)>\]"']+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))].slice(0, 20) };
}

async function names(orgId: string): Promise<{ brand: string; competitors: string[] }> {
  const [org, ws, comps] = await Promise.all([db.losOrg.findUnique({ where: { id: orgId }, select: { name: true } }), db.cosWorkspace.findUnique({ where: { orgId }, select: { brandProfile: true } }), db.cosCompetitor.findMany({ where: { orgId }, select: { domain: true } })]);
  const bp = ws?.brandProfile ? (JSON.parse(ws.brandProfile) as { competitors?: string[] | string }) : {};
  const fromProfile = Array.isArray(bp.competitors) ? bp.competitors : typeof bp.competitors === "string" ? bp.competitors.split(/[,\n]/) : [];
  return { brand: org?.name ?? "", competitors: [...new Set([...fromProfile.map((s) => s.trim()).filter(Boolean), ...comps.map((c) => c.domain.split(".")[0])])].slice(0, 20) };
}

/** Observe every tracked question of one org (weekly, or "Observe now"). */
export async function observeQuestions(orgId: string, now = new Date(), force = false) {
  const qs = await db.cosTrackedQuestion.findMany({ where: { orgId } });
  if (!qs.length) return 0;
  const recent = await db.cosAiVisibility.findFirst({ where: { orgId, at: { gt: new Date(now.getTime() - 6 * 86_400_000) } } });
  if (recent && !force) return 0;
  const { brand, competitors } = await names(orgId);
  let n = 0;
  for (const q of qs) {
    const answer = await metered(orgId, "ai_visibility", () => ask(q.question), { modality: "text" }).catch(() => null);
    if (answer === null) continue;
    const r = analyse(answer, brand, competitors);
    await db.cosAiVisibility.create({ data: { orgId, questionId: q.id, at: now, brandMentioned: r.brandMentioned, competitors: JSON.stringify(r.competitors), citedUrls: JSON.stringify(r.citedUrls), model: process.env.LLM_MODEL ?? null } });
    n++;
  }
  return n;
}

export async function tickAiVisibility(now = new Date()) {
  if (now.getUTCDay() !== 2) return 0; // Tuesdays
  const orgs = await db.cosTrackedQuestion.groupBy({ by: ["orgId"] });
  let n = 0;
  for (const o of orgs) n += await observeQuestions(o.orgId, now).catch(() => 0);
  return n;
}

export async function visibilitySummary(orgId: string) {
  const qs = await db.cosTrackedQuestion.findMany({ where: { orgId }, include: { observations: { orderBy: { at: "desc" }, take: 8 } }, orderBy: { createdAt: "asc" } });
  return qs.map((q) => ({ id: q.id, question: q.question, runs: q.observations.length, brandMentions: q.observations.filter((o) => o.brandMentioned).length, latest: q.observations[0] ? { at: q.observations[0].at, brandMentioned: q.observations[0].brandMentioned, competitors: JSON.parse(q.observations[0].competitors) as string[], citedUrls: JSON.parse(q.observations[0].citedUrls) as string[] } : null }));
}
