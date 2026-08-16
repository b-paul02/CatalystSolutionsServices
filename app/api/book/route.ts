import { NextRequest, NextResponse } from "next/server";
import { programBySlug, isBookable, setupAmount } from "@/lib/programs";

// Creates a Stripe Checkout session for a 50% onboarding deposit (INR for Indian
// visitors, USD otherwise). Google Pay / Apple Pay buttons appear automatically in
// Checkout on supported devices — no configuration here.
// Amount is always recomputed server-side from lib/programs — never trusted from the client.
// ponytail: plain REST call, no stripe SDK dependency for one endpoint.
export async function POST(req: NextRequest) {
  let body: { slug?: string; tier?: number; market?: string; name?: string; email?: string; phone?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { slug = "", tier: tierIndex = -1, market, name = "", email = "", phone = "", company = "" } = body;
  const program = programBySlug[slug];
  const tier = program?.tiers[Number(tierIndex)];
  if (!program || !tier || !isBookable(tier)) return NextResponse.json({ error: "This package can't be booked online." }, { status: 400 });
  if (market !== "in" && market !== "us") return NextResponse.json({ error: "Invalid market." }, { status: 400 });
  if (!name.trim() || !phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please fill in your name, a valid email, and phone." }, { status: 400 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Online payment isn't configured yet — please book a call instead." }, { status: 503 });
  }

  // 50% of onboarding, in minor units (paise/cents): amount × 100 / 2 = amount × 50.
  const unitAmount = setupAmount(tier.setup![market]) * 50;
  const currency = market === "in" ? "inr" : "usd";
  const origin = req.nextUrl.origin;

  const params = new URLSearchParams({
    mode: "payment",
    customer_email: email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(unitAmount),
    "line_items[0][price_data][product_data][name]": `${program.name} — ${tier.label}: ${tier.name}`,
    "line_items[0][price_data][product_data][description]": "50% onboarding deposit — balance due at launch.",
    "metadata[program]": program.name,
    "metadata[tier]": `${tier.label}: ${tier.name}`,
    "metadata[market]": market,
    "metadata[name]": name.slice(0, 200),
    "metadata[phone]": phone.slice(0, 50),
    "metadata[company]": company.slice(0, 200),
    success_url: `${origin}/book/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/book?slug=${slug}&tier=${tierIndex}&canceled=1`,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const session = await res.json();
  if (!res.ok || !session.url) {
    console.error("Stripe checkout error:", session.error?.message ?? session);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again or book a call." }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
