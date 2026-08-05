import { readFileSync } from "fs";
import { join } from "path";

// Context/*.md files feed the pipeline prompts. Cached per process.
const cache = new Map<string, string>();

export function contextFile(name: string): string {
  if (!cache.has(name)) {
    cache.set(name, readFileSync(join(process.cwd(), "Context", name), "utf8"));
  }
  return cache.get(name)!;
}
