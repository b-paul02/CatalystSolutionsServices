import Link from "next/link";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import { heroStats, bars, logos, problems, services, steps, whyPoints } from "@/lib/content";

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:px-8 lg:pt-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_25%_20%,rgba(124,58,237,0.28),transparent_60%),radial-gradient(ellipse_50%_60%_at_90%_30%,rgba(59,130,246,0.14),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.05)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_30%,#000,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="badge mb-6">
              <span className="badge-dot anim-pulse" />
              AI-Enabled Digital Growth Agency
            </span>
            <h1 className="mb-[22px] text-[clamp(2.6rem,7vw,62px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-white">
              We Enable Businesses to{" "}
              <span className="bg-gradient-to-r from-[#A855F7] via-[#C4B5FD] to-[#60A5FA] bg-clip-text text-transparent">Grow Faster</span>
            </h1>
            <p className="mb-[34px] max-w-[520px] text-lg leading-[1.62] text-[var(--color-muted)]">
              Catalyst Solutions Services combines strategy, technology, marketing, automation, and AI-enabled execution to build high-performing digital growth systems.
            </p>
            <div className="mb-11 flex flex-wrap items-center gap-[18px]">
              <Link href="/contact" className="btn-primary">
                Book a Growth Consultation <Icon name="arrow_forward" className="text-[19px]" />
              </Link>
              <Link href="/services" className="btn-ghost">Explore Services</Link>
            </div>
            <div className="flex flex-wrap gap-9">
              {heroStats.map((s) => (
                <div key={s.label}>
                  <div className="text-[26px] font-extrabold tracking-[-0.02em] text-white">{s.value}</div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--color-faint)]">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* HERO VISUAL — decorative, hidden on small screens */}
          <div className="relative hidden h-[520px] lg:block" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.25),transparent_65%)] blur-[20px]" />
            <div className="anim-floaty absolute left-5 top-[60px] w-[330px] rounded-2xl border border-[rgba(168,85,247,0.3)] bg-[linear-gradient(155deg,rgba(30,20,55,0.92),rgba(12,10,24,0.92))] p-[22px] shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(124,58,237,0.25)] backdrop-blur-[12px]">
              <div className="mb-[18px] flex items-center justify-between">
                <div className="flex items-center gap-[9px]">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[rgba(168,85,247,0.18)] text-[var(--color-brand-soft)]"><Icon name="analytics" className="text-[18px]" /></span>
                  <span className="text-[13px] font-semibold text-white">Analytics Dashboard</span>
                </div>
                <span className="text-[11px] font-semibold text-[#34D399]">● Live</span>
              </div>
              <div className="flex h-24 items-end gap-[7px] px-0.5">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-b from-[#A855F7] to-[#7C3AED] opacity-90" style={{ height: h }} />
                ))}
              </div>
              <div className="mt-3.5 flex justify-between border-t border-white/5 pt-3.5">
                {[["+38%", "Pipeline"], ["3.4x", "Conversion"], ["61%", "Automated"]].map(([v, l]) => (
                  <div key={l}><div className="text-lg font-bold text-white">{v}</div><div className="text-[10.5px] text-[var(--color-faint)]">{l}</div></div>
                ))}
              </div>
            </div>
            <div className="anim-floaty absolute right-2 top-1.5 flex items-center gap-2.5 rounded-[13px] border border-[rgba(168,85,247,0.3)] bg-[linear-gradient(150deg,rgba(40,25,70,0.95),rgba(15,12,28,0.95))] p-[13px_16px] shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-[10px] [animation-delay:0.5s]">
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-white"><Icon name="smart_toy" className="text-[19px]" /></span>
              <div><div className="text-[12.5px] font-semibold text-white">AI Lead Qualification</div><div className="text-[11px] text-[var(--color-faint)]">14 new qualified</div></div>
            </div>
            <div className="anim-floaty absolute left-0 top-[300px] flex items-center gap-2.5 rounded-[13px] border border-[rgba(96,165,250,0.3)] bg-[linear-gradient(150deg,rgba(20,30,60,0.95),rgba(12,12,26,0.95))] p-[13px_16px] shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-[10px] [animation-delay:1s]">
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[rgba(96,165,250,0.18)] text-[#93C5FD]"><Icon name="bolt" className="text-[19px]" /></span>
              <div><div className="text-[12.5px] font-semibold text-white">Marketing Automation</div><div className="text-[11px] text-[var(--color-faint)]">Workflow active</div></div>
            </div>
            <div className="anim-floaty absolute bottom-10 right-3.5 w-[230px] rounded-[15px] border border-[rgba(168,85,247,0.28)] bg-[linear-gradient(150deg,rgba(35,22,62,0.95),rgba(13,11,26,0.95))] p-[18px] shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-[10px] [animation-delay:0.8s]">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-[28px] w-[28px] items-center justify-center rounded-lg bg-[rgba(52,211,153,0.16)] text-[#6EE7B7]"><Icon name="trending_up" className="text-[17px]" /></span>
                <span className="text-[12.5px] font-semibold text-white">SEO Visibility</span>
              </div>
              <svg viewBox="0 0 200 60" className="h-[46px] w-full"><polyline points="0,50 30,44 60,46 90,30 120,32 150,18 200,8" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" /></svg>
              <div className="mt-1.5 text-[11px] text-[var(--color-faint)]">Organic clicks <span className="text-[#6EE7B7]">↑ 52%</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUSTED BY */}
      <section className="border-y border-white/5 px-5 pb-14 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1240px] text-center">
          <p className="mb-[26px] text-[12.5px] font-medium uppercase tracking-[0.1em] text-[#6b6b7a]">Trusted by growing businesses</p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-55">
            {logos.map((l) => (
              <div key={l.name} className="flex items-center gap-[9px] text-[var(--color-muted)]">
                <Icon name={l.icon} className="text-[22px] text-[#A78BCF]" />
                <span className="text-[17px] font-bold tracking-[-0.01em]">{l.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-14 max-w-[680px] text-center">
            <div className="eyebrow mb-3.5">The Challenge</div>
            <h2 className="h2 mb-[18px]">Growth Is Hard. We Make It Easier.</h2>
            <p className="text-[17px] leading-[1.62] text-[var(--color-muted)]">
              Most businesses do not fail because they lack effort. They struggle because their website, marketing, content, tools, automation, and reporting do not work together as one system.
            </p>
          </div>
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {problems.map((p) => (
              <div key={p.title} className="card-i">
                <span className="icon-chip mb-4 h-11 w-11 text-[23px]"><Icon name={p.icon} /></span>
                <h3 className="mb-[7px] text-[16.5px] font-semibold text-white">{p.title}</h3>
                <p className="text-[13.5px] leading-[1.55] text-[var(--color-faint)]">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-11 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-[620px]">
              <div className="eyebrow mb-3.5">What We Do</div>
              <h2 className="h2">Solutions That Drive Sustainable Growth</h2>
            </div>
            <Link href="/services" className="btn-ghost px-5 py-3 text-sm">All Services <Icon name="arrow_forward" className="text-[18px]" /></Link>
          </div>
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {services.map((sv) => (
              <Link key={sv.slug + sv.title} href={`/services/${sv.slug}`} className="card-i block">
                <span className="mb-[18px] flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.12))] text-[24px] text-[var(--color-brand-soft)]"><Icon name={sv.icon} /></span>
                <h3 className="mb-[9px] text-[17px] font-semibold tracking-[-0.01em] text-white">{sv.title}</h3>
                <p className="mb-4 text-[13.5px] leading-[1.58] text-[var(--color-faint)]">{sv.desc}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)]">Learn More <Icon name="arrow_forward" className="text-[16px]" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="bg-[linear-gradient(180deg,#070510,#0a0716)] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="mx-auto mb-14 max-w-[640px] text-center">
            <div className="eyebrow mb-3.5">How We Work</div>
            <h2 className="h2">A Proven Process That Delivers Results</h2>
          </div>
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((st) => (
              <div key={st.num} className="card">
                <div className="mb-3.5 text-[34px] font-extrabold tracking-[-0.02em] text-[rgba(168,85,247,0.35)]">{st.num}</div>
                <span className="icon-chip mb-4 h-[42px] w-[42px] border-0 text-[22px]"><Icon name={st.icon} /></span>
                <h3 className="mb-2 text-[16.5px] font-semibold text-white">{st.title}</h3>
                <p className="text-[13px] leading-[1.55] text-[var(--color-faint)]">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="eyebrow mb-3.5">Why Catalyst</div>
            <h2 className="mb-[18px] text-3xl font-extrabold leading-[1.12] tracking-[-0.025em] text-white sm:text-4xl md:text-[42px]">One Partner for Strategy, Systems, and Execution</h2>
            <p className="mb-7 text-base leading-[1.62] text-[var(--color-muted)]">We bring strategy, technology, marketing, design, automation, and analytics together so every part of your growth engine works as one.</p>
            <Link href="/about" className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--color-brand-soft)] hover:text-white">Learn about us <Icon name="arrow_forward" className="text-[18px]" /></Link>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {whyPoints.map((w) => (
              <div key={w.text} className="flex items-start gap-3.5 rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))] p-5">
                <span className="icon-chip h-[34px] w-[34px] border-0 text-[19px]"><Icon name={w.icon} /></span>
                <span className="text-[14.5px] font-medium leading-[1.4] text-[var(--color-fg)]">{w.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  );
}
