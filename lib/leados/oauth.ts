// Google / Microsoft sign-in via the OAuth2 authorization-code flow.
// Enabled per provider only when its env credentials exist.
import { APP_URL } from "./email";

export type OAuthProvider = "google" | "microsoft";

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
};

export function providerConfig(provider: OAuthProvider): ProviderConfig {
  if (provider === "google") {
    return {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
      clientId: process.env.LEADOS_GOOGLE_CLIENT_ID,
      clientSecret: process.env.LEADOS_GOOGLE_CLIENT_SECRET,
    };
  }
  return {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile",
    clientId: process.env.LEADOS_MS_CLIENT_ID,
    clientSecret: process.env.LEADOS_MS_CLIENT_SECRET,
  };
}

export function oauthEnabled(provider: OAuthProvider): boolean {
  const c = providerConfig(provider);
  return Boolean(c.clientId && c.clientSecret);
}

export function redirectUri(provider: OAuthProvider): string {
  return `${APP_URL}/api/leados/oauth/${provider}/callback`;
}

/** Exchanges the code and returns the verified email + name, or null. */
export async function fetchOAuthIdentity(
  provider: OAuthProvider,
  code: string,
): Promise<{ email: string; name: string | null } | null> {
  const c = providerConfig(provider);
  if (!c.clientId || !c.clientSecret) return null;
  const tokenRes = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: redirectUri(provider),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return null;
  const infoRes = await fetch(c.userinfoUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { email?: string; name?: string; email_verified?: boolean };
  if (!info.email) return null;
  return { email: info.email.toLowerCase(), name: info.name ?? null };
}
