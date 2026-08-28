import type { Metadata } from "next";
import Icon from "@/components/Icon";
import ContactForm from "@/components/ContactForm";
import { contactAssurances } from "@/lib/content";

export const metadata: Metadata = { title: "Contact" };

const channels = [
  { icon: "mail", tone: "brand", label: "Email us", value: "info@catalystsolutionservices.com" },
  { icon: "calendar_month", tone: "brand", label: "Book a slot", value: "calendly.com/catalyst-growth" },
  { icon: "schedule", tone: "success", label: "Response time", value: "We reply within 1 business day" },
];

export default function ContactPage() {
  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-16 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_25%_10%,rgba(124,58,237,0.26),transparent_60%),radial-gradient(ellipse_40%_50%_at_90%_30%,rgba(59,130,246,0.12),transparent_60%)]" />
      <div className="relative mx-auto grid max-w-[1140px] items-start gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="pt-2">
          <span className="badge mb-6"><span className="badge-dot" />Book a Call</span>
          <h1 className="mb-[18px] text-[clamp(2rem,6vw,46px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">Let's Build Your Growth System</h1>
          <p className="mb-9 text-[16.5px] leading-[1.62] text-[var(--color-muted)]">Tell us where you are and where you want to go. We'll come back with a clear, practical next step — no pressure.</p>
          <div className="flex flex-col gap-[18px]">
            {channels.map((c) => (
              <div key={c.label} className="flex items-center gap-3.5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${c.tone === "success" ? "border-[rgba(52,211,153,0.2)] bg-[rgba(52,211,153,0.12)] text-[#6EE7B7]" : "border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.12)] text-[var(--color-brand-soft)]"}`}><Icon name={c.icon} className="text-[22px]" /></span>
                <div><div className="text-xs text-[#6b6b7a]">{c.label}</div><div className="text-[15px] font-semibold text-white">{c.value}</div></div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.7),rgba(12,11,22,0.7))] p-5">
            <div className="flex flex-col gap-[11px]">
              {contactAssurances.map((a) => (
                <div key={a} className="flex items-center gap-2.5">
                  <Icon name="check_circle" className="text-[18px] text-[#6EE7B7]" />
                  <span className="text-[13.5px] text-[#B8B8C6]">{a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(160deg,rgba(30,22,52,0.85),rgba(13,11,24,0.9))] p-6 shadow-[0_28px_70px_rgba(0,0,0,0.5),0_0_50px_rgba(124,58,237,0.15)] sm:p-[34px]">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
