// Server-only: uses node:crypto, so it must stay out of the builder bundle.
import { createHash } from "node:crypto";
import type { Definition } from "./definition";

/** Hash of the LOGIC only — moving cards around the canvas never deactivates a workflow. */
export function definitionHash(def: Definition): string {
  const logic = {
    nodes: [...def.nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({ id: n.id, type: n.type, config: Object.fromEntries(Object.entries(n.config ?? {}).sort()) })),
    edges: [...def.edges].map((e) => `${e.from}>${e.to}:${e.branch ?? ""}`).sort(),
  };
  return createHash("sha256").update(JSON.stringify(logic)).digest("hex");
}

