// Admin accounts + signed session cookie. Edge-safe (WebCrypto only) so middleware can use it.
// Accounts live in env ADMIN_ACCOUNTS as "email:password,email:password".

export const SESSION_COOKIE = "admin_session";

function accounts(): { email: string; password: string }[] {
  return (process.env.ADMIN_ACCOUNTS ?? "")
    .split(",")
    .map((pair) => {
      const i = pair.indexOf(":");
      return i > 0 ? { email: pair.slice(0, i).trim().toLowerCase(), password: pair.slice(i + 1) } : null;
    })
    .filter(Boolean) as { email: string; password: string }[];
}

export function checkCredentials(email: string, password: string): boolean {
  return accounts().some((a) => a.email === email.trim().toLowerCase() && a.password === password);
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET ?? "dev-secret"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(email: string): Promise<string> {
  const payload = btoa(email).replace(/=+$/, "");
  return `${payload}.${await hmac(payload)}`;
}

/** Returns the admin email if the session cookie is valid, else null. */
export async function verifySession(cookie: string | undefined): Promise<string | null> {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const email = atob(payload);
    return accounts().some((a) => a.email === email) ? email : null;
  } catch {
    return null;
  }
}
