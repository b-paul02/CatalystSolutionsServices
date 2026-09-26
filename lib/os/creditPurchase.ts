// AI-credit purchases. Separate from engagement invoices (CosCommercialRecord) and from lead-token packs
// (lib/leados/billing.ts) — three products, three ledgers, one signed webhook.
// Credits are issued ONLY by a signature-verified provider event bound to the expected order (session id, amount,
// currency, live/test mode, tenant). The success page reads status; it grants nothing. Refunds and disputes are
// reconciled against a TARGET computed from cumulative provider state, so duplicate, related and out-of-order events
// converge on the same answer and a credit can never be reversed twice.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { assertWritable, WorkError, type WorkActor } from "./work";
import { grantCredits, reverseOrderCredits } from "./credits";
import { notify } from "./notify";

const prod = () => process.env.NODE_ENV === "production";
export const stripeMode = (): "live" | "test" => (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : "test");

/** Packs a workspace may buy. Empty until an operator enters real commercial values; synthetic packs never sell in production. */
export async function availablePacks(market: string) {
  const packs = await db.cosCreditPack.findMany({ where: { active: true, OR: [{ market: null }, { market }], ...(prod() ? { synthetic: false } : {}) }, orderBy: { credits: "asc" } });
  return packs;
}
export const checkoutConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

export async function savePack(input: { label: string; credits: number; currency: string; amountMinor: number; market: string | null; synthetic: boolean }, createdBy: string | null) {
  if (!input.label.trim()) throw new WorkError("Name the pack.");
  if (!Number.isInteger(input.credits) || input.credits <= 0) throw new WorkError("Credits must be a whole number above zero.");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new WorkError("Enter the price.");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new WorkError("Currency must be a 3-letter code.");
  if (input.market && !["IN", "US"].includes(input.market)) throw new WorkError("Market is IN, US or blank.");
  if (input.synthetic && prod()) throw new WorkError("Synthetic packs cannot be created in production.");
  // packs are immutable once created (orders snapshot them anyway): change a price by retiring and adding
  return db.cosCreditPack.create({ data: { label: input.label.trim().slice(0, 80), credits: input.credits, currency: input.currency, amountMinor: input.amountMinor, market: input.market, synthetic: input.synthetic, active: true, createdBy } });
}
export const retirePack = (id: string) => db.cosCreditPack.update({ where: { id }, data: { active: false } });

/** Pack and price come from the server's row — the browser only names a pack id. */
export async function createCreditCheckout(actor: WorkActor, packId: string, origin: string, email: string): Promise<{ url: string; orderId: string }> {
  if (isStaffRole(actor.role) || !can(actor.role, "org.billing")) throw new WorkError("Only a workspace billing admin can buy credits.");
  await assertWritable(actor.orgId);
  if (!checkoutConfigured()) throw new WorkError("Card payments are not set up yet — ask your account lead about adding credits.");
  const org = await db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true, demo: true } });
  const pack = (await availablePacks(org?.market === "US" ? "US" : "IN")).find((p) => p.id === packId);
  if (!pack) throw new WorkError("That credit pack is not available.");
  const order = await db.cosCreditOrder.create({ data: { orgId: actor.orgId, userId: actor.userId, packId: pack.id, credits: pack.credits, currency: pack.currency, amountMinor: pack.amountMinor, providerMode: stripeMode(), demo: org?.demo ?? false } });
  const { stripePost } = await import("@/lib/leados/billing");
  let session: Record<string, unknown>;
  try {
    session = await stripePost("/checkout/sessions", new URLSearchParams({
      mode: "payment", client_reference_id: order.id, customer_email: email,
      success_url: `${origin}/app/settings/ai-credits?order=${order.id}`, cancel_url: `${origin}/app/settings/ai-credits?cancelled=${order.id}`,
      "metadata[kind]": "ai_credits", "metadata[orderId]": order.id, "metadata[orgId]": actor.orgId,
      // refund and dispute events arrive on the charge / payment intent, not the session
      "payment_intent_data[metadata][kind]": "ai_credits", "payment_intent_data[metadata][orderId]": order.id,
      "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": pack.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(pack.amountMinor),
      "line_items[0][price_data][product_data][name]": `${pack.credits} AI credits`,
    }));
  } catch (e) {
    await db.cosCreditOrder.update({ where: { id: order.id }, data: { status: "failed" } });
    throw new WorkError(`The payment page could not be opened (${(e as Error).message.slice(0, 120)}). You have not been charged.`);
  }
  await db.cosCreditOrder.update({ where: { id: order.id }, data: { providerSessionId: String(session.id) } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "ai_credits.checkout_created", entity: "CosCreditOrder", entityId: order.id, data: { credits: pack.credits, currency: pack.currency } });
  return { url: String(session.url), orderId: order.id };
}

type Order = NonNullable<Awaited<ReturnType<typeof db.cosCreditOrder.findUnique>>>;

/**
 * Bring the wallet in line with what the provider says about this payment.
 *   target reversed = all credits while a dispute is open or lost; otherwise credits × refunded ÷ paid (full refund ⇒ all).
 * Applying only the DIFFERENCE from what is already reversed makes every event idempotent, makes refund+dispute on the
 * same payment reverse once, and lets a won dispute restore exactly what its hold took.
 */
async function reconcileOrder(tx: Prisma.TransactionClient, order: Order) {
  if (!order.paidAt) return; // nothing was granted yet; the paid event will call this again
  const held = order.disputeStatus === "open" || order.disputeStatus === "lost";
  const target = held ? order.credits : order.refundedMinor >= order.amountMinor ? order.credits : Math.floor((order.credits * order.refundedMinor) / order.amountMinor);
  const delta = target - order.reversedCredits;
  if (delta > 0) await reverseOrderCredits(tx, { orgId: order.orgId, orderId: order.id, credits: delta, reason: held ? `Payment disputed (${order.disputeStatus})` : `Payment refunded (${order.refundedMinor}/${order.amountMinor} ${order.currency} minor units)` });
  if (delta < 0) await grantCredits({ orgId: order.orgId, kind: "purchased", amount: -delta, expiresAt: null, sourceRef: `dispute_won:${order.id}:${order.reversedCredits}>${target}`, reason: "Dispute resolved in our favour — held credits restored", orderId: order.id, demo: order.demo }, tx);
  const status = held ? "disputed" : order.refundedMinor >= order.amountMinor ? "refunded" : order.refundedMinor > 0 ? "part_refunded" : "paid";
  await tx.cosCreditOrder.update({ where: { id: order.id }, data: { reversedCredits: target, status } });
}

export type CreditEvent = { id: string; type: string; livemode?: boolean; data: { object: Record<string, unknown> } };
export type CreditEventResult = { appliedTo: "ai_credits" | "ai_credits_reversal" | "unmatched"; orgId: string | null; orderId: string | null; providerPaymentId: string | null; note: string | null };

const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Returns null when the event has nothing to do with an AI-credit order (another handler may own it). */
export async function handleCreditEvent(event: CreditEvent): Promise<CreditEventResult | null> {
  const obj = event.data.object as { id?: string; payment_status?: string; amount_total?: number; amount?: number; amount_refunded?: number; currency?: string; payment_intent?: unknown; status?: string; metadata?: Record<string, string> };
  const meta = obj.metadata ?? {};
  const pi = s(obj.payment_intent);
  const isSession = event.type.startsWith("checkout.session.");
  if (isSession && meta.kind !== "ai_credits") return null;
  const order = isSession
    ? (meta.orderId ? await db.cosCreditOrder.findUnique({ where: { id: meta.orderId } }) : null)
    : (pi ? await db.cosCreditOrder.findUnique({ where: { providerPaymentId: pi } }) : null) ?? (meta.kind === "ai_credits" && meta.orderId ? await db.cosCreditOrder.findUnique({ where: { id: meta.orderId } }) : null);
  if (!order) return isSession || meta.kind === "ai_credits" ? { appliedTo: "unmatched", orgId: null, orderId: null, providerPaymentId: pi, note: "AI-credit event for an order we do not have — needs manual review." } : null;
  const base = { orgId: order.orgId, orderId: order.id, providerPaymentId: pi ?? order.providerPaymentId };
  const flag = async (note: string): Promise<CreditEventResult> => {
    await notify({ orgId: order.orgId, audience: "staff", kind: "payment", title: `AI-credit payment needs review: ${note}`.slice(0, 190), href: "/admin/os/credits", dedupeKey: `ai-order-review:${event.id}` });
    return { ...base, appliedTo: "unmatched", note };
  };
  // live/test mode must match the order: a test-mode event can never credit a live order (or the reverse)
  if (event.livemode !== undefined && (event.livemode ? "live" : "test") !== order.providerMode) return flag("provider mode does not match the order");

  if (isSession) {
    if (obj.id !== order.providerSessionId || meta.orgId !== order.orgId) return flag("checkout session does not match the order");
    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      await db.cosCreditOrder.updateMany({ where: { id: order.id, status: "pending" }, data: { status: event.type.endsWith("expired") ? "expired" : "failed" } });
      return { ...base, appliedTo: "ai_credits", note: `Order ${event.type.endsWith("expired") ? "expired" : "payment failed"} — no credits issued.` };
    }
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return null;
    // "completed" with a delayed method is not money yet: stay pending until async_payment_succeeded
    if (obj.payment_status !== "paid") return { ...base, appliedTo: "ai_credits", note: "Checkout completed, payment still pending — no credits issued yet." };
    if (obj.amount_total !== order.amountMinor || obj.currency?.toUpperCase() !== order.currency) return flag("amount or currency does not match the order");
    const r = await db.$transaction(async (tx) => {
      const fresh = await tx.cosCreditOrder.update({ where: { id: order.id }, data: { paidAt: order.paidAt ?? new Date(), providerPaymentId: pi ?? order.providerPaymentId, status: ["pending", "failed", "expired"].includes(order.status) ? "paid" : order.status } });
      const g = await grantCredits({ orgId: order.orgId, kind: "purchased", amount: order.credits, expiresAt: null, sourceRef: `order:${order.id}`, reason: `Purchased ${order.credits} AI credits`, createdBy: order.userId, orderId: order.id, demo: order.demo }, tx);
      await reconcileOrder(tx, fresh); // a refund/dispute that arrived BEFORE this event is applied now
      return g;
    });
    if (!r.duplicate) await notify({ orgId: order.orgId, userId: order.userId, audience: "client", kind: "payment", title: `${order.credits} AI credits added`, href: "/app/settings/ai-credits", dedupeKey: `ai-order-paid:${order.id}` });
    return { ...base, appliedTo: "ai_credits", note: r.duplicate ? "Already granted for this order — nothing issued twice." : `Granted ${order.credits} credits.` };
  }

  if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
    if (event.type === "charge.refund.updated") return { ...base, appliedTo: "ai_credits_reversal", note: "Refund update noted; totals come from charge.refunded." };
    if (obj.currency?.toUpperCase() !== order.currency) return flag("refund currency does not match the order");
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "CosCreditOrder" WHERE id = ${order.id} FOR UPDATE`;
      const cur = await tx.cosCreditOrder.findUniqueOrThrow({ where: { id: order.id } });
      // amount_refunded is cumulative: taking the max makes late or repeated events harmless
      const fresh = await tx.cosCreditOrder.update({ where: { id: order.id }, data: { refundedMinor: Math.min(cur.amountMinor, Math.max(cur.refundedMinor, obj.amount_refunded ?? 0)) } });
      await reconcileOrder(tx, fresh);
    });
    await flag(`refund on order ${order.id.slice(-6)} reconciled`);
    return { ...base, appliedTo: "ai_credits_reversal", note: "Refund reconciled." };
  }

  if (event.type.startsWith("charge.dispute.")) {
    const next = event.type === "charge.dispute.closed" ? (obj.status === "won" || obj.status === "warning_closed" ? "won" : "lost") : "open";
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "CosCreditOrder" WHERE id = ${order.id} FOR UPDATE`;
      const cur = await tx.cosCreditOrder.findUniqueOrThrow({ where: { id: order.id } });
      // a closed dispute is final: a late "created"/"updated" must not reopen it
      if ((cur.disputeStatus === "won" || cur.disputeStatus === "lost") && next === "open") return;
      const fresh = await tx.cosCreditOrder.update({ where: { id: order.id }, data: { disputeStatus: next } });
      await reconcileOrder(tx, fresh);
    });
    await flag(`dispute ${next} on order ${order.id.slice(-6)}`);
    return { ...base, appliedTo: "ai_credits_reversal", note: `Dispute ${next}.` };
  }
  return null;
}

/** What the success page shows. Read-only: the buyer's own org, by order id. */
export async function orderStatus(orgId: string, orderId: string) {
  return db.cosCreditOrder.findFirst({ where: { id: orderId, orgId }, select: { id: true, status: true, credits: true, currency: true, amountMinor: true, createdAt: true, paidAt: true } });
}
