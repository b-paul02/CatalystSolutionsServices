// `prisma db push` against the LOCAL disposable databases only. Prisma auto-loads `.env` (live values on this machine), so the
// URL is read from the local env files and passed explicitly; anything not on the local cluster is refused. Never prints the URL.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

for (const [file, key] of [[".env.development.local", "DATABASE_URL"], [".env.test.local", "TEST_DATABASE_URL"]]) {
  const url = parseEnv(readFileSync(file, "utf8"))[key] ?? "";
  const u = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "54329" || !/^growthos_(dev|test)$/.test(u.pathname.slice(1))) { console.error(`${file}: not the local disposable cluster — refused.`); process.exit(1); }
  console.log(`db push → ${u.pathname.slice(1)} (local)`);
  const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8" });
  console.log((r.stdout + r.stderr).split("\n").filter((l) => /sync|warn|error|loss|already/i.test(l)).join("\n"));
  if (r.status !== 0) process.exit(r.status ?? 1);
}
spawnSync("npx", ["prisma", "generate"], { stdio: "ignore", shell: true });
