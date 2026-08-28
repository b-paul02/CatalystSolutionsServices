// LeadOS lives at app.catalystsolutionservices.com, served by the /app route
// group. Canonical URLs KEEP the /app prefix; on the LeadOS host, middleware
// REDIRECTS bare paths (/login → /app/login). We deliberately do not use
// rewrites: hiding the prefix breaks App Router client navigation after
// server-action redirects (URL path and router state tree disagree → 404).

/** True when the request host is the LeadOS app subdomain (prod or local dev). */
export function isLeadosHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "app.catalystsolutionservices.com" || h === "app.localhost";
}

/**
 * Canonical /app path for a bare path on the LeadOS host, or null when the
 * request should pass through untouched (already canonical, api, assets).
 */
export function leadosCanonicalPath(pathname: string): string | null {
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
