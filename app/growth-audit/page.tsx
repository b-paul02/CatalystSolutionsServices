import type { Metadata } from "next";
import Icon from "@/components/Icon";
import Wizard from "./Wizard";

export const metadata: Metadata = {
  title: "Free Growth Audit",
  description:
    "Get a free, human-reviewed audit of your business's digital growth: specific findings, ideal customer profiles, and possible strategic routes. No pricing, no pitch.",
};

const steps = [
  { icon: "travel_explore", title: "We read your site", desc: "Enter your URL and we pull what your website already says — so you answer fewer questions." },
  { icon: "quiz", title: "A short adaptive intake", desc: "Around 5 minutes. The questions adapt to your business and the areas you care about." },
  { icon: "person_check", title: "Human-reviewed report", desc: "AI drafts the analysis; a consultant reviews and signs off every report before it reaches you. Ready within 1 business day." },
];

const included = [
  "Specific, evidence-backed findings from your site and answers",
  "2–3 ideal customer profiles with trigger events and channels",
  "2–3 strategic routes with honest effort levels and timelines",
  "Quick wins you can do yourself inside 30 days",
];

export default function GrowthAuditPage() {
  return (
    <>
      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_10%,rgba(124,58,237,0.25),transparent_60%)]" />
        <div className="relative mx-auto max-w-[760px] text-center">
          <span className="badge mb-6"><span className="badge-dot anim-pulse" />Free · Human-reviewed · No pitch</span>
          <h1 className="mb-5 text-[clamp(2.2rem,6vw,52px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">
            Get Your Free{" "}
            <span className="bg-gradient-to-r from-[#A855F7] via-[#C4B5FD] to-[#60A5FA] bg-clip-text text-transparent">Growth Snapshot</span>
          </h1>
          <p className="mx-auto mb-10 max-w-[560px] text-[17px] leading-[1.62] text-[var(--color-muted)]">
            A short audit of your business&apos;s digital growth: what&apos;s working, what&apos;s leaking, who your best
            customers are, and the routes you could take next — including what you can do yourself.
          </p>
        </div>
        <div className="relative"><Wizard /></div>
      </section>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-[1000px]">
          <div className="mb-12 grid gap-[18px] sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.title} className="card-i">
                <span className="icon-chip mb-4 h-11 w-11 text-[23px]"><Icon name={s.icon} /></span>
                <h3 className="mb-[7px] text-[16px] font-semibold text-white">{s.title}</h3>
                <p className="text-[13.5px] leading-[1.55] text-[var(--color-faint)]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="card">
            <h2 className="mb-4 text-[18px] font-bold text-white">What your report includes</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {included.map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-[var(--color-muted)]">
                  <Icon name="check_circle" className="mt-0.5 text-[18px] text-[var(--color-brand-soft)]" />{i}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-white/5 pt-4 text-[13px] text-[var(--color-faint)]">
              No prices, no packages, no obligation. One optional link at the end to book a free 30-minute session if you want to talk it through.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
