import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";

// Cookie-session auth for the admin area. Accounts in env ADMIN_ACCOUNTS.
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") return NextResponse.next();
  const email = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!email) {
    const login = new URL("/admin/login", req.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
