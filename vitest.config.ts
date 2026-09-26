import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // 30s timeout: LeadOS suites hit the real (remote Neon) database.
  // Worker cap: >8 parallel Prisma clients overruns the Neon pooler and drops
  // a connection mid-teardown (spurious single-file failures).
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Pins DATABASE_URL to a local disposable "_test" database — fails closed otherwise.
    setupFiles: ["tests/setup.ts"],
    // One file at a time: every DB suite shares ONE disposable database, and the scheduler entry points under test
    // (/api/os/tick, the job queue) sweep all of it, so parallel files could run each other's publications and AI jobs.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
  // Server components under test render through the automatic JSX runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
