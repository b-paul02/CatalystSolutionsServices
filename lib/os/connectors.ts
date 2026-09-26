// Provider connections (blueprint §12, E13). OAuth2 authorization-code flow via
// fetch — no SDKs. A connection is "verified" ONLY after a live access test
// passes; a stored token alone never counts. Tokens are AES-256-GCM encrypted
// (lib/leados/crypto) and never logged. Each provider is enabled only when its
// env credentials exist.
import { createHash } from "node:crypto";
import { db } from "@/lib/audit/db";
import { decryptField, encryptField, randomToken } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";

const META_V = process.env.META_GRAPH_VERSION ?? "v25.0";
export const PROVIDERS = ["gsc", "linkedin", "x", "meta", "youtube"] as const;
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
        // WP-16: calendar scopes join only once the owner has them approved (GOOGLE_CALENDAR_SCOPES=1), else the sign-in would fail
        scope: `openid email https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly${process.env.GOOGLE_CALENDAR_SCOPES ? " https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events" : ""}`,
        clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        extraAuth: { access_type: "offline", prompt: "consent" },
      };
    case "linkedin":
      return {
        label: "LinkedIn", capability: "Publishes approved text posts to the connected member profile.",
        authUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        // Organisation scopes need LinkedIn's Community Management API approval; asking for a scope the app
        // does not have fails the WHOLE sign-in, so they are opt-in: LINKEDIN_SCOPES="openid profile w_member_social w_organization_social r_organization_social rw_organization_admin"
        scope: process.env.LINKEDIN_SCOPES ?? "openid profile w_member_social",
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
        label: "Facebook Pages / Instagram", capability: "Publishes approved posts to the Pages and Instagram professional accounts you choose.",
        authUrl: `https://www.facebook.com/${META_V}/dialog/oauth`, tokenUrl: `https://graph.facebook.com/${META_V}/oauth/access_token`,
        // every one of these needs Meta App Review (advanced access) before a non-tester can grant it
        scope: process.env.META_SCOPES ?? "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management",
        clientId: process.env.META_APP_ID, clientSecret: process.env.META_APP_SECRET,
      };
    case "youtube":
      return {
        label: "YouTube", capability: "Uploads approved, finished videos to your channel and reads their statistics.",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
        clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        extraAuth: { access_type: "offline", prompt: "consent" },
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

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

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

export type FoundAccount = {
  accountType: string; externalAccountId: string; label: string; config: Record<string, unknown>;
  capabilities: string[]; eligibilityNote?: string | null;
  token?: string; // when the account has its OWN token (a Facebook Page token), else the sign-in token is used
};

const has = (granted: string, scope: string) => granted.split(/[\s,]+/).includes(scope);

/**
 * Live discovery: which accounts can this sign-in actually act for, and what may it do on each?
 * Capabilities come from the scopes the provider GRANTED (not the ones we asked for) plus the
 * account's own eligibility (page role, professional IG account…). Throws when nothing is usable.
 */
export async function discoverAccounts(p: Provider, token: string, granted: string): Promise<FoundAccount[]> {
  if (p === "gsc") {
    const res = await api("https://www.googleapis.com/webmasters/v3/sites", token);
    if (!res.ok) throw new Error(`Search Console access test failed (${res.status}).`);
    const sites = (((await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] }).siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
    if (sites.length === 0) throw new Error("This Google account has no verified Search Console property.");
    return [{ accountType: "property", externalAccountId: sites[0].siteUrl, label: sites[0].siteUrl, capabilities: ["analytics"], config: { siteUrl: sites[0].siteUrl, sites: sites.map((s) => s.siteUrl).slice(0, 25) } }];
  }
  if (p === "youtube") {
    const res = await api("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", token);
    if (!res.ok) throw new Error(`YouTube access test failed (${res.status}).`);
    const items = ((await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] }).items ?? [];
    if (items.length === 0) throw new Error("This Google account has no YouTube channel.");
    const caps = [...(has(granted, "https://www.googleapis.com/auth/youtube.upload") ? ["publish"] : []), ...(has(granted, "https://www.googleapis.com/auth/yt-analytics.readonly") || has(granted, "https://www.googleapis.com/auth/youtube.readonly") ? ["analytics"] : [])];
    // uploads from an unaudited API project are locked to private by YouTube — default to private and say so
    return items.map((c) => ({ accountType: "channel", externalAccountId: c.id, label: c.snippet?.title ?? "YouTube channel", capabilities: caps, eligibilityNote: caps.includes("publish") ? "Uploads start as private until the Google API project passes YouTube's audit." : "Upload permission was not granted.", config: { privacyStatus: "private" } }));
  }
  if (p === "linkedin") {
    const res = await api("https://api.linkedin.com/v2/userinfo", token);
    if (!res.ok) throw new Error(`LinkedIn access test failed (${res.status}).`);
    const me = (await res.json()) as { sub: string; name?: string };
    const out: FoundAccount[] = [{ accountType: "member", externalAccountId: `urn:li:person:${me.sub}`, label: me.name ?? "LinkedIn member", capabilities: has(granted, "w_member_social") ? ["publish"] : [], eligibilityNote: "LinkedIn does not share post statistics for personal profiles with most apps — record them by hand.", config: { author: `urn:li:person:${me.sub}` } }];
    if (has(granted, "w_organization_social") || has(granted, "rw_organization_admin")) {
      const acl = await api("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED", token, { headers: { "LinkedIn-Version": process.env.LINKEDIN_API_VERSION ?? "202609", "X-Restli-Protocol-Version": "2.0.0" } });
      if (acl.ok) for (const el of ((await acl.json()) as { elements?: { organization?: string; role?: string }[] }).elements ?? []) {
        if (!el.organization) continue;
        const canPost = ["ADMINISTRATOR", "CONTENT_ADMIN", "DIRECT_SPONSORED_CONTENT_POSTER"].includes(el.role ?? "");
        out.push({ accountType: "organization", externalAccountId: el.organization, label: `Company page ${el.organization.split(":").pop()}`, capabilities: [...(canPost && has(granted, "w_organization_social") ? ["publish"] : []), ...(has(granted, "r_organization_social") ? ["analytics"] : [])], eligibilityNote: canPost ? null : `Your role on this page (${el.role ?? "unknown"}) cannot post.`, config: { author: el.organization, role: el.role } });
      }
    }
    return out;
  }
  if (p === "x") {
    const res = await api("https://api.x.com/2/users/me", token);
    if (!res.ok) throw new Error(`X access test failed (${res.status}).`);
    const me = ((await res.json()) as { data?: { id: string; username: string } }).data;
    if (!me) throw new Error("X access test returned no user.");
    return [{ accountType: "user", externalAccountId: me.id, label: `@${me.username}`, capabilities: [...(has(granted, "tweet.write") ? ["publish"] : []), ...(has(granted, "tweet.read") ? ["analytics"] : [])], config: { userId: me.id, username: me.username } }];
  }
  // meta: one row per Page (with its own Page token) and one per linked Instagram professional account
  const res = await api(`https://graph.facebook.com/${META_V}/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&limit=100`, token); // bearer header — never a token in the URL
  if (!res.ok) throw new Error(`Meta access test failed (${res.status}).`);
  const pages = ((await res.json()) as { data?: { id: string; name: string; access_token?: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string } }[] }).data ?? [];
  if (pages.length === 0) throw new Error("This Facebook login manages no Pages.");
  const out: FoundAccount[] = [];
  for (const pg of pages) {
    const canPost = Boolean(pg.access_token) && (pg.tasks ?? []).includes("CREATE_CONTENT");
    out.push({ accountType: "page", externalAccountId: pg.id, label: pg.name, token: pg.access_token, capabilities: [...(canPost && has(granted, "pages_manage_posts") ? ["publish"] : []), ...(has(granted, "pages_read_engagement") ? ["analytics"] : [])], eligibilityNote: canPost ? null : "Your role on this Page cannot create content.", config: { pageId: pg.id } });
    const ig = pg.instagram_business_account;
    if (ig) out.push({ accountType: "ig_business", externalAccountId: ig.id, label: `@${ig.username ?? ig.id}`, token: pg.access_token, capabilities: canPost && has(granted, "instagram_content_publish") ? ["publish"] : [], eligibilityNote: has(granted, "instagram_content_publish") ? null : "Instagram publishing permission was not granted.", config: { pageId: pg.id, igUserId: ig.id } });
  }
  return out;
}

/** Live access test for ONE stored connection (recheck). */
async function accessTest(p: Provider, token: string): Promise<void> {
  const url = p === "gsc" ? "https://www.googleapis.com/webmasters/v3/sites" : p === "youtube" ? "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true" : p === "linkedin" ? "https://api.linkedin.com/v2/userinfo" : p === "x" ? "https://api.x.com/2/users/me" : `https://graph.facebook.com/${META_V}/me?fields=id`;
  const res = await api(url, token);
  if (!res.ok) throw new Error(`${providerDef(p).label} access test failed (${res.status}).`);
}

/** Code → tokens → live discovery → one stored connection PER ACCOUNT. Status reflects the TEST, not the token. */
export async function completeConnection(opts: { provider: Provider; orgId: string; userId: string; code: string; origin: string; verifier: string | null }) {
  const { provider: p, orgId } = opts;
  const tokens = await tokenRequest(p, { grant_type: "authorization_code", code: opts.code, redirect_uri: callbackUrl(opts.origin, p), ...(opts.verifier ? { code_verifier: opts.verifier } : {}) });
  const granted = tokens.scope ?? providerDef(p).scope; // Meta omits scope in the token response
  let accounts: FoundAccount[] = [], lastError: string | null = null;
  try { accounts = await discoverAccounts(p, tokens.access_token, granted); } catch (e) { lastError = (e as Error).message.slice(0, 300); }
  const base = { scopes: granted, lastCheckedAt: new Date(), refreshTokenEnc: tokens.refresh_token ? encryptField(tokens.refresh_token) : null, tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null };
  if (accounts.length === 0) {
    // keep the failure visible on the most recent row (or a new one) — never claim "connected"
    const existing = await primaryConnection(orgId, p);
    const data = { ...base, status: "failed", lastError, accessTokenEnc: encryptField(tokens.access_token) };
    const conn = existing ? await db.cosConnection.update({ where: { id: existing.id }, data }) : await db.cosConnection.create({ data: { ...data, orgId, provider: p, createdById: opts.userId } });
    await logLosAudit({ orgId, actorUserId: opts.userId, actorType: "user", action: "connection.failed", entity: "CosConnection", entityId: conn.id, data: { provider: p } });
    return conn;
  }
  let first = null;
  for (const a of accounts) {
    const data = { ...base, status: "verified", lastError: null, liveVerifiedAt: new Date(), accountType: a.accountType, accountLabel: a.label, capabilities: a.capabilities, eligibilityNote: a.eligibilityNote ?? null, config: JSON.stringify(a.config), accessTokenEnc: encryptField(a.token ?? tokens.access_token) };
    // legacy single-account rows have no externalAccountId yet: adopt the first one instead of duplicating it
    const existing = await db.cosConnection.findFirst({ where: { orgId, provider: p, OR: [{ externalAccountId: a.externalAccountId }, { externalAccountId: null }] }, orderBy: { createdAt: "asc" } });
    const conn = existing ? await db.cosConnection.update({ where: { id: existing.id }, data: { ...data, externalAccountId: a.externalAccountId } }) : await db.cosConnection.create({ data: { ...data, orgId, provider: p, externalAccountId: a.externalAccountId, createdById: opts.userId } });
    first ??= conn;
    await logLosAudit({ orgId, actorUserId: opts.userId, actorType: "user", action: "connection.verified", entity: "CosConnection", entityId: conn.id, data: { provider: p, accountType: a.accountType } });
    await import("./engagement").then(({ syncAccessFromConnection }) => syncAccessFromConnection(orgId, p, conn.id, "verified"));
  }
  return first!;
}
/** The workspace's first live account for a provider (legacy single-account callers). */
export const primaryConnection = (orgId: string, p: string) =>
  db.cosConnection.findFirst({ where: { orgId, provider: p }, orderBy: [{ status: "desc" }, { createdAt: "asc" }] });

/** A usable access token, refreshing when it is within 2 minutes of expiry. */
export async function accessToken(orgId: string, p: Provider, connectionId?: string): Promise<string> {
  const conn = connectionId ? await db.cosConnection.findFirst({ where: { id: connectionId, orgId, provider: p } }) : await primaryConnection(orgId, p);
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

export async function recheckConnection(orgId: string, p: Provider, connectionId?: string) {
  const conn = connectionId ? await db.cosConnection.findFirst({ where: { id: connectionId, orgId, provider: p } }) : await primaryConnection(orgId, p);
  if (!conn) throw new Error(`${providerDef(p).label} is not connected.`);
  let status = "verified", lastError: string | null = null;
  try { await accessTest(p, await accessToken(orgId, p, conn.id)); } catch (e) { status = "failed"; lastError = (e as Error).message.slice(0, 300); }
  return db.cosConnection.update({ where: { id: conn.id }, data: { status, lastError, lastCheckedAt: new Date(), ...(status === "verified" ? { liveVerifiedAt: new Date() } : {}) } });
}

/** Disconnect = destroy the stored tokens. The row stays for the audit trail. */
export async function disconnect(orgId: string, p: Provider, userId: string, connectionId?: string) {
  const found = connectionId ? await db.cosConnection.findFirst({ where: { id: connectionId, orgId, provider: p } }) : await primaryConnection(orgId, p);
  if (!found) throw new Error(`${providerDef(p).label} is not connected.`);
  const conn = await db.cosConnection.update({
    where: { id: found.id },
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
  const conn = await primaryConnection(orgId, "gsc");
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
  // WP-14: query × page rows for the same window (one snapshot per sync day). No volumes exist in this API.
  const qp = await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, {
    method: "POST", body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions: ["query", "page"], rowLimit: 1000 }),
  });
  if (qp.ok) {
    const day = new Date(`${iso(end)}T00:00:00.000Z`);
    for (const r of ((await qp.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }).rows ?? []) {
      const [query, page] = r.keys;
      if (!query || !page) continue;
      await db.cosSearchQuery.upsert({ where: { orgId_day_query_page: { orgId, day, query: query.slice(0, 300), page: page.slice(0, 500) } }, update: { impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), position: r.position }, create: { orgId, day, query: query.slice(0, 300), page: page.slice(0, 500), impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), position: r.position } });
    }
    // keep the last 8 snapshots
    const keep = await db.cosSearchQuery.findMany({ where: { orgId }, distinct: ["day"], orderBy: { day: "desc" }, take: 8, select: { day: true } });
    if (keep.length === 8) await db.cosSearchQuery.deleteMany({ where: { orgId, day: { lt: keep[7].day } } });
  }
  await db.cosConnection.update({ where: { id: conn.id }, data: { lastCheckedAt: new Date(), lastError: null } });
  return rows.length;
}

// ── publishing (tier 2 — callers MUST pass gateAction first) ─────────────────

export const PUBLISHABLE: readonly string[] = ["linkedin", "x"];

/** Publish plain text from a master item (legacy single-body path). Same adapters as variant publishing. */
export async function publishText(orgId: string, p: Provider, text: string): Promise<string> {
  const conn = await primaryConnection(orgId, p);
  if (!conn || conn.status !== "verified") throw new Error(`${providerDef(p).label} is not connected.`);
  if (p === "x" && [...text].length > 280) throw new Error(`Post is ${[...text].length} characters — X allows 280.`);
  const { adapterFor, AdapterError } = await import("./adapters");
  const adapter = adapterFor(p, p);
  if (!adapter) throw new Error(`Publishing to ${providerDef(p).label} is not supported yet — record a manual delivery instead.`);
  try {
    const r = await adapter.publish({ token: await accessToken(orgId, p, conn.id), account: { externalAccountId: conn.externalAccountId ?? ((conn.config ? (JSON.parse(conn.config) as { author?: string }).author : null) ?? null), accountType: conn.accountType, config: conn.config ? JSON.parse(conn.config) : {} }, format: "post", title: null, text: text.slice(0, 3000), parts: [], media: [], donePartIds: [] });
    return r.externalId;
  } catch (e) {
    // keep the message shapes lib/os/work.ts classifies on: "failed (4xx)" = definite, anything else = uncertain
    if (e instanceof AdapterError && e.kind === "uncertain") throw new Error("Publish timed out");
    throw e;
  }
}