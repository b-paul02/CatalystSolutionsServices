// Provider connections (blueprint §12, E13). OAuth2 authorization-code flow via
// fetch — no SDKs. A connection is "verified" ONLY after a live access test
// passes; a stored token alone never counts. Tokens are AES-256-GCM encrypted
// (lib/leados/crypto) and never logged. Each provider is enabled only when its
// env credentials exist.
import { createHash } from "node:crypto";
import { db } from "@/lib/audit/db";
import { decryptField, encryptField, randomToken } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";

export const PROVIDERS = ["gsc", "linkedin", "x", "meta"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (p: string): p is Provider => (PROVIDERS as readonly string[]).includes(p);

type Def = {
  label: string;
  capability: string; // the demonstrated supported action (launch DoD §15.1)
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  pkce?: boolean;
  basicAuth?: boolean; // client credentials in the Authorization header
  extraAuth?: Record<string, string>;
  comingSoon?: boolean; // owner decision: shown in the UI, but cannot be connected yet
};

export function providerDef(p: Provider): Def {
  switch (p) {
    case "gsc":
      return {
        label: "Google Search Console + Analytics", capability: "Reads search clicks/impressions daily. Read-only.",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
        clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        extraAuth: { access_type: "offline", prompt: "consent" },
      };
    case "linkedin":
      return {
        label: "LinkedIn", capability: "Publishes approved text posts to the connected member profile.",
        authUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scope: "openid profile w_member_social",
        clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      };
    case "x":
      return {
        label: "X", capability: "Publishes approved text posts.",
        authUrl: "https://twitter.com/i/oauth2/authorize", tokenUrl: "https://api.twitter.com/2/oauth2/token",
        scope: "tweet.read tweet.write users.read offline.access",
        clientId: process.env.X_CLIENT_ID, clientSecret: process.env.X_CLIENT_SECRET, pkce: true, basicAuth: true,
      };
    case "meta":
      return {
        label: "Facebook Pages / Instagram", capability: "Page and Instagram publishing.", comingSoon: true,
        authUrl: "https://www.facebook.com/v19.0/dialog/oauth", tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scope: "pages_show_list,pages_read_engagement",
        clientId: process.env.META_APP_ID, clientSecret: process.env.META_APP_SECRET,
      };
  }
}

export const providerEnabled = (p: Provider): boolean => { const d = providerDef(p); return !d.comingSoon && Boolean(d.clientId && d.clientSecret); };
export const callbackUrl = (origin: string, p: Provider): string => `${origin}/api/os/connect/${p}/callback`;

export function authorizeUrl(p: Provider, origin: string): { url: string; state: string; verifier: string | null } {
  const d = providerDef(p);
  const state = randomToken(16);
  const verifier = d.pkce ? randomToken(32) : null;
  const url = new URL(d.authUrl);
  url.searchParams.set("client_id", d.clientId!);
  url.searchParams.set("redirect_uri", callbackUrl(origin, p));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", d.scope);
  url.searchParams.set("state", state);
  for (const [k, v] of Object.entries(d.extraAuth ?? {})) url.searchParams.set(k, v);
  if (verifier) {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { url: url.toString(), state, verifier };
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<Tokens> {
  const d = providerDef(p);
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  body.set("client_id", d.clientId!);
  if (d.basicAuth) headers.Authorization = `Basic ${Buffer.from(`${d.clientId}:${d.clientSecret}`).toString("base64")}`;
  else body.set("client_secret", d.clientSecret!);
  const res = await fetch(d.tokenUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as Tokens & { error?: string; error_description?: string };
  // never surface the raw body — it can echo credentials
  if (!res.ok || !json.access_token) throw new Error(`Token exchange failed (${res.status}${json.error ? `: ${json.error}` : ""}).`);
  return json;
}

const api = async (url: string, token: string, init: RequestInit = {}) =>
  fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });

/** Live access test. Returns a human label + provider config, or throws. */
async function accessTest(p: Provider, token: string): Promise<{ label: string; config: Record<string, unknown> }> {
  if (p === "gsc") {
    const res = await api("https://www.googleapis.com/webmasters/v3/sites", token);
    if (!res.ok) throw new Error(`Search Console access test failed (${res.status}).`);
    const sites = (((await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] }).siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
    if (sites.length === 0) throw new Error("This Google account has no verified Search Console property.");
    return { label: sites[0].siteUrl, config: { siteUrl: sites[0].siteUrl, sites: sites.map((s) => s.siteUrl).slice(0, 25) } };
  }
  if (p === "linkedin") {
    const res = await api("https://api.linkedin.com/v2/userinfo", token);
    if (!res.ok) throw new Error(`LinkedIn access test failed (${res.status}).`);
    const me = (await res.json()) as { sub: string; name?: string };
    return { label: me.name ?? "LinkedIn member", config: { author: `urn:li:person:${me.sub}` } };
  }
  if (p === "x") {
    const res = await api("https://api.twitter.com/2/users/me", token);
    if (!res.ok) throw new Error(`X access test failed (${res.status}).`);
    const me = ((await res.json()) as { data?: { id: string; username: string } }).data;
    if (!me) throw new Error("X access test returned no user.");
    return { label: `@${me.username}`, config: { userId: me.id } };
  }
  const res = await api("https://graph.facebook.com/v19.0/me?fields=id,name", token); // bearer header — never a token in the URL
  if (!res.ok) throw new Error(`Meta access test failed (${res.status}).`);
  const me = (await res.json()) as { id: string; name?: string };
  return { label: me.name ?? "Meta account", config: { userId: me.id } };
}

/** Code → tokens → live test → stored connection. Status reflects the TEST, not the token. */
export async function completeConnection(opts: { provider: Provider; orgId: string; userId: string; code: string; origin: string; verifier: string | null }) {
  const { provider: p, orgId } = opts;
  const tokens = await tokenRequest(p, { grant_type: "authorization_code", code: opts.code, redirect_uri: callbackUrl(opts.origin, p), ...(opts.verifier ? { code_verifier: opts.verifier } : {}) });
  let status = "verified", label: string | null = null, config: Record<string, unknown> = {}, lastError: string | null = null;
  try { const t = await accessTest(p, tokens.access_token); label = t.label; config = t.config; }
  catch (e) { status = "failed"; lastError = (e as Error).message.slice(0, 300); }
  const data = {
    status, accountLabel: label, config: JSON.stringify(config), lastError, lastCheckedAt: new Date(), scopes: providerDef(p).scope,
    accessTokenEnc: encryptField(tokens.access_token),
    refreshTokenEnc: tokens.refresh_token ? encryptField(tokens.refresh_token) : null,
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
  };
  const conn = await db.cosConnection.upsert({ where: { orgId_provider: { orgId, provider: p } }, update: data, create: { ...data, orgId, provider: p, createdById: opts.userId } });
  await logLosAudit({ orgId, actorUserId: opts.userId, actorType: "user", action: `connection.${status}`, entity: "CosConnection", entityId: conn.id, data: { provider: p } });
  return conn;
}

/** A usable access token, refreshing when it is within 2 minutes of expiry. */
export async function accessToken(orgId: string, p: Provider): Promise<string> {
  const conn = await db.cosConnection.findUnique({ where: { orgId_provider: { orgId, provider: p } } });
  if (!conn?.accessTokenEnc || conn.status === "disconnected") throw new Error(`${providerDef(p).label} is not connected.`);
  if (!conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() - Date.now() > 120_000) return decryptField(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc) throw new Error(`${providerDef(p).label} token expired — reconnect the account.`);
  try {
    const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: decryptField(conn.refreshTokenEnc) });
    await db.cosConnection.update({
      where: { id: conn.id },
      data: {
        accessTokenEnc: encryptField(t.access_token),
        // X rotates refresh tokens; Google keeps the old one
        refreshTokenEnc: t.refresh_token ? encryptField(t.refresh_token) : conn.refreshTokenEnc,
        tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      },
    });
    return t.access_token;
  } catch (e) {
    await db.cosConnection.update({ where: { id: conn.id }, data: { status: "failed", lastError: (e as Error).message.slice(0, 300), lastCheckedAt: new Date() } });
    throw e;
  }
}

export async function recheckConnection(orgId: string, p: Provider) {
  let status = "verified", lastError: string | null = null;
  try { await accessTest(p, await accessToken(orgId, p)); } catch (e) { status = "failed"; lastError = (e as Error).message.slice(0, 300); }
  return db.cosConnection.update({ where: { orgId_provider: { orgId, provider: p } }, data: { status, lastError, lastCheckedAt: new Date() } });
}

/** Disconnect = destroy the stored tokens. The row stays for the audit trail. */
export async function disconnect(orgId: string, p: Provider, userId: string) {
  const conn = await db.cosConnection.update({
    where: { orgId_provider: { orgId, provider: p } },
    data: { status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, lastError: null, lastCheckedAt: new Date() },
  });
  await logLosAudit({ orgId, actorUserId: userId, actorType: "user", action: "connection.disconnected", entity: "CosConnection", entityId: conn.id, data: { provider: p } });
}

// ── Search Console sync ──────────────────────────────────────────────────────

/**
 * Pull daily clicks/impressions into CosMetricPoint. Idempotent upsert per day, so
 * a retried or overlapping sync never double counts. Grade B: traceable
 * first-party source, not reconciled to CRM revenue.
 */
export async function syncSearchConsole(orgId: string, days = 28): Promise<number> {
  const conn = await db.cosConnection.findUnique({ where: { orgId_provider: { orgId, provider: "gsc" } } });
  const siteUrl = conn?.config ? (JSON.parse(conn.config) as { siteUrl?: string }).siteUrl : null;
  if (!conn || conn.status !== "verified" || !siteUrl) return 0;
  const token = await accessToken(orgId, "gsc");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // GSC data lags ~2 days
  const end = new Date(Date.now() - 2 * 86_400_000), start = new Date(end.getTime() - days * 86_400_000);
  const res = await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, {
    method: "POST", body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions: ["date"], rowLimit: 100 }),
  });
  if (!res.ok) {
    await db.cosConnection.update({ where: { id: conn.id }, data: { status: "failed", lastError: `Search analytics query failed (${res.status}).`, lastCheckedAt: new Date() } });
    throw new Error(`Search Console sync failed (${res.status}).`); // job queue retries with backoff
  }
  const rows = ((await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number }[] }).rows ?? [];
  for (const r of rows) {
    const day = new Date(`${r.keys[0]}T00:00:00.000Z`);
    for (const [metric, value] of [["clicks", r.clicks], ["impressions", r.impressions]] as const) {
      await db.cosMetricPoint.upsert({
        where: { orgId_provider_metric_day: { orgId, provider: "gsc", metric, day } },
        update: { value, grade: "B" }, create: { orgId, provider: "gsc", metric, day, value, grade: "B" },
      });
    }
  }
  await db.cosConnection.update({ where: { id: conn.id }, data: { lastCheckedAt: new Date(), lastError: null } });
  return rows.length;
}

// ── publishing (tier 2 — callers MUST pass gateAction first) ─────────────────

export const PUBLISHABLE: readonly string[] = ["linkedin", "x"];

/** Publish plain text. Returns the provider's post id. Throws on any non-2xx. */
export async function publishText(orgId: string, p: Provider, text: string): Promise<string> {
  const token = await accessToken(orgId, p);
  if (p === "linkedin") {
    const conn = await db.cosConnection.findUnique({ where: { orgId_provider: { orgId, provider: p } } });
    const author = conn?.config ? (JSON.parse(conn.config) as { author?: string }).author : null;
    if (!author) throw new Error("LinkedIn author is unknown — reconnect the account.");
    const res = await api("https://api.linkedin.com/v2/ugcPosts", token, {
      method: "POST", headers: { "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author, lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: text.slice(0, 3000) }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn publish failed (${res.status}).`);
    return ((await res.json()) as { id: string }).id;
  }
  if (p === "x") {
    if (text.length > 280) throw new Error(`Post is ${text.length} characters — X allows 280.`);
    const res = await api("https://api.twitter.com/2/tweets", token, { method: "POST", body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error(`X publish failed (${res.status}).`);
    return ((await res.json()) as { data: { id: string } }).data.id;
  }
  throw new Error(`Publishing to ${providerDef(p).label} is not supported yet — record a manual delivery instead.`);
}
