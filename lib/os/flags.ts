// WP-06 · feature flags. An org row overrides the global row; no row = ON (nothing breaks when a flag was never set).
// Read by the action gate right before an external action. The kill switch is separate and always wins.
import { db } from "@/lib/audit/db";
import { gateAction, type ActionGate } from "./workflow";

export const FEATURE_KEYS = ["publish", "outreach", "booking", "chat", "newsletter", "site_audit", "content_produce", "ads_sync", "enrichment"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const isFeatureKey = (k: string): k is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(k);

export async function flagOn(key: FeatureKey, orgId: string): Promise<boolean> {
  const rows = await db.cosFeatureFlag.findMany({ where: { key, orgId: { in: [orgId, ""] } } });
  const org = rows.find((r) => r.orgId === orgId), global = rows.find((r) => r.orgId === "");
  return (org ?? global)?.on ?? true;
}

/** gateAction + the feature flag, in one call, for every external action (publish, send, launch). */
export async function gateWithFlags(opts: Parameters<typeof gateAction>[0] & { feature: FeatureKey; orgId: string }): Promise<ActionGate> {
  const { feature, orgId, ...rest } = opts;
  return gateAction({ ...rest, featureEnabled: await flagOn(feature, orgId) });
}

export async function setFlag(key: FeatureKey, orgId: string, on: boolean, updatedBy: string, note?: string) {
  return db.cosFeatureFlag.upsert({ where: { key_orgId: { key, orgId } }, update: { on, updatedBy, note: note?.slice(0, 300) ?? null }, create: { key, orgId, on, updatedBy, note: note?.slice(0, 300) ?? null } });
}
