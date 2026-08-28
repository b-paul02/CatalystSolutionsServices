"use client";

import { useState } from "react";

export default function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-[12px]"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}/plans/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
