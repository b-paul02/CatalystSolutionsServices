"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Link from "next/link";
import { saveStep } from "./apply/actions";

/**
 * The first step of the application, inline in the hero. It creates the same
 * draft the full form uses and hands the applicant straight to step 2, so
 * nothing is retyped and a half-finished application is still captured.
 */
export default function HeroApplyForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { token } = await saveStep(null, { fullName, email, linkedinUrl });
      router.push(`/partners/apply?t=${token}`);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-[440px]">
      <h2 className="text-[20px] font-bold text-white">Apply to the Sales Partner Program</h2>
      <p className="mb-5 mt-1.5 text-[13.5px] leading-[1.55] text-[#c2c6d1]">
        Start here — we carry these over. The application takes approximately eight minutes and covers your sales
        experience, target market, and current business network.
      </p>

      <div className="grid gap-3.5">
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="hero-name" className="label">Your name</label>
          <input id="hero-name" className="field" required autoComplete="name"
                 value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="hero-email" className="label">Email address</label>
          <input id="hero-email" className="field" type="email" required autoComplete="email"
                 value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="hero-linkedin" className="label">
            LinkedIn profile <span className="font-normal text-[#6b6b7a]">(optional)</span>
          </label>
          <input id="hero-linkedin" className="field" value={linkedinUrl}
                 onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="linkedin.com/in/…" />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary glow-quiet mt-5 w-full justify-center disabled:opacity-60">
        {busy ? "Starting…" : "Continue partner application"} <Icon name="arrow_forward" className="text-[19px]" />
      </button>
      <p className="mt-3 text-center text-[12px] leading-[1.5] text-[#9a9aac]">
        By continuing, you agree to the{" "}
        <Link href="/partners/terms" className="underline hover:text-white">Partner Program Terms</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
      </p>
      <p className="mt-2 text-center text-[12px] leading-[1.5] text-[#9a9aac]">
        No cost to join. Your progress saves as you go.
      </p>
      <p className="mt-4 border-t border-[var(--color-line)] pt-3.5 text-center text-[12.5px] text-[var(--color-muted)]">
        Already a partner?{" "}
        <Link href="/partner/login" className="font-semibold text-[var(--color-brand-soft)] hover:underline">
          Sign in to your dashboard
        </Link>
      </p>
    </form>
  );
}
