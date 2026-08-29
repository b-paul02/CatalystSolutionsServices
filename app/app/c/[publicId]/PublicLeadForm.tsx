"use client";

import { useEffect, useRef, useState } from "react";
import type { FormSpec } from "@/lib/leados/campaigns";

// Cloudflare Turnstile: rendered only when the public site key is configured.
// The server rejects submissions without a valid token whenever the secret
// key is set, so widget and check always come as a pair.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void };
  }
}

function useTurnstile(): { token: string | null; slot: React.RefObject<HTMLDivElement | null> } {
  const [token, setToken] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !slot.current) return;
    const render = () => {
      if (window.turnstile && slot.current && slot.current.childElementCount === 0) {
        window.turnstile.render(slot.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: setToken,
          "expired-callback": () => setToken(null),
        });
      }
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, []);
  return { token, slot };
}

export default function PublicLeadForm(props: {
  publicId: string;
  formSpec: FormSpec;
  cta: string;
  brandColor: string;
  trackingCode: string | null;
  utm: Record<string, string>;
  calendarUrl: string | null;
  thankYouRedirect: string | null;
}) {
  const { formSpec: spec } = props;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turnstile = useTurnstile();

  if (done) {
    return (
      <div className="mt-5 rounded-xl bg-[var(--los-success-soft)] p-5 text-center">
        <div className="text-[16px] font-bold text-[var(--los-success)]">{done}</div>
        {props.calendarUrl && (
          <a href={props.calendarUrl} className="mt-2 inline-block text-[13.5px] font-medium underline">
            Book a time that suits you →
          </a>
        )}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2.5 text-[15px] placeholder:text-[var(--los-faint)]";

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        fd.forEach((v, k) => {
          if (typeof v === "string") values[k] = v;
        });
        try {
          const res = await fetch(`/api/leados/public/forms/${props.publicId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              values,
              consentChecked: fd.get("__consent") === "on",
              utm: props.utm,
              trackingCode: props.trackingCode,
              website: values.website ?? "", // honeypot
              turnstileToken: turnstile.token,
            }),
          });
          const body = (await res.json()) as { message?: string; error?: string };
          if (!res.ok) {
            setError(body.error ?? "Something went wrong. Try again.");
          } else if (props.thankYouRedirect) {
            window.location.href = props.thankYouRedirect;
          } else {
            setDone(body.message ?? "Thank you!");
          }
        } catch {
          setError("Network problem — please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <div className="rounded-lg bg-[var(--los-danger-soft)] px-3 py-2 text-[13.5px] text-[var(--los-danger)]">{error}</div>}
      {[...spec.fields, ...spec.qualifying].map((f) => (
        <div key={f.key}>
          <label htmlFor={`pf-${f.key}`} className="mb-1 block text-[13px] font-medium">
            {f.label}
            {f.required && <span className="text-[var(--los-danger)]"> *</span>}
          </label>
          {f.kind === "select" ? (
            <select id={`pf-${f.key}`} name={f.key} required={f.required} className={inputCls} defaultValue="">
              <option value="" disabled>Select…</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.kind === "textarea" ? (
            <textarea id={`pf-${f.key}`} name={f.key} required={f.required} className={`${inputCls} h-20`} />
          ) : f.kind === "checkbox" ? (
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name={f.key} value="yes" /> {f.label}</label>
          ) : (
            <input
              id={`pf-${f.key}`} name={f.key} required={f.required}
              type={f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"}
              inputMode={f.kind === "phone" ? "tel" : undefined}
              className={inputCls}
            />
          )}
        </div>
      ))}
      {/* honeypot — real people never see or fill this */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {/* consent — server re-checks; this block is part of the published version */}
      <label className="flex items-start gap-2 rounded-lg bg-[var(--los-surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--los-muted)]">
        <input type="checkbox" name="__consent" required className="mt-0.5" />
        <span>
          I agree to be contacted about{" "}
          <strong>{spec.consentPurposes.map((p) => p.replace(/_/g, " ")).join(", ")}</strong> via{" "}
          <strong>{spec.consentChannels.join(", ")}</strong>. I can withdraw at any time via the privacy page.
        </span>
      </label>
      {TURNSTILE_SITE_KEY && <div ref={turnstile.slot} className="flex justify-center" />}
      <button
        type="submit"
        disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !turnstile.token)}
        className="w-full rounded-lg px-4 py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: props.brandColor }}
      >
        {busy ? "Sending…" : props.cta}
      </button>
      <p className="text-center text-[11.5px] text-[var(--los-faint)]">
        Protected against spam · <a href="/app/privacy" className="underline">Privacy & data requests</a>
      </p>
    </form>
  );
}
