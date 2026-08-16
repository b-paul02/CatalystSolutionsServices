"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function HeroAuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [noWebsite, setNoWebsite] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams({ email, ...(noWebsite ? { noWebsite: "1", name: url } : { url }) });
    router.push(`/growth-audit?${q.toString()}#start`);
  }

  return (
    <form
      onSubmit={submit}
      className="relative rounded-2xl border border-[rgba(168,85,247,0.3)] bg-[linear-gradient(155deg,rgba(30,20,55,0.92),rgba(12,10,24,0.92))] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(124,58,237,0.25)] backdrop-blur-[12px] sm:p-8"
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-white">
          <Icon name="query_stats" className="text-[19px]" />
        </span>
        <h2 className="text-[19px] font-bold tracking-[-0.01em] text-white">Get your free Growth Audit</h2>
      </div>
      <p className="mb-6 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
        {noWebsite
          ? "No website is fine — we'll build the audit from your answers instead."
          : "We read your site first, so you answer fewer questions. Human-reviewed, no pitch."}
      </p>
      <label className="label mb-1.5 block" htmlFor="hero-url">{noWebsite ? "Business name" : "Website URL"}</label>
      <input
        id="hero-url"
        className="field mb-3"
        required
        placeholder={noWebsite ? "Your business name" : "yourbusiness.com"}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--color-muted)]">
        <input
          type="checkbox"
          checked={noWebsite}
          onChange={(e) => setNoWebsite(e.target.checked)}
          className="h-4 w-4 accent-[#A855F7]"
        />
        I don&apos;t have a website yet
      </label>
      <label className="label mb-1.5 block" htmlFor="hero-email">Email (your report is delivered here)</label>
      <input
        id="hero-email"
        className="field mb-2"
        required
        type="email"
        placeholder="you@yourbusiness.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <p className="mb-5 text-[12px] text-[var(--color-faint)]">Used only to deliver your report — no mailing list, no spam.</p>
      <button className="btn-primary w-full">
        Start the audit <Icon name="arrow_forward" className="text-[19px]" />
      </button>
      <p className="mt-4 text-center text-[12.5px] text-[var(--color-faint)]">Free · About 5 minutes · Reviewed by a human</p>
    </form>
  );
}
