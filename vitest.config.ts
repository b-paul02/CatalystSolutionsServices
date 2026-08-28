import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // 30s timeout: LeadOS suites hit the real (remote Neon) database.
  // Worker cap: >8 parallel Prisma clients overruns the Neon pooler and drops
  // a connection mid-teardown (spurious single-file failures).
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
  // Server components under test render through the automatic JSX runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
