import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";
import { isLeadosHost, leadosCanonicalPath } from "@/lib/leados/hosts";

// 1. Host routing: app.catalystsolutionservices.com serves the LeadOS app
//    (the /app route group) — the marketing site never renders on that host.
// 2. Cookie-session auth for the marketing-site admin area (env ADMIN_ACCOUNTS).
//    LeadOS has its own auth inside its route handlers, not here.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isLeadosHost(req.headers.get("host"))) {
    const target = leadosCanonicalPath(pathname);
    if (target) {
      const url = req.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const email = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!email) return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static files — host routing needs it.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
