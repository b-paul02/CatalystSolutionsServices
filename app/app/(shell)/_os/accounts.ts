"use server";

// Connected-account actions that are not an OAuth redirect: WordPress (application password, live-tested
// before it is accepted), the development-only test account, recheck, disconnect, GA4 property id.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { encryptField } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";
import { safeUrl } from "@/lib/os/automation/definition";
import { testAdapterEnabled } from "@/lib/os/adapters";
import { isProvider, recheckConnection, disconnect } from "@/lib/os/connectors";
import { syncAccessFromConnection } from "@/lib/os/engagement";

type State = { error?: string; ok?: string };
const str = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);
const done = (ok: string): State => { revalidatePath("/app/settings/workspace"); return { ok }; };

export async function accountConnectKey(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrg("os.settings").catch((e: unknown) => { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }); if ("error" in actor) return actor;
  const provider = str(form, "provider", 20);
  if (provider === "test") {
    if (!testAdapterEnabled()) return { error: "Test accounts are not available here." };
    const mode = str(form, "mode", 20) || "ok";
    await db.cosConnection.create({ data: { orgId: actor.orgId, provider: "test", accountType: "user", externalAccountId: `test-${mode}-${Date.now().toString(36)}`, accountLabel: `Test account (${mode.replace(/_/g, " ")})`, status: "verified", capabilities: ["publish", "analytics"], eligibilityNote: "Development only — nothing is posted anywhere.", accessTokenEnc: encryptField("test"), config: JSON.stringify({ mode }), createdById: actor.userId } });
    return done("Test account added.");
  }
  if (provider !== "wordpress") return { error: "Unknown account type." };
  let site: URL;
  try { site = safeUrl(str(form, "site", 300)); } catch { return { error: "Enter the blog’s https address." }; } // https only, no internal addresses
  const user = str(form, "user", 120), secret = str(form, "secret", 200);
  if (!user || !secret) return { error: "Enter the WordPress username and an application password." };
  const base = site.origin + site.pathname.replace(/\/+$/, ""), token = Buffer.from(`${user}:${secret}`).toString("base64");
  // live test BEFORE storing: who am I, and may I publish?
  let me: { id?: number; name?: string; capabilities?: Record<string, boolean> };
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: `Basic ${token}` }, redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: `WordPress refused the sign-in (${res.status}). Check the username and application password.` };
    me = await res.json();
  } catch { return { error: "Could not reach that site’s WordPress API." }; }
  const canPublish = Boolean(me.capabilities?.publish_posts);
  const data = { accountType: "site", accountLabel: `${site.hostname} (${me.name ?? user})`, status: "verified", lastError: null, lastCheckedAt: new Date(), liveVerifiedAt: new Date(), capabilities: canPublish ? ["publish"] : [], eligibilityNote: canPublish ? null : "This WordPress user cannot publish posts — use an Editor or Author account.", accessTokenEnc: encryptField(token), config: JSON.stringify({ site: base, user }) };
  const existing = await db.cosConnection.findFirst({ where: { orgId: actor.orgId, provider: "wordpress", externalAccountId: base } });
  const conn = existing ? await db.cosConnection.update({ where: { id: existing.id }, data }) : await db.cosConnection.create({ data: { ...data, orgId: actor.orgId, provider: "wordpress", externalAccountId: base, createdById: actor.userId } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "connection.verified", entity: "CosConnection", entityId: conn.id, data: { provider: "wordpress" } });
  await syncAccessFromConnection(actor.orgId, "wordpress", conn.id, "verified");
  return done(canPublish ? "Blog connected and tested." : "Connected, but this user cannot publish.");
}

export async function accountRecheck(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrg("os.settings").catch((e: unknown) => { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }); if ("error" in actor) return actor;
  const conn = await db.cosConnection.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId } });
  if (!conn) return { error: "Account not found." };
  if (!isProvider(conn.provider)) return done("This account type is tested when it is connected.");
  try {
    const r = await recheckConnection(actor.orgId, conn.provider, conn.id);
    await syncAccessFromConnection(actor.orgId, conn.provider, conn.id, r.status);
    return r.status === "verified" ? done("Working.") : { error: r.lastError ?? "The test failed — reconnect the account." };
  } catch (e) { return { error: (e as Error).message.slice(0, 200) }; }
}

export async function accountDisconnect(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrg("os.settings").catch((e: unknown) => { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }); if ("error" in actor) return actor;
  const conn = await db.cosConnection.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId } });
  if (!conn) return { error: "Account not found." };
  if (isProvider(conn.provider)) await disconnect(actor.orgId, conn.provider, actor.userId, conn.id);
  else await db.cosConnection.update({ where: { id: conn.id }, data: { status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, lastCheckedAt: new Date() } });
  // anything still scheduled for this account can no longer go out — say so now, not at publish time
  await db.cosPublication.updateMany({ where: { orgId: actor.orgId, connectionId: conn.id, status: "scheduled" }, data: { status: "cancelled", lastError: "The account was disconnected." } });
  await db.cosContentVariant.updateMany({ where: { orgId: actor.orgId, connectionId: conn.id, state: "scheduled" }, data: { state: "approved", scheduledAt: null } });
  await syncAccessFromConnection(actor.orgId, conn.provider, conn.id, "disconnected");
  return done("Disconnected. The stored access was destroyed.");
}

export async function ga4Property(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrg("os.settings").catch((e: unknown) => { if (e instanceof Error && e.name === "LosAuthError") return { error: e.message }; throw e; }); if ("error" in actor) return actor;
  const conn = await db.cosConnection.findFirst({ where: { id: str(form, "id", 60), orgId: actor.orgId, provider: "gsc" } });
  if (!conn) return { error: "Connect Google first." };
  const propertyId = str(form, "propertyId", 20);
  if (propertyId && !/^\d{5,15}$/.test(propertyId)) return { error: "The property ID is a number, e.g. 123456789." };
  const config = { ...(JSON.parse(conn.config ?? "{}") as Record<string, unknown>), ga4PropertyId: propertyId || undefined };
  await db.cosConnection.update({ where: { id: conn.id }, data: { config: JSON.stringify(config) } });
  return done(propertyId ? "Saved. Website sessions per campaign will sync on the next run." : "Removed.");
}
