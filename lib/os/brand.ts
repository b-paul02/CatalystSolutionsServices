// WP-21 · brand-voice rules (Writer-style) evaluated in the deterministic copy checks. Reading grade is
// Flesch–Kincaid with a vowel-group syllable heuristic — labelled as a heuristic everywhere it is shown.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { assertWritable, WorkError, type WorkActor } from "./work";

export type BrandRules = { bannedPhrases: string[]; requiredPhrases: string[]; maxReadingGrade: number | null; toneNotes: string | null; color: string | null };
export const EMPTY_RULES: BrandRules = { bannedPhrases: [], requiredPhrases: [], maxReadingGrade: null, toneNotes: null, color: null };

const syllables = (word: string): number => { const w = word.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; const groups = w.replace(/e$/, "").match(/[aeiouy]+/g)?.length ?? 0; return Math.max(1, groups); };

/** Flesch–Kincaid grade level (heuristic syllables). Null for fewer than 10 words. */
export function readingGrade(text: string): number | null {
  const words = text.replace(/https?:\/\/\S+/g, "").match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (words.length < 10) return null;
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return Math.round((0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59) * 10) / 10;
}

/** Violations of the workspace rules for a piece of copy. Pure. */
export function brandProblems(text: string, rules: BrandRules): string[] {
  const out: string[] = [];
  const low = text.toLowerCase();
  for (const p of rules.bannedPhrases) if (p && low.includes(p.toLowerCase())) out.push(`Brand voice: avoid “${p}”.`);
  if (text.trim().length >= 40) for (const p of rules.requiredPhrases) if (p && !low.includes(p.toLowerCase())) out.push(`Brand voice: should mention “${p}”.`);
  if (rules.maxReadingGrade !== null) { const g = readingGrade(text); if (g !== null && g > rules.maxReadingGrade) out.push(`Brand voice: reading grade ${g} is above the target of ${rules.maxReadingGrade} (syllable heuristic — shorter sentences and words bring it down).`); }
  return out;
}

export async function getBrandRules(orgId: string): Promise<BrandRules> {
  const r = await db.cosBrandRules.findUnique({ where: { orgId } });
  return r ? { bannedPhrases: r.bannedPhrases, requiredPhrases: r.requiredPhrases, maxReadingGrade: r.maxReadingGrade, toneNotes: r.toneNotes, color: r.color } : EMPTY_RULES;
}

const list = (v: string[]) => [...new Set(v.map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 50);

export async function saveBrandRules(actor: WorkActor, input: { bannedPhrases: string[]; requiredPhrases: string[]; maxReadingGrade: number | null; toneNotes: string; color: string }) {
  if (!can(actor.role, "os.settings")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const grade = input.maxReadingGrade !== null && Number.isFinite(input.maxReadingGrade) ? Math.max(3, Math.min(18, Math.round(input.maxReadingGrade))) : null;
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color.trim()) ? input.color.trim().toLowerCase() : null;
  const data = { bannedPhrases: list(input.bannedPhrases), requiredPhrases: list(input.requiredPhrases), maxReadingGrade: grade, toneNotes: input.toneNotes.trim().slice(0, 1500) || null, color, updatedById: actor.userId };
  const r = await db.cosBrandRules.upsert({ where: { orgId: actor.orgId }, update: data, create: { orgId: actor.orgId, ...data } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "brand_rules.saved", entity: "CosBrandRules", entityId: actor.orgId, data: { banned: data.bannedPhrases.length, required: data.requiredPhrases.length, grade } });
  return r;
}
