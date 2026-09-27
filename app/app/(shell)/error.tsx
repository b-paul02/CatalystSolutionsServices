"use client";

// UNEXPECTED failures only. Expected refusals (signed out, wrong role, out of scope) never get here:
// pages use requireOrgPage, which redirects. Production strips error messages, so this shows none.
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="max-w-[560px] rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6">
      <h1 className="text-[20px] font-bold">Something went wrong on our side</h1>
      <p className="mt-2 text-[14px] text-[var(--los-muted)]">Nothing you did caused this, and nothing was changed. Try again; if it keeps happening, send your account lead the reference below.</p>
      {error.digest && <p className="mt-2 font-mono text-[12px] text-[var(--los-faint)]">Reference: {error.digest}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white">Try again</button>
        <a href="/app/dashboard" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold">Go to Home</a>
      </div>
    </div>
  );
}
