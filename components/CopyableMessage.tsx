"use client";

import { useState } from "react";
import Icon from "./Icon";

export type OutboundMessageView = {
  to: string;
  subject: string;
  body: string;
  credentials?: { email: string; password: string; loginUrl: string };
};

/**
 * Shows an email for the admin to send by hand. Nothing is sent automatically —
 * this is the text, ready to copy.
 */
export default function CopyableMessage({
  message, title, onDone,
}: {
  message: OutboundMessageView;
  title: string;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  const full = `To: ${message.to}\nSubject: ${message.subject}\n\n${message.body}`;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-emerald-300">{title}</h3>
        <span className="text-[11.5px] text-[var(--color-faint)]">Nothing has been emailed — send this yourself.</span>
      </div>

      {message.credentials && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-[12px] font-semibold text-amber-300">
            Shown once. We store only a hash of this password, so it cannot be looked up later.
          </p>
          <dl className="grid gap-1 text-[12.5px]">
            <Pair label="Portal" value={message.credentials.loginUrl} />
            <Pair label="Email" value={message.credentials.email} />
            <Pair label="Password" value={message.credentials.password} mono />
          </dl>
          <button
            onClick={() => copy("creds", `Portal: ${message.credentials!.loginUrl}\nEmail: ${message.credentials!.email}\nPassword: ${message.credentials!.password}`)}
            className="btn-ghost mt-2.5 px-2.5 py-1 text-[12px]"
          >
            {copied === "creds" ? "Copied" : "Copy sign-in details"}
          </button>
        </div>
      )}

      <dl className="mb-2 grid gap-1 text-[12.5px]">
        <Pair label="To" value={message.to} />
        <Pair label="Subject" value={message.subject} />
      </dl>

      <textarea
        readOnly
        value={message.body}
        rows={12}
        className="field w-full resize-y font-mono text-[12px] leading-[1.55]"
        onFocus={(e) => e.currentTarget.select()}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => copy("full", full)} className="btn-primary px-3 py-1.5 text-[12.5px]">
          <Icon name="content_copy" className="text-[16px]" />
          {copied === "full" ? "Copied" : "Copy whole email"}
        </button>
        <a
          href={`mailto:${encodeURIComponent(message.to)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
          className="btn-ghost px-3 py-1.5 text-[12.5px]"
        >
          Open in mail app
        </a>
        {onDone && (
          <button onClick={onDone} className="ml-auto text-[12.5px] text-[var(--color-muted)] hover:text-white">
            Done
          </button>
        )}
      </div>
      {copied === "failed" && (
        <p className="mt-2 text-[12px] text-red-300">Could not reach the clipboard — select the text and copy it manually.</p>
      )}
    </div>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[70px_1fr] gap-2">
      <dt className="text-[var(--color-faint)]">{label}</dt>
      <dd className={`break-all text-white ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
