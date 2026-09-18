// What a workspace may see and use: the union of its ACTIVE contracts plus the
// always-on core modules (blueprint §1.2 — show only subscribed modules).
import { db } from "@/lib/audit/db";
import { CORE_MODULES, type ModuleKey } from "./catalog";

const list = (s: string): string[] => {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};

// Orgs that signed up to LeadOS before the OS existed have no CosWorkspace row —
// they keep exactly what they had (CRM + lead supply + reports), nothing hidden.
const LEGACY_MODULES: ModuleKey[] = [...CORE_MODULES, "crm", "lead_supply", "intelligence"];

export type Entitlements = {
  kind: "legacy" | "prospect" | "client";
  modules: Set<ModuleKey>;
  services: Set<string>;
  killSwitch: boolean;
  demo: boolean; // demo workspaces flag every row they create
  allowances: { deliverablesPerMonth: number; reviewCycles: number; aiCredits: number; responseHours: number };
  contractForService: (slug: string | null) => string | null;
};

export async function entitlements(orgId: string): Promise<Entitlements> {
  const [ws, contracts] = await Promise.all([
    db.cosWorkspace.findUnique({ where: { orgId } }),
    db.cosContract.findMany({ where: { orgId, status: "active" }, orderBy: { signedAt: "asc" } }),
  ]);
  const modules = new Set<ModuleKey>(ws ? CORE_MODULES : LEGACY_MODULES);
  const services = new Set<string>();
  const allowances = { deliverablesPerMonth: 0, reviewCycles: 0, aiCredits: 0, responseHours: 0 };
  for (const c of contracts) {
    for (const mod of list(c.modules)) modules.add(mod as ModuleKey);
    for (const s of list(c.services)) services.add(s);
    try {
      const a = JSON.parse(c.allowances) as Partial<typeof allowances>;
      allowances.deliverablesPerMonth += a.deliverablesPerMonth ?? 0;
      allowances.aiCredits += a.aiCredits ?? 0;
      allowances.reviewCycles = Math.max(allowances.reviewCycles, a.reviewCycles ?? 0);
      allowances.responseHours = allowances.responseHours === 0 ? a.responseHours ?? 0 : Math.min(allowances.responseHours, a.responseHours ?? allowances.responseHours);
    } catch { /* malformed allowances grant nothing */ }
  }
  return {
    kind: !ws ? "legacy" : contracts.length > 0 || ws.kind === "client" ? "client" : "prospect",
    modules,
    services,
    killSwitch: ws?.killSwitch ?? false,
    demo: ws?.demo ?? false,
    allowances,
    contractForService: (slug) => (slug ? contracts.find((c) => list(c.services).includes(slug))?.id ?? null : contracts[0]?.id ?? null),
  };
}

/** Deliverables accepted this calendar month vs the contracted allowance. */
export async function monthlyUsage(orgId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [delivered, aiMicros] = await Promise.all([
    db.cosWorkItem.count({ where: { orgId, state: { in: ["delivered", "verified", "closed"] }, updatedAt: { gte: start }, type: { in: ["task", "content", "milestone"] } } }),
    db.cosWorkEvent.aggregate({ where: { orgId, createdAt: { gte: start } }, _sum: { aiCostMicros: true } }),
  ]);
  return { delivered, aiCostMicros: aiMicros._sum.aiCostMicros ?? 0 };
}
