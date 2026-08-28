import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // 30s timeout: LeadOS suites hit the real (remote Neon) database.
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], testTimeout: 30_000 },
  // Server components under test render through the automatic JSX runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
