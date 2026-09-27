import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Runner for scripts/*.seed.ts only (vitest resolves the "@/…" imports). Targets the LOCAL dev database.
export default defineConfig({
  test: { environment: "node", include: ["scripts/**/*.seed.ts"], setupFiles: ["scripts/seed-setup.ts"], testTimeout: 300_000, hookTimeout: 300_000 },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
