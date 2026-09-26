import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// AUDIT-ONLY runner. Kept out of the implementation suite (vitest.config.ts includes tests/** only).
export default defineConfig({
  test: { environment: "node", include: ["growthos-audit-evidence/**/*.test.ts"], setupFiles: ["tests/setup.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } },
});
