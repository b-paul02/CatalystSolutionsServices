"use client";

// LeadOS UI primitives — light Attio/Linear-leaning system on --los-* tokens.
import { useState } from "react";
import { useFormStatus } from "react-dom";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] ${className}`}>
      {children}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-[var(--los-fg)]">
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const isPassword = props.type === "password";
  const input = (
    <input
      {...props}
      type={isPassword && shown ? "text" : props.type}
      className={`w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px] text-[var(--los-fg)] placeholder:text-[var(--los-faint)] focus:border-[var(--los-brand)] ${isPassword ? "pr-10" : ""} ${props.className ?? ""}`}
    />
  );
  if (!isPassword) return input;
  return (
    <div className="relative">
      {input}
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--los-muted)] hover:text-[var(--los-fg)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px] text-[var(--los-fg)] ${props.className ?? ""}`}
    />
  );
}

export function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-4 py-2 text-[14px] font-medium text-[var(--los-fg)] hover:bg-[var(--los-surface-2)] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function FormNotice({ state }: { state: { error?: string; ok?: string; devLink?: string } }) {
  if (!state.error && !state.ok) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-[13.5px] ${
        state.error
          ? "bg-[var(--los-danger-soft)] text-[var(--los-danger)]"
          : "bg-[var(--los-success-soft)] text-[var(--los-success)]"
      }`}
    >
      {state.error ?? state.ok}
      {state.devLink && (
        <div className="mt-1 break-all text-[12.5px]">
          <span className="font-semibold">Dev link (no email provider configured): </span>
          <a className="underline" href={state.devLink}>{state.devLink}</a>
        </div>
      )}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warn" | "danger" | "brand" }) {
  const tones = {
    neutral: "bg-[var(--los-surface-2)] text-[var(--los-muted)]",
    success: "bg-[var(--los-success-soft)] text-[var(--los-success)]",
    warn: "bg-[var(--los-warn-soft)] text-[var(--los-warn)]",
    danger: "bg-[var(--los-danger-soft)] text-[var(--los-danger)]",
    brand: "bg-[var(--los-brand-soft)] text-[var(--los-brand)]",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
