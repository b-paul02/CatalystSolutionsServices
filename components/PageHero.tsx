export default function PageHero({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-20 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.24),transparent_65%)]" />
      <div className="relative mx-auto max-w-[820px] text-center">
        <span className="badge mb-6">
          <span className="badge-dot" />
          {badge}
        </span>
        <h1 className="mb-5 text-[clamp(2.2rem,6vw,52px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-white">{title}</h1>
        <p className="mx-auto max-w-[680px] text-[17.5px] leading-[1.62] text-[var(--color-muted)]">{subtitle}</p>
      </div>
    </section>
  );
}
