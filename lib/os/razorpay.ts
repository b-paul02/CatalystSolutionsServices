// WP-17 · Razorpay as the second payment provider, behind env vars RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
// RAZORPAY_WEBHOOK_SECRET. Chosen for INR workspaces; Stripe otherwise. Plain REST (no SDK). Razorpay webhooks are
// normalised into the Stripe-shaped event the shared handler already applies (same matching, same idempotency).
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";
export const razorpayConfigured = (): boolean => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
export const razorpayMode = (): "live" | "test" => (process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live") ? "live" : "test");
export const razorpayKeyId = (): string => process.env.RAZORPAY_KEY_ID ?? "";

/** Which provider a checkout for this currency uses. Null = online payment not available for it. */
export function paymentProviderFor(currency: string): "razorpay" | "stripe" | null {
  if (currency.toUpperCase() === "INR" && razorpayConfigured()) return "razorpay";
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) return "stripe";
  return null;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { description?: string } };
  if (!res.ok) throw new Error(json.error?.description ?? `Razorpay ${res.status}`);
  return json;
}

/** An order the hosted checkout collects against. `notes` carry the same keys Stripe metadata does. */
export async function createRazorpayOrder(o: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string }> {
  const j = await post("/orders", { amount: o.amountMinor, currency: o.currency.toUpperCase(), receipt: o.receipt.slice(0, 40), notes: o.notes });
  return { id: String(j.id) };
}

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** X-Razorpay-Signature = HMAC-SHA256(rawBody, webhook secret), hex. */
export const verifyRazorpayWebhook = (rawBody: string, header: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET): boolean => Boolean(secret && header && /^[0-9a-f]{64}$/i.test(header) && same(hmac(secret, rawBody), header.toLowerCase()));

/** Checkout success handler signature = HMAC-SHA256(`${orderId}|${paymentId}`, key secret). */
export const verifyRazorpayCheckout = (orderId: string, paymentId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET): boolean => Boolean(secret && /^[0-9a-f]{64}$/i.test(signature) && same(hmac(secret, `${orderId}|${paymentId}`), signature.toLowerCase()));

export type NormalisedEvent = { id: string; type: string; livemode?: boolean; data: { object: Record<string, unknown> } };
type RzpPayment = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; amount_refunded?: number; notes?: Record<string, string> };

/**
 * Razorpay → Stripe-shaped event. Event ids are deterministic per (kind, payment id) so the checkout verify route and
 * the webhook converge on ONE applied event.
 *   payment.captured → checkout.session.completed (object.id = order id, metadata = notes, payment_intent = payment id)
 *   refund.processed → charge.refunded (amount_refunded = the payment's cumulative total)
 *   payment.dispute.created/lost/won → charge.dispute.created/lost/won
 */
export function normaliseRazorpayEvent(raw: { event?: string; payload?: { payment?: { entity?: RzpPayment }; refund?: { entity?: { amount?: number; payment_id?: string; currency?: string } }; dispute?: { entity?: { payment_id?: string; amount?: number; currency?: string } } } }): NormalisedEvent | null {
  const p = raw.payload?.payment?.entity, mode = razorpayMode() === "live";
  switch (raw.event) {
    case "payment.captured": {
      if (!p?.id) return null;
      return { id: `rzp_pay:${p.id}`, type: "checkout.session.completed", livemode: mode, data: { object: { id: p.order_id ?? null, payment_status: "paid", amount_total: p.amount ?? null, currency: p.currency?.toLowerCase() ?? null, payment_intent: p.id, metadata: p.notes ?? {} } } };
    }
    case "payment.failed": {
      if (!p?.id) return null;
      return { id: `rzp_fail:${p.id}`, type: "checkout.session.async_payment_failed", livemode: mode, data: { object: { id: p.order_id ?? null, payment_status: "failed", amount_total: p.amount ?? null, currency: p.currency?.toLowerCase() ?? null, payment_intent: p.id, metadata: p.notes ?? {} } } };
    }
    case "refund.processed": {
      const r = raw.payload?.refund?.entity;
      if (!r?.payment_id) return null;
      return { id: `rzp_refund:${r.payment_id}:${p?.amount_refunded ?? r.amount ?? 0}`, type: "charge.refunded", livemode: mode, data: { object: { payment_intent: r.payment_id, amount_refunded: p?.amount_refunded ?? r.amount ?? 0, currency: (p?.currency ?? r.currency)?.toLowerCase() ?? null, metadata: p?.notes ?? {} } } };
    }
    case "payment.dispute.created": case "payment.dispute.lost": case "payment.dispute.won": case "payment.dispute.closed": {
      const d = raw.payload?.dispute?.entity;
      if (!d?.payment_id) return null;
      return { id: `rzp_dispute:${d.payment_id}:${raw.event.split(".").pop()}`, type: `charge.dispute.${raw.event.split(".").pop()}`, livemode: mode, data: { object: { payment_intent: d.payment_id, amount: d.amount ?? null, currency: d.currency?.toLowerCase() ?? null, metadata: p?.notes ?? {} } } };
    }
    default: return null;
  }
}
