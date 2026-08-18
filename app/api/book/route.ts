import { NextRequest, NextResponse } from "next/server";
import { programBySlug, isBookable, setupAmount, processingFeeRate, addOnByName, maintenanceLaterUplift } from "@/lib/programs";
import { db } from "@/lib/audit/db";
import { parsePlanProgram, planExpired } from "@/lib/customPresets";

// Creates a Stripe Checkout session for a 50% onboarding deposit plus any
// selected add-ons (INR for Indian visitors, USD otherwise). One-time add-on
// components are charged in full at booking; monthly components are recorded in
// metadata and billed with the managed service from kickoff. Google Pay / Apple
// Pay buttons appear automatically in Checkout on supported devices.
// Amounts are always recomputed server-side from lib/programs — never trusted
// from the client. ponytail: plain REST call, no stripe SDK dependency.
export async function POST(req: NextRequest) {
  let body: { slug?: string; plan?: string; tier?: number; market?: string; name?: string; email?: string; phone?: string; company?: string; addOns?: string[]; maintenance?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { slug = "", plan: planToken = "", tier: tierIndex = -1, market, name = "", email = "", phone = "", company = "", addOns: selected = [], maintenance = false } = body;

  // Custom plan bookings (/plans/[token]) price from the stored plan JSON;
  // catalogue bookings price from lib/programs. Amounts are server-side either way.
  let program = programBySlug[slug];
  if (planToken && typeof planToken === "string") {
    const plan = await db.customPlan.findUnique({ where: { token: planToken } });
    const parsed = plan && !planExpired(plan) ? parsePlanProgram(plan.json) : null;
    if (!parsed) return NextResponse.json({ error: "This plan is no longer available — please get in touch." }, { status: 400 });
    if (market !== plan!.market) return NextResponse.json({ error: "Invalid market." }, { status: 400 });
    program = parsed;
  }
  const tier = program?.tiers[Number(tierIndex)];
  if (!program || !tier || !isBookable(tier)) return NextResponse.json({ error: "This package can't be booked online." }, { status: 400 });
  if (market !== "in" && market !== "us") return NextResponse.json({ error: "Invalid market." }, { status: 400 });
  if (!name.trim() || !phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please fill in your name, a valid email, and phone." }, { status: 400 });
  }
  if (!Array.isArray(selected) || selected.length > 30 || selected.some((n) => typeof n !== "string")) {
    return NextResponse.json({ error: "Invalid add-on selection." }, { status: 400 });
  }
  const chosen = [...new Set(selected)].map((n) => addOnByName[n]);
  if (chosen.some((a) => !a || (!a.setup && !a.monthly))) {
    return NextResponse.json({ error: "Invalid add-on selection." }, { status: 400 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Online payment isn't configured yet — please book a call instead." }, { status: 503 });
  }

  // All amounts in minor units (paise/cents): amount × 100 × pct/100 = amount × pct.
  // Catalogue programs are always 50% at booking; custom plans can be 100%.
  const pct = program.upfrontPct === 100 ? 100 : 50;
  const deposit = setupAmount(tier.setup![market]) * pct;
  const currency = market === "in" ? "inr" : "usd";
  const origin = req.nextUrl.origin;

  const params = new URLSearchParams({
    mode: "payment",
    customer_email: email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(deposit),
    "line_items[0][price_data][product_data][name]": `${program.name} — ${tier.label}: ${tier.name}`,
    "line_items[0][price_data][product_data][description]":
      pct === 100 ? "Full payment at booking." : "50% onboarding deposit — balance due at launch.",
    "metadata[program]": planToken ? `${program.name} (custom plan ${planToken})` : program.name,
    "metadata[tier]": `${tier.label}: ${tier.name}`,
    "metadata[market]": market,
    "metadata[name]": name.slice(0, 200),
    "metadata[phone]": phone.slice(0, 50),
    "metadata[company]": company.slice(0, 200),
    success_url: `${origin}/book/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: planToken
      ? `${origin}/book?plan=${planToken}&tier=${tierIndex}&canceled=1`
      : `${origin}/book?slug=${slug}&tier=${tierIndex}&canceled=1`,
  });

  // One-time add-on components: charged in full now, each as its own line item.
  let li = 1;
  let addOnTotal = 0;
  for (const a of chosen) {
    if (!a.setup) continue;
    const amt = a.setup[market] * 100;
    addOnTotal += amt;
    params.set(`line_items[${li}][quantity]`, "1");
    params.set(`line_items[${li}][price_data][currency]`, currency);
    params.set(`line_items[${li}][price_data][unit_amount]`, String(amt));
    params.set(`line_items[${li}][price_data][product_data][name]`, `Add-on: ${a.name}`);
    if (a.monthly) params.set(`line_items[${li}][price_data][product_data][description]`, "One-time setup — monthly component billed with your managed service.");
    li++;
  }

  // Optional maintenance plan: opt-in, never charged at checkout — recorded for the kickoff invoice.
  params.set(
    "metadata[maintenance]",
    maintenance === true && tier.monthly
      ? `${tier.monthly[market]} (rate locked at booking)`
      : `declined (+${maintenanceLaterUplift * 100}% if added later)`
  );

  // Monthly components (incl. monthly-only add-ons): not charged here; recorded for the kickoff invoice.
  const monthly = chosen.filter((a) => a.monthly);
  if (monthly.length) {
    params.set("metadata[monthly_addons]", monthly.map((a) => `${a.name} @ ${a.monthly![market]}/mo`).join("; ").slice(0, 490));
  }

  // Processing fee on everything charged today.
  const feeRate = processingFeeRate[market];
  const fee = Math.round((deposit + addOnTotal) * feeRate);
  params.set(`line_items[${li}][quantity]`, "1");
  params.set(`line_items[${li}][price_data][currency]`, currency);
  params.set(`line_items[${li}][price_data][unit_amount]`, String(fee));
  params.set(`line_items[${li}][price_data][product_data][name]`, `Payment processing fee (${feeRate * 100}%)`);

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
