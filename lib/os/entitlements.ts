// What a workspace may see and use: the union of its ACTIVE contracts plus the
// always-on core modules (blueprint §1.2 — show only subscribed modules).
import { db } from "@/lib/audit/db";
import { CORE_MODULES, type ModuleKey } from "./catalog";

const list = (s: string): string[] => {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};

// Orgs that signed up to LeadOS before the OS existed have no CosWorkspace row —
// they keep exactly what they had (CRM + lead supply + reports), nothing hidden.
const LEGACY_MODULES: ModuleKey[] = ["overview", "audit", "approvals", "crm", "lead_supply", "intelligence"];

export type Entitlements = {
  kind: "legacy" | "prospect" | "client";
  modules: Set<ModuleKey>;
  services: Set<string>;
  killSwitch: boolean;
  demo: boolean; // demo workspaces flag every row they create
  // active | read_only (handover: see and export everything, change nothing) | revoked
  accessMode: "active" | "read_only" | "revoked";
  timezone: string;
  currency: string; // reporting currency — workspace setting, else the org's billing market
  defaultEngagementId: string | null; // the single open engagement, when there is exactly one
  allowances: { deliverablesPerMonth: number; reviewCycles: number; aiCredits: number; responseHours: number };
  /** TOOL entitlement: AI Studio tool keys from ACTIVE contracts. Independent of services, credits and role. */
  aiTools: Set<string>;
  contractForService: (slug: string | null) => string | null;
};

export async function entitlements(orgId: string): Promise<Entitlements> {
  const [ws, all, org, open] = await Promise.all([
    db.cosWorkspace.findUnique({ where: { orgId } }),
    db.cosContract.findMany({ where: { orgId, status: { in: ["active", "ended"] } }, orderBy: { signedAt: "asc" } }),
    db.losOrg.findUnique({ where: { id: orgId }, select: { market: true } }),
    db.cosEngagement.findMany({ where: { orgId, stage: { in: ["prospect", "discovery", "proposal", "accepted", "onboarding", "active", "review"] } }, select: { id: true }, take: 2 }),
  ]);
  const accessMode = (ws?.accessMode === "read_only" || ws?.accessMode === "revoked" ? ws.accessMode : "active") as Entitlements["accessMode"];
  const contracts = all.filter((c) => c.status === "active");
  // Handover: ended scope stays VISIBLE (history, exports) but grants no services — nothing new can be made.
  const visible = accessMode === "read_only" ? all : contracts;
  const modules = new Set<ModuleKey>(ws ? CORE_MODULES : LEGACY_MODULES);
  if (accessMode === "revoked") modules.clear();
  const services = new Set<string>();
  const aiTools = new Set<string>();
  const allowances = { deliverablesPerMonth: 0, reviewCycles: 0, aiCredits: 0, responseHours: 0 };
  if (accessMode !== "revoked") for (const c of visible) for (const mod of list(c.modules)) modules.add(mod as ModuleKey);
  for (const c of contracts) {
    for (const s of list(c.services)) services.add(s);
    for (const t of list(c.aiTools)) aiTools.add(t);
    try {
      const a = JSON.parse(c.allowances) as Partial<typeof allowances>;
      allowances.deliverablesPerMonth += a.deliverablesPerMonth ?? 0;
      allowances.aiCredits += a.aiCredits ?? 0;
      allowances.reviewCycles = Math.max(allowances.reviewCycles, a.reviewCycles ?? 0);
      allowances.responseHours = allowances.responseHours === 0 ? a.responseHours ?? 0 : Math.min(allowances.responseHours, a.responseHours ?? allowances.responseHours);
    } catch { /* malformed allowances grant nothing */ }
  }
  if (contracts.length > 0) modules.add("automations"); // paid customers build workflows
  return {
    kind: !ws ? "legacy" : contracts.length > 0 || ws.kind === "client" ? "client" : "prospect",
    modules,
    services,
    killSwitch: ws?.killSwitch ?? false,
    demo: ws?.demo ?? false,
    accessMode,
    timezone: ws?.timezone ?? "UTC",
    currency: ws?.currency ?? (org?.market === "US" ? "USD" : "INR"),
    defaultEngagementId: open.length === 1 ? open[0].id : null,
    allowances,
    aiTools: accessMode === "active" ? aiTools : new Set<string>(),
    contractForService: (slug) => (slug ? contracts.find((c) => list(c.services).includes(slug))?.id ?? null : contracts[0]?.id ?? null),
  };
}

/**
 * Delivered this calendar month (workspace zone) vs the contracted allowance. Counts deliveredAt —
 * the moment an item was FIRST delivered — so later edits never re-date or double count it.
 * AI cost is null when no price is configured: unknown is not zero.
 */
export async function monthlyUsage(orgId: string, now = new Date(), timezone = "UTC") {
  const { periodBounds } = await import("./time");
  const { start, end } = periodBounds("month", timezone, now);
  const [delivered, ai] = await Promise.all([
    db.cosWorkItem.count({ where: { orgId, deliveredAt: { gte: start, lt: end }, type: { in: ["task", "content", "milestone"] } } }),
    db.cosAiUsage.aggregate({ where: { orgId, createdAt: { gte: start, lt: end } }, _sum: { costMicros: true }, _count: { _all: true, costMicros: true } }),
  ]);
  return {
    delivered,
    aiCalls: ai._count._all,
    // every call priced → a real total; any unpriced call → unknown
    aiCostMicros: ai._count._all > 0 && ai._count.costMicros === ai._count._all ? ai._sum.costMicros ?? 0 : null,
  };
}
