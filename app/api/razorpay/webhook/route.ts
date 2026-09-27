import { NextRequest, NextResponse } from "next/server";
import { handlePaymentEvent } from "@/lib/os/commercial";
import { normaliseRazorpayEvent, verifyRazorpayWebhook } from "@/lib/os/razorpay";

// WP-17 · Razorpay → signed events. Verified against the RAW body, normalised, applied once per deterministic event id.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  let parsed: Parameters<typeof normaliseRazorpayEvent>[0];
  try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }
  const event = normaliseRazorpayEvent(parsed);
  if (!event) return NextResponse.json({ received: true, appliedTo: "ignored" });
  const result = await handlePaymentEvent("razorpay", event);
  return NextResponse.json({ received: true, ...result });
}
