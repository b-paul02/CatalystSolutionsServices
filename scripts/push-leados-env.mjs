// Push all filled variables from leados-production-env.txt to Vercel (Production).
// Prereqs (one time): npx vercel login && npx vercel link
// Run: node scripts/push-leados-env.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const lines = readFileSync("leados-production-env.txt", "utf8").split(/\r?\n/);
let pushed = 0, skipped = 0;
for (const line of lines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  const [, name, value] = m;
  if (!value.trim()) { skipped++; continue; }
  try {
    // Remove any existing value first so re-runs update instead of failing.
    try { execSync(`npx vercel env rm ${name} production --yes`, { stdio: "pipe" }); } catch {}
    execSync(`npx vercel env add ${name} production`, { input: value, stdio: ["pipe", "inherit", "inherit"] });
    pushed++;
  } catch (e) {
    console.error(`FAILED: ${name} — ${e.message}`);
  }
}
console.log(`\nDone: ${pushed} pushed, ${skipped} left blank (optional).`);
console.log("Now redeploy: npx vercel --prod   (or push a commit / redeploy in the dashboard)");
