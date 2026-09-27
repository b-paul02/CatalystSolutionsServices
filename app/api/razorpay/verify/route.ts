import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { handlePaymentEvent } from "@/lib/os/commercial";
import { normaliseRazorpayEvent, verifyRazorpayCheckout } from "@/lib/os/razorpay";

// WP-17 · the checkout success handler posts (order id, payment id, signature). A valid signature applies the payment
// with the SAME event id the webhook will use, so whichever arrives second is a no-op. The amount and notes come from
// what WE created the order with — never from the browser: we re-read them from the order via the payment entity the
// webhook carries; here we only confirm the signature and let the webhook carry the money facts unless the order is ours.
export async function POST(req: NextRequest) {
  try { await requireOrg(); } catch { return NextResponse.json({ error: "Sign in first." }, { status: 401 }); }
  let body: { orderId?: string; paymentId?: string; signature?: string; amountMinor?: number; currency?: string; notes?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const orderId = String(body.orderId ?? ""), paymentId = String(body.paymentId ?? ""), signature = String(body.signature ?? "");
  if (!/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !verifyRazorpayCheckout(orderId, paymentId, signature)) return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  // Fetch the payment from Razorpay so amount / currency / notes are the provider's, not the browser's.
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ ok: true, pending: true, note: "Verified; waiting for the provider's confirmation." });
  const payment = (await res.json()) as { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; notes?: Record<string, string> };
  if (payment.order_id !== orderId || payment.status !== "captured") return NextResponse.json({ ok: true, pending: true });
  const event = normaliseRazorpayEvent({ event: "payment.captured", payload: { payment: { entity: payment } } });
  const result = event ? await handlePaymentEvent("razorpay", event) : null;
  return NextResponse.json({ ok: true, pending: false, ...(result ?? {}) });
}
