// Runs once when the server process starts. Outside production the dev server writes freely (seeded logins, test
// adapter, local uploads), so it must be pointed at a database that is local AND marked disposable — see lib/dbGuard.ts.
// A localhost tunnel to a real service fails this check and the process stops before serving a single request.
export async function register() {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertDisposableDatabase } = await import("./lib/dbGuard");
  try { await assertDisposableDatabase(); } catch (e) {
    console.error(`\n[growthos] ${(e as Error).message}\n`);
    process.exit(1);
  }
}

// WP-03 · every unhandled request error lands in CosErrorEvent (fingerprinted, counted), staff notified on a new one.
// Only the route path is recorded — never the query string, headers, cookies or body.
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureError } = await import("./lib/os/errors");
    await captureError(err, { route: `${request.method} ${context.routePath ?? request.path.split("?")[0]}` });
  } catch { /* capturing must never throw inside the error path */ }
}
