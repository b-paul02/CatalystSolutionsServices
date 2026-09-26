// Local scheduler for development: calls the dev server's /api/os/tick every minute, exactly as a production
// trigger would (same bearer auth). No hosting plan needed.   npm run tick:local
// Refuses anything that is not localhost, so it can never poke a deployed environment.
import { existsSync } from "node:fs";
for (const f of [".env.development.local", ".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f); // earlier files win
const url = process.env.LOCAL_TICK_URL ?? "http://localhost:3000/api/os/tick";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) { console.error("local-scheduler only talks to localhost."); process.exit(1); }
if (!process.env.CRON_SECRET) { console.error("CRON_SECRET is not set (add one to .env.development.local)."); process.exit(1); }
const every = Math.max(15, Number(process.env.LOCAL_TICK_SECONDS ?? 60)) * 1000;
async function tick() {
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(90_000) });
    console.log(new Date().toISOString(), res.status, (await res.text()).slice(0, 200));
  } catch (e) { console.log(new Date().toISOString(), "tick failed:", e.message); }
}
console.log(`Ticking ${url} every ${every / 1000}s. Ctrl+C to stop.`);
await tick();
setInterval(tick, every);
