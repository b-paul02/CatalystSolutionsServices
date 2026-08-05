import Link from "next/link";
import Icon from "./Icon";

type Props = {
  eyebrow?: string;
  heading?: string;
  copy?: string;
  button?: string;
};

export default function CTASection({
  eyebrow = "Start your growth system",
  heading = "Ready to Build a Smarter Growth System?",
  copy = "Let's identify what is slowing your growth and build a practical plan to fix it.",
  button = "Book a Growth Consultation",
}: Props) {
  return (
    <section className="relative w-full overflow-hidden bg-[var(--color-bg)] px-5 py-24 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(124,58,237,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(168,85,247,0.3),transparent)]" />
      <div className="relative mx-auto max-w-[760px] text-center">
        <span className="badge mb-6">
          <span className="badge-dot" />
          {eyebrow}
        </span>
        <h2 className="mb-[18px] text-[clamp(2rem,5vw,46px)] font-extrabold leading-[1.08] tracking-[-0.025em] text-balance text-white">{heading}</h2>
        <p className="mx-auto mb-9 max-w-[560px] text-[17px] leading-[1.6] text-[var(--color-muted)]">{copy}</p>
        <div className="flex flex-wrap items-center justify-center gap-[18px]">
          <Link href="/contact" className="btn-primary">
            {button} <Icon name="arrow_forward" className="text-[19px]" />
          </Link>
          <Link href="/growth-audit" className="btn-ghost">
            Not ready to talk? Get a Free Growth Audit
          </Link>
          <Link href="/services" className="text-[15px] font-medium text-[var(--color-brand-soft)] hover:text-white">
            Explore Services →
          </Link>
        </div>
      </div>
    </section>
  );
}
