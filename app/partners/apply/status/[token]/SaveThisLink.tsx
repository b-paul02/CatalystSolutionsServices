"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * The applicant's only handle on their application — no email carries it now,
 * so it has to be impossible to miss here.
 */
export default function SaveThisLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/partners/apply/status/${token}`;

  return (
    <div className="mt-6 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/5 p-4">
      <p className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-white">
        <Icon name="bookmark" className="text-[18px] text-[var(--color-brand-soft)]" />
        Save this page
      </p>
      <p className="mb-3 text-[12.5px] leading-[1.55] text-[var(--color-muted)]">
        This is your personal link for checking progress. Bookmark it or keep a copy — it stays live for 90 days.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="field min-w-0 flex-1 font-mono text-[12px]"
        />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* the input is selectable — copying by hand still works */
            }
          }}
          className="btn-primary px-3 py-2 text-[12.5px]"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
