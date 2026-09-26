// Fail-closed database targeting. Development, scripts and tests may only talk
// to a disposable local database; production (NODE_ENV=production) is untouched.
// Never logs the connection string.
//
// Two independent proofs are required outside production:
//   1. the URL points at this machine (and, for tests, names a database ending in "_test");
//   2. the DATABASE ITSELF carries a marker row naming itself (`CosHeartbeat` key "db.disposable", note = db name).
// (1) alone is not enough: a tunnel or port-forward makes a real service look like localhost. A production database
// reached that way has no marker, so tests, seeds, wipes and the dev server refuse it. The marker is planted once per
// disposable database by `node scripts/mark-disposable-db.mjs` (see GROWTHOS_EXTERNAL_SETUP.md).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const DISPOSABLE_MARKER_KEY = "db.disposable";
export const BLOCKED_URL = "postgresql://blocked:blocked@db-blocked.invalid:5432/blocked_test";

export function dbHost(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}
export const dbName = (url: string | undefined): string | null => { try { return url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || null : null; } catch { return null; } };

export const isLocalDb = (url: string | undefined): boolean => {
  const h = dbHost(url);
  return h !== null && LOCAL_HOSTS.has(h);
};

/**
 * Tests: DATABASE_URL is FORCED to TEST_DATABASE_URL, which must be local and
 * name a database ending in "_test". Anything else → a sentinel that cannot connect.
 * tests/setup.ts then also demands the disposable marker.
 */
export function pinTestDatabase(env: NodeJS.ProcessEnv = process.env): { ok: boolean; reason?: string } {
  const url = env.TEST_DATABASE_URL;
  let reason: string | undefined;
  if (!url) reason = "TEST_DATABASE_URL is not set (see GROWTHOS_EXTERNAL_SETUP.md → Local databases).";
  else if (!isLocalDb(url)) reason = "TEST_DATABASE_URL must point at localhost.";
  else if (!/_test$/.test(new URL(url).pathname)) reason = 'TEST_DATABASE_URL database name must end in "_test".';
  env.DATABASE_URL = reason ? BLOCKED_URL : url;
  return reason ? { ok: false, reason } : { ok: true };
}

/** Dev server and scripts: refuse a remote database outside production. */
export function assertSafeDatabase(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") return;
  if (env.VITEST) return; // pinned by tests/setup.ts
  if (isLocalDb(env.DATABASE_URL)) return;
  throw new Error(
    "Refusing to use a non-local database outside production. Point DATABASE_URL at the local dev database " +
      "(.env.development.local) — see GROWTHOS_EXTERNAL_SETUP.md → Local databases.",
  );
}

/** Does the database at `url` say, in its own data, that it is disposable? Any error (unreachable, no table) ⇒ no. */
export async function hasDisposableMarker(url: string | undefined): Promise<boolean> {
  const name = dbName(url);
  if (!url || !name) return false;
  const { PrismaClient } = await import("@prisma/client");
  const probe = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    const rows = await probe.$queryRawUnsafe<{ note: string | null }[]>(`SELECT "note" FROM "CosHeartbeat" WHERE "key" = $1`, DISPOSABLE_MARKER_KEY);
    return rows[0]?.note === name;
  } catch { return false; } finally { await probe.$disconnect().catch(() => {}); }
}

/** For anything that seeds, wipes or otherwise writes freely: local URL AND the marker, or it throws. */
export async function assertDisposableDatabase(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (env.NODE_ENV === "production") throw new Error("Seeds, wipes and test utilities never run with NODE_ENV=production.");
  if (!isLocalDb(env.DATABASE_URL)) throw new Error("Refusing: DATABASE_URL is not a local database.");
  if (!(await hasDisposableMarker(env.DATABASE_URL))) throw new Error("Refusing: this database is not marked disposable. If it really is a throwaway local database, run `node scripts/mark-disposable-db.mjs` once (GROWTHOS_EXTERNAL_SETUP.md → Local databases).");
}
