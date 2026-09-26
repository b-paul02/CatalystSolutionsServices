// Mint throwaway sign-ins for the LOCAL verification server (scripts/dev-verify.mjs): LosSession rows for the seeded
// demo users in the local dev database, plus an operator cookie signed with dev-verify's throwaway secret.
// Reads ONLY .env.development.local; refuses a non-local or unmarked database.   node scripts/dev-sessions.mjs
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const url = parseEnv(readFileSync(".env.development.local", "utf8")).DATABASE_URL;
const u = new URL(url);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("local database only");
const db = new PrismaClient({ datasourceUrl: url, log: [] });
const marker = await db.$queryRawUnsafe(`SELECT "note" FROM "CosHeartbeat" WHERE "key" = 'db.disposable'`);
if (marker[0]?.note !== u.pathname.slice(1)) throw new Error("database is not marked disposable");
const out = {};
for (const who of ["owner", "lead", "specialist"]) {
  const user = await db.losUser.findUnique({ where: { email: `${who}@growthos-demo.example.com` } });
  if (!user) continue;
  const token = randomBytes(32).toString("base64url");
  await db.losSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 8 * 3_600_000) } });
  out[who] = token;
}
const payload = Buffer.from("dev-operator@localhost.invalid").toString("base64").replace(/=+$/, "");
out.admin = `${payload}.${createHmac("sha256", "local-verify-only-session-secret").update(payload).digest("base64url")}`;
const orgs = await db.losOrg.findMany({ where: { demo: true, name: { contains: "(demo)" } }, select: { id: true, name: true } });
console.log(JSON.stringify({ sessions: out, orgs }, null, 1));
await db.$disconnect();
