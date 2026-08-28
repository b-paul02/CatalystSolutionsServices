import Link from "next/link";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import HeroAuditForm from "@/components/HeroAuditForm";
import { heroTrust, heroChips, clients, problems, services, steps, whyPoints } from "@/lib/content";

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-24 pt-10 sm:px-8 lg:pt-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_25%_20%,rgba(124,58,237,0.28),transparent_60%),radial-gradient(ellipse_50%_60%_at_90%_30%,rgba(59,130,246,0.14),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.05)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_30%,#000,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="badge mb-6">
              <span className="badge-dot anim-pulse" />
              AI-Enabled Digital Growth Agency
            </span>
            <h1 className="mb-[22px] text-[clamp(2.2rem,5.5vw,52px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
              Build Your Digital Presence.{" "}
              <br />
              Get Found.{" "}
              <span className="bg-gradient-to-r from-[#A855F7] via-[#C4B5FD] to-[#60A5FA] bg-clip-text text-transparent">Get More Customers.</span>{" "}
              Grow Smarter.
            </h1>
            <p className="mb-5 max-w-[520px] text-lg leading-[1.62] text-[var(--color-muted)]">
              Catalyst Solutions helps professionals and businesses turn their digital presence into a growth engine.
            </p>
            <div className="mb-8 flex max-w-[520px] flex-wrap gap-2.5">
              {heroChips.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(168,85,247,0.25)] bg-[rgba(124,58,237,0.1)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-fg)]">
                  <Icon name="check" className="text-[15px] text-[var(--color-brand-soft)]" />{c}
                </span>
              ))}
            </div>
            <div className="mb-9 hidden flex-wrap items-center gap-[18px] sm:flex">
              <Link href="/contact" className="btn-ghost">
                Book a Growth Consultation <Icon name="arrow_forward" className="text-[18px]" />
              </Link>
              <Link href="/industries" className="text-[15px] font-medium text-[var(--color-brand-soft)] hover:text-white">See Plans for Your Industry →</Link>
            </div>
            <div className="hidden flex-wrap gap-x-7 gap-y-3 sm:flex">
              {heroTrust.map((t) => (
                <div key={t.text} className="flex items-center gap-2 text-[13.5px] text-[var(--color-muted)]">
                  <Icon name={t.icon} className="text-[18px] text-[var(--color-brand-soft)]" />{t.text}
                </div>
              ))}
            </div>
          </div>

          {/* HERO FORM — growth-audit entry point */}
          <div className="relative mx-auto w-full max-w-[460px] lg:justify-self-end">
            <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.25),transparent_65%)] blur-[20px]" />
            <HeroAuditForm />
          </div>
        </div>
      </section>

      {/* TRUSTED BY */}
      <section className="border-y border-white/5 px-5 pb-14 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1240px] text-center">
          <p className="mb-[26px] text-[12.5px] font-medium uppercase tracking-[0.1em] text-[#6b6b7a]">Trusted by growing businesses</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 opacity-70">
            {clients.map((name) => (
              <span key={name} className="text-[16px] font-bold tracking-[-0.01em] text-[var(--color-muted)]">{name}</span>
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
