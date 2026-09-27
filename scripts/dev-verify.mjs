// Local verification server: `next dev` on its own port with the DEV-ONLY stand-in model enabled, so AI Studio can be
// walked end to end without a paid provider. Database comes from .env.development.local (local + marked disposable,
// enforced by instrumentation.ts). Never use these settings anywhere but this machine.   node scripts/dev-verify.mjs
import { spawn } from "node:child_process";
const port = process.env.PORT ?? "3100";
const env = { ...process.env, PORT: port, GROWTHOS_DEV_LLM: "1", LLM_BASE_URL: `http://localhost:${port}/api/dev/llm`, LLM_API_KEY: "dev-stand-in", LLM_MODEL: "dev-stand-in-model", GROWTHOS_TEST_ADAPTER: "1", ASSET_STORAGE: "local", CRON_SECRET: process.env.CRON_SECRET ?? "local-dev-cron-secret",
  // throwaway LOCAL values: they override whatever .env holds, so a cookie minted for this server is worthless anywhere else
  ADMIN_SESSION_SECRET: "local-verify-only-session-secret", ADMIN_ACCOUNTS: "dev-operator@localhost.invalid:unused-local-only" };
spawn("npx", ["next", "dev", "-p", port], { stdio: "inherit", env, shell: true }).on("exit", (c) => process.exit(c ?? 0));
