// Centered card layout for the signed-out flows.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--los-muted)]">
          Catalyst Solutions
        </div>
        <div className="text-[26px] font-extrabold tracking-tight text-[var(--los-fg)]">LeadOS</div>
      </div>
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
