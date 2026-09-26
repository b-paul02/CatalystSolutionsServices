// Pure pillar vocabulary (no DB) — safe for client components. See lib/os/pillars.ts for the actions.
export const PILLARS5 = ["market_intelligence", "client_acquisition", "digital_visibility", "digital_presence", "business_operations"] as const;
export type Pillar = (typeof PILLARS5)[number];
export const isPillar = (p: string): p is Pillar => (PILLARS5 as readonly string[]).includes(p);

export const PILLAR_LABEL: Record<Pillar, string> = {
  market_intelligence: "Market intelligence",
  client_acquisition: "Client acquisition",
  digital_visibility: "Digital visibility",
  digital_presence: "Digital presence",
  business_operations: "Business operations",
};

/** Audit / scorecard categories (lib/os/audit.ts PILLARS) → growth pillar. */
export const AUDIT_CATEGORY_PILLAR: Record<string, Pillar> = {
  visibility: "digital_visibility", content: "digital_visibility", ai: "digital_visibility",
  conversion: "client_acquisition", analytics: "business_operations", speed: "digital_presence", narrative: "market_intelligence",
};

/** What the button does. Exactly one of goal / work. Validated server-side: the browser cannot invent a pillar or a metric. */
export type GrowthStep = {
  pillar: Pillar;
  /** metric key on Results (METRICS or scorecard.* / audit.* / booking.* …) */
  metric: string;
  metricLabel: string;
  /** what the client sees as the one next action */
  action: { label: string } & ({ kind: "goal"; title: string; unit?: string; target?: number; horizon?: string } | { kind: "work_item"; title: string; type?: "task" | "content" | "experiment"; serviceSlug?: string | null; payload?: Record<string, unknown>; workItemId?: string; to?: string });
};

