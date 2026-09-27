// Runs before every test file. Tests can ONLY reach a disposable local "_test"
// database; without one, DB-backed suites fail to connect and pure suites still run.
import { existsSync } from "node:fs";
import { BLOCKED_URL, hasDisposableMarker, pinTestDatabase } from "../lib/dbGuard";

if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");
let pinned = pinTestDatabase();
// localhost + "_test" is not proof (a tunnel looks local): the database must also say it is disposable
if (pinned.ok && !(await hasDisposableMarker(process.env.DATABASE_URL))) {
  process.env.DATABASE_URL = BLOCKED_URL;
  pinned = { ok: false, reason: "the test database is unreachable or not marked disposable (node scripts/mark-disposable-db.mjs)." };
}
if (!pinned.ok && !process.env.GROWTHOS_TEST_DB_WARNED) {
  process.env.GROWTHOS_TEST_DB_WARNED = "1";
  console.warn(`[tests] database blocked: ${pinned.reason}`);
}
// Deterministic, test-only secrets so crypto/session code never falls back.
process.env.LEADOS_SECRET ??= "test-only-field-key";
process.env.ADMIN_SESSION_SECRET ??= "test-only-session-secret";
