// LeadOS lives at app.catalystsolutionservices.com, served from this same
// Next.js app via a host-based rewrite onto the /app route group.
// Pure functions so middleware behavior is unit-testable.

/** True when the request host is the LeadOS app subdomain (prod or local dev). */
export function isLeadosHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "app.catalystsolutionservices.com" || h === "app.localhost";
}

/**
 * Maps a request path on the LeadOS host to its internal /app route.
 * Returns null when no rewrite is needed (assets, api, already-prefixed).
 */
export function leadosRewritePath(pathname: string): string | null {
  if (
    pathname.startsWith("/app") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".") // static files: icon.png, robots.txt, etc.
  ) {
    return null;
  }
  return pathname === "/" ? "/app" : `/app${pathname}`;
}
