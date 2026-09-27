"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void } } }

// WP-10e · "Verify with a free site audit": one URL field; the page reloads with the verified column once done.
export default function VerifyForm({ publicId, submissionId, turnstileSiteKey, brandColor }: { publicId: string; submissionId: string; turnstileSiteKey: string | null; brandColor: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!turnstileSiteKey || !slot.current) return;
    const render = () => { if (window.turnstile && slot.current && slot.current.childElementCount === 0) window.turnstile.render(slot.current, { sitekey: turnstileSiteKey, callback: setToken, "expired-callback": () => setToken(null) }); };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = render; document.head.appendChild(s);
  }, [turnstileSiteKey]);
  return (
    <form className="mt-5 rounded-xl border border-[var(--los-line)] p-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      const fd = new FormData(e.currentTarget);
      try {
        const res = await fetch("/api/os/public/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId, submissionId, url: fd.get("url"), website: fd.get("website"), turnstileToken: token }) });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) setError(j.error ?? "Something went wrong."); else router.refresh();
      } catch { setError("Network problem — please try again."); } finally { setBusy(false); }
    }}>
      <div className="text-[14px] font-bold">Verify with a free site audit</div>
      <p className="mt-1 text-[12.5px] text-[var(--los-muted)]">Your answers above are self-reported. Enter your website and we check the basics for real — titles, speed, tracking, structured data — and show both side by side.</p>
      {error && <p className="mt-2 text-[13px] text-[var(--los-danger)]">{error}</p>}
      <div className="mt-2 flex gap-2"><input name="url" required placeholder="yourwebsite.com" inputMode="url" className="w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px]" aria-label="Website" /><button type="submit" disabled={busy || (Boolean(turnstileSiteKey) && !token)} className="shrink-0 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: brandColor }}>{busy ? "Checking…" : "Check"}</button></div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {turnstileSiteKey && <div ref={slot} className="mt-2 flex justify-center" />}
      <p className="mt-2 text-[11.5px] text-[var(--los-faint)]">Takes up to a minute. Deterministic checks on your homepage and key pages; not a full audit.</p>
    </form>
  );
}
