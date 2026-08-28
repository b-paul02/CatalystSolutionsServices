// Stripe billing: token packs (one-time) and package subscriptions.
// Plain REST with inline price_data (repo pattern — no SDK, no product catalog).
// Payment confirmation happens on the success redirect: the server fetches the
// session and credits idempotently (ledger refId = session id). No webhook
// secret needed. ponytail: add the Stripe webhook if reconciliation ever lags.
import { db } from "@/lib/audit/db";
import { creditTokens } from "./tokens";
import { APP_URL } from "./email";
import { logLosAudit } from "./audit";

const STRIPE = "https://api.stripe.com/v1";

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return k;
}

export type TokenPack = { id: string; tokens: number; label: string; amountMinor: number };

// Placeholder launch pricing — adjust freely; the ledger records tokens, not money.
export const TOKEN_PACKS: Record<"IN" | "US", TokenPack[]> = {
  IN: [
    { id: "in-1k", tokens: 1_000, label: "Starter", amountMinor: 4_000_00 },
    { id: "in-5k", tokens: 5_000, label: "Growth", amountMinor: 18_000_00 },
    { id: "in-20k", tokens: 20_000, label: "Scale", amountMinor: 64_000_00 },
  ],
  US: [
    { id: "us-1k", tokens: 1_000, label: "Starter", amountMinor: 79_00 },
    { id: "us-5k", tokens: 5_000, label: "Growth", amountMinor: 349_00 },
    { id: "us-20k", tokens: 20_000, label: "Scale", amountMinor: 1_199_00 },
  ],
};

export type Package = { id: string; label: string; monthlyMinor: Record<"IN" | "US", number> | null; blurb: string; selfServe: boolean };

export const PACKAGES: Package[] = [
  { id: "lead_manager", label: "Lead Manager", monthlyMinor: null, blurb: "Imports, pipeline, campaigns, basic reporting. Included.", selfServe: false },
  { id: "growth", label: "Growth", monthlyMinor: { IN: 7_999_00, US: 99_00 }, blurb: "B2B discovery, sequences, integrations, priority support.", selfServe: true },
  { id: "managed_leads", label: "Managed Leads", monthlyMinor: null, blurb: "Contracted daily lead delivery with replacement terms. Talk to us.", selfServe: false },
  { id: "agency", label: "Agency", monthlyMinor: { IN: 24_999_00, US: 299_00 }, blurb: "Multiple client workspaces, central oversight, white-label reports.", selfServe: true },
  { id: "enterprise", label: "Enterprise", monthlyMinor: null, blurb: "SSO, custom retention, API limits, audit exports. Talk to us.", selfServe: false },
];

async function stripePost(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe ${res.status}`);
  return json;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE}${path}`, { headers: { Authorization: `Bearer ${key()}` } });
  const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe ${res.status}`);
  return json;
}

export async function createTokenCheckout(orgId: string, packId: string, email: string): Promise<string> {
  const org = await db.losOrg.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Org not found.");
  const market = org.market === "US" ? "US" : "IN";
  const pack = TOKEN_PACKS[market].find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack.");
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${APP_URL}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/settings/billing`,
    customer_email: email,
    "metadata[kind]": "leados_tokens",
    "metadata[orgId]": orgId,
    "metadata[tokens]": String(pack.tokens),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": market === "US" ? "usd" : "inr",
    "line_items[0][price_data][unit_amount]": String(pack.amountMinor),
    "line_items[0][price_data][product_data][name]": `LeadOS tokens — ${pack.label} (${pack.tokens.toLocaleString()} tokens)`,
  });
  const session = await stripePost("/checkout/sessions", params);
  return String(session.url);
}

export async function createSubscriptionCheckout(orgId: string, packageId: string, email: string): Promise<string> {
  const org = await db.losOrg.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Org not found.");
  const market = org.market === "US" ? "US" : "IN";
  const pkg = PACKAGES.find((p) => p.id === packageId && p.selfServe && p.monthlyMinor);
  if (!pkg) throw new Error("This package isn't self-serve — contact us.");
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${APP_URL}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/settings/billing`,
    customer_email: email,
    "metadata[kind]": "leados_subscription",
    "metadata[orgId]": orgId,
    "metadata[package]": pkg.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": market === "US" ? "usd" : "inr",
    "line_items[0][price_data][unit_amount]": String(pkg.monthlyMinor![market]),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `LeadOS ${pkg.label} plan`,
  });
  const session = await stripePost("/checkout/sessions", params);
  return String(session.url);
}

/** Success-redirect settlement: fetch session, credit/record idempotently. */
export async function settleCheckoutSession(orgId: string, sessionId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) return { ok: false, message: "Invalid session." };
  const session = (await stripeGet(`/checkout/sessions/${sessionId}`)) as {
    payment_status?: string;
    status?: string;
    subscription?: string;
    metadata?: { kind?: string; orgId?: string; tokens?: string; package?: string };
  };
  if (session.metadata?.orgId !== orgId) return { ok: false, message: "Session does not belong to this organization." };
  if (session.payment_status !== "paid") return { ok: false, message: "Payment not completed yet." };

  if (session.metadata.kind === "leados_tokens") {
    const tokens = parseInt(session.metadata.tokens ?? "0", 10);
    if (!(tokens > 0)) return { ok: false, message: "Bad session metadata." };
    const already = await db.losTokenLedger.findFirst({ where: { orgId, refId: sessionId } });
    if (already) return { ok: true, message: "Purchase already credited." };
    await creditTokens({ orgId, amount: tokens, kind: "purchase", refId: sessionId, note: "Token pack purchase" });
    await logLosAudit({ orgId, actorType: "system", action: "billing.tokens_purchased", entity: "LosTokenLedger", data: { tokens, sessionId } });
    return { ok: true, message: `${tokens.toLocaleString()} tokens added. Thank you!` };
  }
  if (session.metadata.kind === "leados_subscription") {
    await db.losSubscription.upsert({
      where: { orgId },
      update: { stripeSubscriptionId: session.subscription ?? null, package: session.metadata.package ?? "growth", status: "active" },
      create: { orgId, stripeSubscriptionId: session.subscription ?? null, package: session.metadata.package ?? "growth", status: "active" },
    });
    await logLosAudit({ orgId, actorType: "system", action: "billing.subscribed", entity: "LosSubscription", data: { package: session.metadata.package } });
    return { ok: true, message: `You're on the ${session.metadata.package} plan.` };
  }
  return { ok: false, message: "Unknown session type." };
}

/** Refresh subscription status from Stripe (called on billing page views). */
export async function syncSubscription(orgId: string): Promise<void> {
  const sub = await db.losSubscription.findUnique({ where: { orgId } });
  if (!sub?.stripeSubscriptionId) return;
  try {
    const remote = (await stripeGet(`/subscriptions/${sub.stripeSubscriptionId}`)) as { status?: string; current_period_end?: number };
    await db.losSubscription.update({
      where: { orgId },
      data: {
        status: remote.status === "active" || remote.status === "trialing" ? "active" : remote.status === "past_due" ? "past_due" : "canceled",
        currentPeriodEnd: remote.current_period_end ? new Date(remote.current_period_end * 1000) : null,
      },
    });
  } catch {
    // transient Stripe errors never break the billing page
  }
}

export async function currentPackage(orgId: string): Promise<string> {
  const sub = await db.losSubscription.findUnique({ where: { orgId } });
  return sub && sub.status === "active" ? sub.package : "lead_manager";
}
