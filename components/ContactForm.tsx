"use client";

import { useState } from "react";
import Icon from "./Icon";
import { contactServiceOptions } from "@/lib/content";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center px-3 py-12 text-center">
        <span className="mb-[22px] flex h-[68px] w-[68px] items-center justify-center rounded-[18px] bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-[36px] text-white shadow-[0_0_32px_rgba(124,58,237,0.5)]"><Icon name="check" /></span>
        <h2 className="mb-2.5 text-[26px] font-bold text-white">Thank you — request received.</h2>
        <p className="max-w-[320px] text-[15px] leading-[1.6] text-[var(--color-muted)]">We'll review your details and get back to you within one business day with a clear next step.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="mb-[22px] text-[21px] font-bold text-white">Request a Consultation</h2>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" type="text" autoComplete="name" required placeholder="Your name" className="field" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="email" className="label">Business Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" className="field" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="company" className="label">Company Name</label>
          <input id="company" name="company" type="text" autoComplete="organization" placeholder="Company" className="field" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label htmlFor="website" className="label">Website URL</label>
          <input id="website" name="website" type="text" autoComplete="url" placeholder="yoursite.com" className="field" />
        </div>
      </div>
      <div className="mt-3.5 flex flex-col gap-[7px]">
        <label htmlFor="service" className="label">Service Interested In</label>
        <select id="service" name="service" className="field" defaultValue={contactServiceOptions[0]}>
          {contactServiceOptions.map((o) => (
            <option key={o} className="bg-[#13101f] text-[var(--color-fg)]">{o}</option>
          ))}
        </select>
      </div>
      <div className="mt-3.5 flex flex-col gap-[7px]">
        <label htmlFor="timeline" className="label">Timeline <span className="font-normal text-[#6b6b7a]">(optional)</span></label>
        <select id="timeline" name="timeline" className="field" defaultValue="As soon as possible">
          {["As soon as possible", "Within 1–3 months", "3–6 months", "Just exploring"].map((o) => (
            <option key={o} className="bg-[#13101f]">{o}</option>
          ))}
        </select>
      </div>
      <div className="mt-3.5 flex flex-col gap-[7px]">
        <label htmlFor="message" className="label">Message</label>
        <textarea id="message" name="message" rows={4} placeholder="Tell us about your goals and what's slowing your growth..." className="field resize-y" />
      </div>

      {status === "error" && (
        <p role="alert" aria-live="assertive" className="mt-3.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">{error}</p>
      )}

      <button type="submit" disabled={status === "sending"} className="btn-primary mt-[22px] w-full disabled:cursor-not-allowed disabled:opacity-60">
        {status === "sending" ? "Sending…" : "Request Consultation"} <Icon name="arrow_forward" className="text-[19px]" />
      </button>
      <p className="mt-3.5 text-center text-xs text-[#6b6b7a]">By submitting, you agree to be contacted about your inquiry.</p>
    </form>
  );
}
