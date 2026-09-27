import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { authorizeUrl, isProvider, providerEnabled } from "@/lib/os/connectors";

// Begin a provider connection for the caller's ACTIVE workspace. The org is
// pinned in an httpOnly cookie and re-derived from membership on callback.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider) || !providerEnabled(provider)) return NextResponse.json({ error: "Provider not configured" }, { status: 404 });
  let actor;
  try { actor = await requireOrg("os.settings"); } catch { return NextResponse.redirect(new URL("/app/login", req.nextUrl.origin)); }
  const { url, state, verifier } = authorizeUrl(provider, req.nextUrl.origin);
  const res = NextResponse.redirect(url);
  res.cookies.set("cos_oauth", JSON.stringify({ state, provider, orgId: actor.orgId, verifier }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/os/connect", maxAge: 600,
  });
  return res;
}
