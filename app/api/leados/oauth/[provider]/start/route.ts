import { NextRequest, NextResponse } from "next/server";
import { oauthEnabled, providerConfig, redirectUri, type OAuthProvider } from "@/lib/leados/oauth";
import { randomToken } from "@/lib/leados/crypto";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if ((provider !== "google" && provider !== "microsoft") || !oauthEnabled(provider as OAuthProvider)) {
    return NextResponse.json({ error: "Provider not configured" }, { status: 404 });
  }
  const p = provider as OAuthProvider;
  const c = providerConfig(p);
  const state = randomToken(16);
  const url = new URL(c.authUrl);
  url.searchParams.set("client_id", c.clientId!);
  url.searchParams.set("redirect_uri", redirectUri(p));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("los_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600,
  });
  void req;
  return res;
}
