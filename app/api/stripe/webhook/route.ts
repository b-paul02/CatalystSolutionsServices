import { NextRequest, NextResponse } from "next/server";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/os/commercial";

// Stripe → signed events. Authoritative payment confirmation: works even when the buyer never
// returns to the success page. Verified against the RAW body, applied exactly once per event id.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: { id?: string; type?: string; livemode?: boolean; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }
  if (!event.id || !event.type || !event.data?.object) return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  // a thrown error → 500 → Stripe retries; the claim row was rolled back so the retry can apply
  const result = await handleStripeEvent({ id: event.id, type: event.type, livemode: event.livemode, data: { object: event.data.object } });
  return NextResponse.json({ received: true, ...result });
}
