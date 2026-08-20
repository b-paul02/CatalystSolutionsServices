"use client";

import { useState } from "react";
import CopyableMessage, { type OutboundMessageView } from "@/components/CopyableMessage";
import { resetPartnerPassword } from "./password-actions";

export default function PasswordCard({ partnerId, loginEmail }: { partnerId: string; loginEmail: string }) {
  const [message, setMessage] = useState<OutboundMessageView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function reset() {
    setBusy(true); setError(null);
    try {
      setMessage(await resetPartnerPassword(partnerId));
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2 className="mb-2 text-[15px] font-bold text-white">Sign-in</h2>
      <p className="mb-3.5 text-[13px] leading-[1.6] text-[var(--color-muted)]">
        {loginEmail} · we store only a hash of the password, so it cannot be looked up. Issue a new one if the partner
        never received theirs.
      </p>

      {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      {message ? (
        <CopyableMessage
          title="New sign-in details — send this to the partner"
          message={message}
          onDone={() => setMessage(null)}
        />
      ) : confirming ? (
        <div className="grid gap-2">
          <p className="text-[13px] text-amber-300">
            This replaces their current password immediately. They will not be able to sign in until you send them the new one.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={reset} disabled={busy} className="btn-primary flex-1 justify-center text-[13.5px] disabled:opacity-50">
              {busy ? "Working…" : "Issue a new password"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={busy} className="text-[13px] text-[var(--color-muted)] hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="btn-ghost px-3 py-1.5 text-[13px]">Reset password</button>
      )}
    </div>
  );
}
