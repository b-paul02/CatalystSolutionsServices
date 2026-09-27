// Production build with an ISOLATED, safe configuration: local disposable database, placeholder secrets, no provider keys,
// its own output folder (does not clobber a running dev server). Proves compilation only.   node scripts/local-build-check.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

const url = parseEnv(readFileSync(".env.development.local", "utf8")).DATABASE_URL ?? "";
const u = new URL(url);
if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "54329") { console.error("not the local cluster — refused"); process.exit(1); }
const keep = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "ComSpec", "PATHEXT", "NUMBER_OF_PROCESSORS"];
const env = Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: "production", NEXT_DIST_DIR: ".next-verify", DATABASE_URL: url, LEADOS_SECRET: "build-check-placeholder", ADMIN_SESSION_SECRET: "build-check-placeholder", NEXT_TELEMETRY_DISABLED: "1" });
const tsconfig = readFileSync("tsconfig.json", "utf8"); // Next adds the dist dir to "include": put it back afterwards
const r = spawnSync("npx", ["next", "build"], { env, stdio: "inherit", shell: true });
writeFileSync("tsconfig.json", tsconfig);
console.log(`EXIT=${r.status}`);
process.exit(r.status ?? 1);
