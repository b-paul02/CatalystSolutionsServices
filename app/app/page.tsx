// Placeholder root — Phase 1 replaces this with login / dashboard redirect.
export default function LeadosHome() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--los-brand)]">
        Catalyst Solutions
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight">LeadOS</h1>
      <p className="max-w-md text-[15px] text-[var(--los-muted)]">
        B2B and B2C lead operations — coming online. Sign-in opens shortly.
      </p>
    </div>
  );
}
