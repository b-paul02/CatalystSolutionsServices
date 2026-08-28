import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import { aboutPillars, aboutHow, aboutNetwork, aboutWhy } from "@/lib/content";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_30%_0%,rgba(124,58,237,0.26),transparent_62%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="badge mb-6"><span className="badge-dot" />About Catalyst Solutions Services</span>
            <h1 className="mb-5 text-[clamp(2.2rem,6vw,52px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">We Are a Growth Enablement Agency</h1>
            <p className="mb-4 text-lg leading-[1.62] text-[var(--color-muted)]">Catalyst Solutions Services helps businesses connect the dots between strategy, technology, marketing, automation, and measurable execution.</p>
            <p className="text-base leading-[1.62] text-[var(--color-faint)]">We're built for businesses that want clarity, not chaos — and a single partner who can plan, build, market, and scale alongside them.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {aboutPillars.map((p) => (
              <div key={p.label} className="flex flex-col gap-[9px] rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.7),rgba(12,11,22,0.7))] p-5">
                <span className="icon-chip h-9 w-9 border-0 text-[20px]"><Icon name={p.icon} /></span>
                <span className="text-sm font-semibold text-white">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-[linear-gradient(180deg,#070510,#0a0716)] px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <div className="eyebrow mb-3.5">Our Mission</div>
            <h2 className="text-3xl font-extrabold leading-[1.14] tracking-[-0.025em] text-white">Make Growth Clear and Achievable</h2>
          </div>
          <p className="self-center text-lg leading-[1.68] text-[#B8B8C6]">We exist to remove the chaos from growth. Too many businesses juggle disconnected agencies, tools, and tactics that never add up. Our mission is to give you one strategic partner who brings the whole picture together — strategy first, execution that follows, and reporting that proves it worked.</p>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3.5">How We Work</div>
          <h2 className="mb-9 text-3xl font-extrabold tracking-[-0.025em] text-white">Principles That Guide Every Engagement</h2>
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {aboutHow.map((h) => (
              <div key={h.title} className="card">
                <span className="icon-chip mb-4 h-[46px] w-[46px] text-[24px]"><Icon name={h.icon} /></span>
                <h3 className="mb-2 text-[17px] font-semibold text-white">{h.title}</h3>
                <p className="text-[13.5px] leading-[1.58] text-[var(--color-faint)]">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-2 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="eyebrow mb-3.5">Our Expert Network</div>
            <h2 className="mb-4 text-3xl font-extrabold leading-[1.14] tracking-[-0.025em] text-white">Vetted Specialists for Every Function</h2>
            <p className="mb-5 text-base leading-[1.64] text-[var(--color-muted)]">Instead of stretching generalists across everything, we assemble the right specialists for your project — strategists, designers, developers, marketers, automation engineers, and analysts who are senior in their craft.</p>
            <p className="text-base leading-[1.64] text-[var(--color-muted)]">It's AI-enabled but human-led: technology gives us leverage, while experienced people own the strategy, judgment, and outcomes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {aboutNetwork.map((n) => (
              <div key={n.role} className="flex items-center gap-[9px] rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(24,19,42,0.7),rgba(12,11,22,0.7))] px-4 py-3">
                <span className="icon-chip h-[30px] w-[30px] border-0 text-[17px]"><Icon name={n.icon} /></span>
                <span className="text-[13.5px] font-medium text-[var(--color-fg)]">{n.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-2 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="eyebrow mb-3.5">Why Businesses Choose Us</div>
          <h2 className="mb-9 text-3xl font-extrabold tracking-[-0.025em] text-white">One Partner, Built Around Your Growth</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aboutWhy.map((w) => (
              <div key={w} className="flex items-start gap-3.5 rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(22,18,38,0.7),rgba(12,11,22,0.7))] p-[22px]">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]"><Icon name="check" className="text-[18px]" /></span>
                <span className="text-[14.5px] font-medium leading-[1.45] text-[var(--color-fg)]">{w}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  );
}
