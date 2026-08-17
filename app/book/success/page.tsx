import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Booking Confirmed" };

async function getSession(id: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !id) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export default async function BookingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const session = await getSession(session_id ?? "");
  const paid = session?.payment_status === "paid";
  const label = session?.metadata?.program ? `${session.metadata.program} — ${session.metadata.tier}` : null;
  const maintenance = session?.metadata?.maintenance;
  const tookMaintenance = !!maintenance && maintenance !== "declined";

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(52,211,153,0.14),transparent_62%)]" />
      <div className="relative mx-auto max-w-[640px] text-center">
        <span className="mx-auto mb-6 flex h-[64px] w-[64px] items-center justify-center rounded-2xl bg-[rgba(52,211,153,0.14)] text-[34px] text-[#6EE7B7]">
          <Icon name={paid ? "check_circle" : "hourglass_top"} />
        </span>
        <h1 className="mb-4 text-[clamp(1.9rem,5vw,40px)] font-extrabold tracking-[-0.025em] text-white">
          {paid ? "You're booked!" : "Thanks — we're confirming your payment"}
        </h1>
        {label && <p className="mb-3 text-[15.5px] font-semibold text-[var(--color-brand-soft)]">{label}</p>}
        <p className="mb-8 text-[15.5px] leading-[1.65] text-[var(--color-muted)]">
          {paid
            ? `Your 50% onboarding deposit is received. We'll reach out within 1 business day to schedule your kickoff call. The onboarding balance is due at launch. ${tookMaintenance ? `Your monthly maintenance plan (${maintenance!.replace(" (rate locked at booking)", "")}) starts at kickoff, billed monthly in advance at the rate locked today.` : "You didn't add monthly maintenance — you can add it any time, at 15% above the rate quoted with your package."}`
            : "If your payment went through, you'll receive a Stripe receipt by email and we'll reach out within 1 business day. If it didn't, you can try again from the program page."}
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/" className="btn-ghost">Back to Home</Link>
          <Link href="/growth-audit" className="btn-primary">Start Your Growth Audit <Icon name="arrow_forward" className="text-[18px]" /></Link>
        </div>
      </div>
    </section>
  );
}
