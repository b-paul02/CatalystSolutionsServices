// Workflow definition: pure types and rules (no DB, no IO). A workflow is a
// small directed graph — one trigger, then conditions / waits / actions — that
// passes a JSON context from step to step, Node-RED style. Everything here is
// unit-tested in tests/os/automation.test.ts. Browser-safe: the builder imports
// this file, so nothing here may touch Node APIs (hashing lives in hash.ts).

export type Node = { id: string; type: string; config: Record<string, string>; position?: { x: number; y: number } };
export type Edge = { from: string; to: string; branch?: "true" | "false" };
export type Definition = { nodes: Node[]; edges: Edge[] };

export type BlockKind = "trigger" | "condition" | "wait" | "action";
export type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "number";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  help?: string;
};
// The static half of a block — everything the builder and the simulator need.
// The executable half (run) lives in blocks.ts so this file stays pure.
export type BlockMeta = {
  type: string;
  kind: BlockKind;
  group: string;
  label: string;
  icon: string;
  fields: Field[];
  /** sends data to a service outside GrowthOS */
  external?: boolean;
  /** contacts a lead — always passes consent, suppression and caps */
  contacts?: boolean;
  /** needs a saved connection for this provider */
  provider?: string;
  /** one-line description with config values filled in */
  describe: (config: Record<string, string>) => string;
};

export const MAX_NODES = 40;
export const MAX_STEPS_PER_RUN = 60;
export const MAX_DEPTH = 3; // workflow-caused events stop cascading here

// ── templating ───────────────────────────────────────────────────────────────

const lookup = (ctx: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v !== null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), ctx);

/** Replace {{trigger.lead.firstName}} / {{steps.n2.text}}. Unknown paths render empty. */
export function render(template: string | undefined, ctx: unknown): string {
  return (template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = lookup(ctx, path);
    return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

export const OPERATORS = ["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "is_empty", "is_not_empty"] as const;

export function evaluateCondition(config: Record<string, string>, ctx: unknown): boolean {
  const left = render(config.left, ctx).trim();
  const right = render(config.right, ctx).trim();
  const a = left.toLowerCase(), b = right.toLowerCase();
  switch (config.operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "greater_than": return Number(left) > Number(right);
    case "less_than": return Number(left) < Number(right);
    case "is_empty": return left === "";
    case "is_not_empty": return left !== "";
    default: return false; // unknown operator fails closed
  }
}

/** Wait length in ms, clamped to 1 minute … 60 days. */
export function waitMs(config: Record<string, string>): number {
  const n = Math.max(1, Number(config.amount) || 1);
  const unit = config.unit === "days" ? 86_400_000 : config.unit === "hours" ? 3_600_000 : 60_000;
  return Math.min(60 * 86_400_000, n * unit);
}

// ── validation ───────────────────────────────────────────────────────────────

export function validateDefinition(def: Definition, blocks: Record<string, BlockMeta>): string[] {
  const problems: string[] = [];
  if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) return ["Workflow is empty."];
  if (def.nodes.length > MAX_NODES) problems.push(`Too many steps (max ${MAX_NODES}).`);
  const ids = new Set<string>();
  for (const n of def.nodes) {
    if (ids.has(n.id)) problems.push(`Duplicate step id ${n.id}.`);
    ids.add(n.id);
    const meta = blocks[n.type];
    if (!meta) { problems.push(`Unknown step type "${n.type}".`); continue; }
    for (const f of meta.fields) if (f.required && !String(n.config?.[f.key] ?? "").trim()) problems.push(`"${meta.label}" needs ${f.label.toLowerCase()}.`);
  }
  const triggers = def.nodes.filter((n) => blocks[n.type]?.kind === "trigger");
  if (triggers.length !== 1) problems.push(triggers.length === 0 ? "Add a trigger — every workflow starts with one." : "Only one trigger per workflow.");
  for (const e of def.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) { problems.push("A connection points at a missing step."); continue; }
    if (blocks[def.nodes.find((n) => n.id === e.to)!.type]?.kind === "trigger") problems.push("Nothing can connect INTO a trigger.");
    const fromKind = blocks[def.nodes.find((n) => n.id === e.from)!.type]?.kind;
    if (fromKind === "condition" && e.branch !== "true" && e.branch !== "false") problems.push("Connections out of a condition must be the Yes or the No path.");
  }
  for (const n of def.nodes) {
    const outs = def.edges.filter((e) => e.from === n.id);
    const kind = blocks[n.type]?.kind;
    if (kind === "condition") {
      for (const b of ["true", "false"] as const) if (outs.filter((e) => e.branch === b).length > 1) problems.push(`A condition can have only one ${b === "true" ? "Yes" : "No"} path.`);
    } else if (outs.length > 1) problems.push(`"${blocks[n.type]?.label ?? n.type}" can lead to only one next step — use a condition to branch.`);
  }
  // cycles: a loop would run forever
  const seen = new Set<string>(), stack = new Set<string>();
  const visit = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id); stack.add(id);
    const looped = def.edges.filter((e) => e.from === id).some((e) => visit(e.to));
    stack.delete(id);
    return looped;
  };
  if (def.nodes.some((n) => visit(n.id))) problems.push("Steps loop back on themselves — workflows must run start to finish.");
  if (triggers.length === 1 && def.nodes.length > 1) {
    const reach = new Set<string>();
    const walk = (id: string) => { if (reach.has(id)) return; reach.add(id); def.edges.filter((e) => e.from === id).forEach((e) => walk(e.to)); };
    walk(triggers[0].id);
    const orphans = def.nodes.filter((n) => !reach.has(n.id)).length;
    if (orphans) problems.push(`${orphans} step(s) aren't connected to the trigger.`);
  }
  return [...new Set(problems)];
}

export const triggerOf = (def: Definition, blocks: Record<string, BlockMeta>): Node | undefined => def.nodes.find((n) => blocks[n.type]?.kind === "trigger");

export function nextNode(def: Definition, fromId: string, branch?: "true" | "false"): Node | undefined {
  const edge = def.edges.find((e) => e.from === fromId && (branch === undefined || e.branch === branch));
  return edge ? def.nodes.find((n) => n.id === edge.to) : undefined;
}

// ── path preview (dry run) ───────────────────────────────────────────────────

export type PreviewStep = { nodeId: string; label: string; kind: BlockKind; detail: string; status: "would_run" | "taken_yes" | "taken_no" | "would_wait"; external: boolean; contacts: boolean };

/**
 * Walk the workflow against a sample event WITHOUT running anything: conditions
 * are evaluated for real, every other step only describes what it would do.
 * Steps whose output later conditions depend on are unknown in a preview, so
 * such conditions read the sample context only.
 */
export function simulate(def: Definition, blocks: Record<string, BlockMeta>, sample: unknown): { steps: PreviewStep[]; skipped: string[] } {
  const ctx = { trigger: sample, steps: {} };
  const steps: PreviewStep[] = [];
  let node = triggerOf(def, blocks);
  while (node && steps.length < MAX_STEPS_PER_RUN) {
    const meta = blocks[node.type];
    if (!meta) break;
    const base = { nodeId: node.id, label: meta.label, kind: meta.kind, detail: render(meta.describe(node.config ?? {}), ctx), external: Boolean(meta.external), contacts: Boolean(meta.contacts) };
    if (meta.kind === "condition") {
      const yes = evaluateCondition(node.config ?? {}, ctx);
      steps.push({ ...base, status: yes ? "taken_yes" : "taken_no" });
      node = nextNode(def, node.id, yes ? "true" : "false");
    } else {
      steps.push({ ...base, status: meta.kind === "wait" ? "would_wait" : "would_run" });
      node = nextNode(def, node.id);
    }
  }
  const visited = new Set(steps.map((s) => s.nodeId));
  return { steps, skipped: def.nodes.filter((n) => !visited.has(n.id)).map((n) => blocks[n.type]?.label ?? n.type) };
}

/** Strip emails and phone numbers before anything is written to the step log. */
export function redact(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]").slice(0, 400);
}

/** Block requests to internal, loopback, link-local and cloud-metadata addresses. */
export function safeUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("That is not a valid web address."); }
  if (url.protocol !== "https:") throw new Error("Only https:// addresses are allowed.");
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || privateV4.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || /^\d+$/.test(h)) {
    throw new Error("Internal addresses are not allowed.");
  }
  return url;
}
