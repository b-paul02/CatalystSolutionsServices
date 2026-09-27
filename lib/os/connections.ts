// Unified view over every kind of connection a workspace has (WP-01): OAuth accounts (CosConnection via
// lib/os/connectors), key-based workflow connections (CosConnection via KEY_PROVIDERS), ad-platform intake
// (LosAdConnection) and workspace config (Slack URL in LosIntegrationConfig). Read model + the two actions
// (test, disconnect) that are the same for every card. Connecting stays provider-specific.
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { KEY_PROVIDERS } from "./automation/catalog";
import { testKeyConnection } from "./automation/blocks";
import { disconnect, isProvider, PROVIDERS, providerDef, providerEnabled, recheckConnection } from "./connectors";
import { WorkError, type WorkActor } from "./work";

export type CardStatus = "verified" | "failed" | "pending" | "disconnected" | "not_connected" | "not_configured" | "awaiting_approval";
export type ConnectionCard = {
  key: string; // stable per card: `${source}:${provider}[:${id}]`
  source: "oauth" | "key" | "ads" | "config";
  provider: string;
  label: string;
  capability: string;
  status: CardStatus;
  id: string | null;
  accountLabel: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  connectHref: string | null; // OAuth start
  keyInput: { secretLabel: string; help: string } | null; // key providers: paste a secret
  /** what a person must do before this can be used at all (env vars, provider review) */
  setupNote: string | null;
};

/**
 * Platform APIs that need an approval before they can be switched on. Each is gated by ONE env var so the card can say
 * "Awaiting approval" and nothing else breaks while the owner applies. The code paths land in their own work packages.
 */
export const APPROVAL_PROVIDERS: { key: string; label: string; capability: string; env: string; note: string }[] = [
  { key: "google_calendar", label: "Google Calendar", capability: "Reads busy times and creates booking events (booking pages).", env: "GOOGLE_CALENDAR_SCOPES", note: "Add the calendar scope to the Google OAuth consent screen, then set GOOGLE_CALENDAR_SCOPES=1." },
  { key: "google_ads", label: "Google Ads (read-only)", capability: "Daily spend, clicks and conversions per campaign.", env: "GOOGLE_ADS_DEVELOPER_TOKEN", note: "Needs an approved Google Ads developer token." },
  { key: "gbp", label: "Google Business Profile", capability: "Reads reviews into the lead timeline and Results.", env: "GOOGLE_BUSINESS_PROFILE_ENABLED", note: "Needs Business Profile API access approval." },
  { key: "linkedin_leadgen", label: "LinkedIn Lead Gen forms", capability: "Receives leads from LinkedIn lead forms.", env: "LINKEDIN_LEADGEN_ENABLED", note: "Needs LinkedIn Marketing Developer Platform approval." },
];
export const approvalProviderEnabled = (key: string): boolean => { const p = APPROVAL_PROVIDERS.find((x) => x.key === key); return Boolean(p && process.env[p.env]); };

const ADS: Record<string, { label: string; capability: string; env: string }> = {
  meta: { label: "Meta lead ads", capability: "Receives leads from Facebook / Instagram lead forms.", env: "LEADOS_META_APP_SECRET" },
  google: { label: "Google lead forms", capability: "Receives leads from Google Ads lead form extensions.", env: "LEADOS_GOOGLE_LEADS_KEY" },
};

const rowStatus = (s: string): CardStatus => (s === "verified" || s === "failed" || s === "pending" || s === "disconnected" ? s : "pending");

export async function listConnectionCards(orgId: string): Promise<ConnectionCard[]> {
  const [rows, ads, config] = await Promise.all([
    db.cosConnection.findMany({ where: { orgId }, orderBy: [{ provider: "asc" }, { createdAt: "asc" }] }),
    db.losAdConnection.findMany({ where: { orgId } }),
    db.losIntegrationConfig.findUnique({ where: { orgId } }),
  ]);
  const cards: ConnectionCard[] = [];
  for (const p of PROVIDERS) {
    const def = providerDef(p);
    const mine = rows.filter((r) => r.provider === p);
    const enabled = providerEnabled(p);
    if (mine.length === 0) {
      cards.push({ key: `oauth:${p}`, source: "oauth", provider: p, label: def.label, capability: def.capability, status: def.comingSoon ? "awaiting_approval" : enabled ? "not_connected" : "not_configured", id: null, accountLabel: null, lastCheckedAt: null, lastError: null, connectHref: enabled && !def.comingSoon ? `/api/os/connect/${p}/start` : null, keyInput: null, setupNote: enabled ? null : "Not configured on this server (client id / secret)." });
      continue;
    }
    for (const r of mine) cards.push({ key: `oauth:${p}:${r.id}`, source: "oauth", provider: p, label: def.label, capability: r.eligibilityNote ?? def.capability, status: rowStatus(r.status), id: r.id, accountLabel: r.accountLabel, lastCheckedAt: r.lastCheckedAt, lastError: r.lastError, connectHref: enabled ? `/api/os/connect/${p}/start` : null, keyInput: null, setupNote: null });
  }
  for (const [p, def] of Object.entries(KEY_PROVIDERS)) {
    const r = rows.find((x) => x.provider === p);
    cards.push({ key: `key:${p}`, source: "key", provider: p, label: def.label, capability: "Used by workflow steps.", status: r ? rowStatus(r.status) : "not_connected", id: r?.id ?? null, accountLabel: r?.accountLabel ?? null, lastCheckedAt: r?.lastCheckedAt ?? null, lastError: r?.lastError ?? null, connectHref: null, keyInput: { secretLabel: def.secretLabel, help: def.help }, setupNote: null });
  }
  for (const [p, def] of Object.entries(ADS)) {
    const r = ads.find((x) => x.provider === p);
    const on = Boolean(process.env[def.env]);
    cards.push({ key: `ads:${p}`, source: "ads", provider: p, label: def.label, capability: def.capability, status: !on ? "not_configured" : r ? (r.status === "connected" ? "verified" : r.status === "error" ? "failed" : r.status === "revoked" ? "disconnected" : "pending") : "not_connected", id: r?.id ?? null, accountLabel: null, lastCheckedAt: r?.updatedAt ?? null, lastError: null, connectHref: on ? "/app/campaigns?connect=" + p : null, keyInput: null, setupNote: on ? null : "Not configured on this server." });
  }
  const wsDomain = await db.cosWorkspace.findUnique({ where: { orgId }, select: { emailDomain: true, emailDomainStatus: true, updatedAt: true } });
  cards.push({ key: "config:email_domain", source: "config", provider: "email_domain", label: "Sending domain (outreach email)", capability: wsDomain?.emailDomain ? `Sequences and newsletters send from hello@${wsDomain.emailDomain}.` : "Add your own domain so outreach comes from your address instead of the platform default.", status: !process.env.RESEND_API_KEY ? "not_configured" : wsDomain?.emailDomainStatus === "verified" ? "verified" : wsDomain?.emailDomainStatus === "failed" ? "failed" : wsDomain?.emailDomain ? "pending" : "not_connected", id: wsDomain?.emailDomain ? orgId : null, accountLabel: wsDomain?.emailDomain ?? null, lastCheckedAt: wsDomain?.emailDomain ? wsDomain.updatedAt : null, lastError: null, connectHref: null, keyInput: null, setupNote: process.env.RESEND_API_KEY ? null : "RESEND_API_KEY is not configured on this server." });
  const resend = rows.find((r) => r.provider === "resend");
  cards.push({ key: "config:resend", source: "config", provider: "resend", label: "Newsletter sending (Resend)", capability: "Newsletter versions send through the platform's email transport to leads who agreed (purpose “newsletter”).", status: process.env.RESEND_API_KEY ? "verified" : "not_configured", id: resend?.id ?? null, accountLabel: resend?.accountLabel ?? null, lastCheckedAt: resend?.lastCheckedAt ?? null, lastError: resend?.lastError ?? null, connectHref: null, keyInput: null, setupNote: process.env.RESEND_API_KEY ? null : "RESEND_API_KEY is not configured on this server." });
  const slack = config ? (JSON.parse(config.config) as { slackWebhookUrl?: string }).slackWebhookUrl : undefined;
  cards.push({ key: "config:slack_notifications", source: "config", provider: "slack_notifications", label: "Slack notifications (new leads)", capability: "Pings a channel for every new lead.", status: slack ? "verified" : "not_connected", id: config?.orgId ?? null, accountLabel: slack ? "incoming webhook set" : null, lastCheckedAt: config?.updatedAt ?? null, lastError: null, connectHref: null, keyInput: null, setupNote: null });
  for (const a of APPROVAL_PROVIDERS) {
    const on = approvalProviderEnabled(a.key);
    cards.push({ key: `oauth:${a.key}`, source: "oauth", provider: a.key, label: a.label, capability: a.capability, status: on ? "not_connected" : "awaiting_approval", id: null, accountLabel: null, lastCheckedAt: null, lastError: null, connectHref: on ? (a.key === "google_calendar" ? "/api/os/connect/gsc/start" : null) : null, keyInput: null, setupNote: on ? null : a.note });
  }
  return cards;
}

/** Test = a live call. OAuth rows go through recheckConnection; key rows re-run the block's live test with the stored secret. */
export async function testConnection(actor: WorkActor, id: string) {
  if (!can(actor.role, "os.settings") && !can(actor.role, "automations.manage")) throw new WorkError("Forbidden.");
  const conn = await db.cosConnection.findFirst({ where: { id, orgId: actor.orgId } });
  if (!conn) throw new WorkError("Connection not found.");
  if (conn.status === "disconnected") throw new WorkError("Reconnect first — the stored credentials were destroyed.");
  if (isProvider(conn.provider)) return recheckConnection(actor.orgId, conn.provider, conn.id);
  if (!KEY_PROVIDERS[conn.provider] || !conn.accessTokenEnc) throw new WorkError("Nothing to test.");
  const { decryptField } = await import("@/lib/leados/crypto");
  let status = "verified", lastError: string | null = null, label: string | null = conn.accountLabel;
  try { label = await testKeyConnection(conn.provider, decryptField(conn.accessTokenEnc)); } catch (e) { status = "failed"; lastError = (e instanceof Error ? e.message : "Test failed.").slice(0, 300); }
  return db.cosConnection.update({ where: { id: conn.id }, data: { status, lastError, accountLabel: label, lastCheckedAt: new Date(), ...(status === "verified" ? { liveVerifiedAt: new Date() } : {}) } });
}

export async function disconnectConnection(actor: WorkActor, id: string) {
  if (!can(actor.role, "os.settings") && !can(actor.role, "automations.manage")) throw new WorkError("Forbidden.");
  const conn = await db.cosConnection.findFirst({ where: { id, orgId: actor.orgId } });
  if (!conn) throw new WorkError("Connection not found.");
  if (isProvider(conn.provider)) return disconnect(actor.orgId, conn.provider, actor.userId, conn.id);
  await db.cosConnection.update({ where: { id: conn.id }, data: { status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, lastError: null, lastCheckedAt: new Date() } });
}
