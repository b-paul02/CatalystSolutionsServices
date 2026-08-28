// Pipeline stages: system defaults + per-org custom stages.
import { db } from "@/lib/audit/db";

export const DEFAULT_STAGES = [
  { key: "new", label: "New", order: 0, isWon: false, isLost: false },
  { key: "assigned", label: "Assigned", order: 1, isWon: false, isLost: false },
  { key: "contacted", label: "Contacted", order: 2, isWon: false, isLost: false },
  { key: "engaged", label: "Engaged", order: 3, isWon: false, isLost: false },
  { key: "qualified", label: "Qualified", order: 4, isWon: false, isLost: false },
  { key: "converted", label: "Converted", order: 5, isWon: true, isLost: false },
  { key: "lost", label: "Lost", order: 6, isWon: false, isLost: true },
];

export type Stage = { key: string; label: string; order: number; isWon: boolean; isLost: boolean };

/** Org stages, seeding the defaults on first read. */
export async function getStages(orgId: string): Promise<Stage[]> {
  const existing = await db.losPipelineStage.findMany({ where: { orgId }, orderBy: { order: "asc" } });
  if (existing.length > 0) return existing;
  await db.losPipelineStage.createMany({ data: DEFAULT_STAGES.map((s) => ({ ...s, orgId })) });
  return getStages(orgId);
}

export async function isValidStage(orgId: string, key: string): Promise<boolean> {
  return (await getStages(orgId)).some((s) => s.key === key);
}
