"use client";

import { useEffect, useState } from "react";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

// Loads checkout.js only here; the success handler posts the signature to our verify route, then returns.
export default function RazorpayCheckout({ keyId, orderId, amountMinor, currency, description, email, backHref }: { keyId: string; orderId: string; amountMinor: number; currency: string; description: string; email: string; backHref: string }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "verifying" | "done" | "pending" | "error">("idle");
  useEffect(() => {
    if (window.Razorpay) { setReady(true); return; }
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true; s.onload = () => setReady(true); document.head.appendChild(s);
  }, []);
  const open = () => {
    if (!window.Razorpay) return;
    const rzp = new window.Razorpay({
      key: keyId, order_id: orderId, amount: amountMinor, currency, name: "CatalystGrowthOS", description, prefill: { email },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setState("verifying");
        try {
          const res = await fetch("/api/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }) });
          const j = (await res.json()) as { ok?: boolean; pending?: boolean };
          setState(res.ok ? (j.pending ? "pending" : "done") : "error");
        } catch { setState("error"); }
      },
    });
    rzp.open();
  };
  return (
    <div className="mt-4">
      {state === "idle" && <button type="button" disabled={!ready} onClick={open} className="w-full rounded-lg bg-[var(--los-brand)] px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50">{ready ? "Pay now" : "Loading checkout…"}</button>}
      {state === "verifying" && <p role="status">Verifying your payment…</p>}
      {state === "done" && <p role="status" className="text-[var(--los-success)]"><b>Payment confirmed.</b> <a className="underline" href={backHref}>Back</a></p>}
      {state === "pending" && <p role="status">Payment received; the provider is confirming it. It will show as paid shortly. <a className="underline" href={backHref}>Back</a></p>}
      {state === "error" && <p role="alert" className="text-[var(--los-danger)]">We could not verify that payment. If money left your account it will be reconciled by the provider&apos;s notification; nothing is charged twice. <a className="underline" href={backHref}>Back</a></p>}
      <p className="mt-3 text-[12px] text-[var(--los-faint)]"><a className="underline" href={backHref}>Cancel and go back</a></p>
    </div>
  );
}
