// Plant the "this database is disposable" marker that tests, seeds, wipes and the dev server require (lib/dbGuard.ts).
// Run ONCE per throwaway local database, after `prisma db push`:
//   node scripts/mark-disposable-db.mjs growthos_dev growthos_test
// It reads DATABASE_URL (.env.development.local) and TEST_DATABASE_URL (.env.test.local), and marks a database only
// when: the URL host is this machine, AND you typed that database's exact name as an argument. Never prints a URL.
// NEVER run this against anything you would mind losing — the marker is what lets wipes and tests write to it.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";

// Read the two local env files DIRECTLY. process.env is deliberately ignored: importing Prisma auto-loads `.env`,
// which on this project holds live values — those must never be candidates here.
const env = {};
for (const [f, k] of [[".env.development.local", "DATABASE_URL"], [".env.test.local", "TEST_DATABASE_URL"]]) if (existsSync(f)) env[k] = parseEnv(readFileSync(f, "utf8"))[k];
const named = new Set(process.argv.slice(2));
if (named.size === 0) { console.error("Name the database(s) to mark, e.g. growthos_dev growthos_test"); process.exit(1); }
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

for (const [key, url] of Object.entries(env)) {
  if (!url) continue;
  const u = new URL(url), name = decodeURIComponent(u.pathname.slice(1));
  if (!LOCAL.has(u.hostname.toLowerCase())) { console.error(`${key}: not a local host — refused.`); continue; }
  if (!named.has(name)) { console.error(`${key}: database "${name}" was not named on the command line — skipped.`); continue; }
  const db = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    await db.$executeRawUnsafe(`INSERT INTO "CosHeartbeat" ("key", "at", "note") VALUES ('db.disposable', now(), $1) ON CONFLICT ("key") DO UPDATE SET "note" = EXCLUDED."note", "at" = now()`, name);
    console.log(`${key}: "${name}" marked disposable.`);
  } catch (e) { console.error(`${key}: could not mark "${name}" (${String(e.message).split("\n")[0]}). Has the schema been pushed?`); } finally { await db.$disconnect(); }
}
