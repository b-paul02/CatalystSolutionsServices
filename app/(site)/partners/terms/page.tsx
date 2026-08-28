import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Partner Program Terms",
  description: "The terms of the Catalyst Sales Partner Program: commission rules, opportunity protection, payment timing, taxes, cancellations, and conflict handling.",
};

// ponytail: plain summary page — the signed partner agreement remains the binding document
const SECTIONS = [
  {
    id: "commission",
    title: "Commission rules",
    body: "The advertised commission is 30% of the onboarding fee collected by Catalyst. Your actual rate is set in your partner agreement when you join and applies only to opportunities you registered and that Catalyst approved. Commission is calculated on fees Catalyst actually receives, net of refunds and discounts agreed with the client.",
  },
  {
    id: "protection",
    title: "Opportunity protection",
    body: "Approved opportunities are protected for 90 days from the date of registration and may be extended while the opportunity is active. If the same business is registered by more than one partner, protection belongs to the first approved registration.",
  },
  {
    id: "payment",
    title: "Payment timing",
    body: "Commission becomes payable after Catalyst receives the corresponding client payment. Milestone-billed engagements pay commission proportionately as each client payment is collected. Payouts are made to the account named in your partner agreement.",
  },
  {
    id: "taxes",
    title: "Taxes",
    body: "Commission is stated exclusive of taxes. You are responsible for your own income tax, GST or sales tax registration where applicable, and any withholding required by law is deducted from payouts. Catalyst issues a statement for each payout.",
  },
  {
    id: "cancellations",
    title: "Cancellations and refunds",
    body: "If a client cancels or a payment is refunded before Catalyst has collected it, no commission is due on that payment. Commission already paid on a later-refunded payment may be offset against your next payout.",
  },
  {
    id: "conflicts",
    title: "Conflict handling",
    body: "Where two partners claim the same opportunity, or an opportunity overlaps with an existing Catalyst client or an inbound lead Catalyst already holds, Catalyst decides attribution based on the registration record and first contact. Decisions are shared with the partners involved in writing.",
  },
];

export default function PartnerTermsPage() {
  return (
    <section className="px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-[760px]">
        <span className="badge mb-6"><span className="badge-dot" />Sales Partner Program</span>
        <h1 className="mb-4 text-[clamp(1.9rem,4.5vw,40px)] font-extrabold tracking-[-0.03em] text-white">Partner Program Terms</h1>
        <p className="mb-10 text-[15px] leading-[1.65] text-[#c2c6d1]">
          This page summarises how the Sales Partner Program works. The partner agreement you sign on acceptance is
          the binding document; where the two differ, the agreement applies. The approved partner price book is
          shared after acceptance.
        </p>

        <div className="grid gap-8">
          {SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="mb-2 text-[19px] font-bold text-white">{s.title}</h2>
              <p className="text-[15px] leading-[1.7] text-[#c2c6d1]">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-[var(--color-line)] pt-6 text-[13.5px] text-[#9a9aac]">
          Questions about these terms? <Link href="/contact" className="underline hover:text-white">Contact us</Link> or
          see the <Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
        </p>
      </div>
    </section>
  );
}
