import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { fetchOAuthIdentity, oauthEnabled, type OAuthProvider } from "@/lib/leados/oauth";
import { createLosSession, LOS_COOKIE } from "@/lib/leados/auth";
import { logLosAudit } from "@/lib/leados/audit";
import { APP_URL } from "@/lib/leados/email";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const fail = () => NextResponse.redirect(`${APP_URL}/login?oauth=failed`);
  if ((provider !== "google" && provider !== "microsoft") || !oauthEnabled(provider as OAuthProvider)) return fail();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("los_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail();

  const identity = await fetchOAuthIdentity(provider as OAuthProvider, code);
  if (!identity) return fail();

  let user = await db.losUser.findUnique({ where: { email: identity.email } });
  if (user?.disabledAt) return fail();
  if (!user) {
    user = await db.losUser.create({
      data: { email: identity.email, name: identity.name, emailVerifiedAt: new Date() },
    });
    await logLosAudit({ actorUserId: user.id, actorType: "user", action: "user.register_oauth", entity: "LosUser", entityId: user.id, data: { provider } });
  } else if (!user.emailVerifiedAt) {
    // The provider vouches for the email.
    await db.losUser.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  const mfa = Boolean(user.mfaEnabledAt && user.mfaSecretEnc);
  const token = await createLosSession(user.id, { mfaPending: mfa });
  await logLosAudit({ actorUserId: user.id, actorType: "user", action: "user.login_oauth", entity: "LosUser", entityId: user.id, data: { provider } });

  const res = NextResponse.redirect(`${APP_URL}${mfa ? "/mfa" : "/dashboard"}`);
  res.cookies.set(LOS_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86_400,
  });
  res.cookies.delete("los_oauth_state");
  return res;
}
