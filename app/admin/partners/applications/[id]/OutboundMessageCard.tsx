"use client";

import { useState } from "react";
import CopyableMessage, { type OutboundMessageView } from "@/components/CopyableMessage";

/** A pre-written email the admin can reveal and send at any time. */
export default function OutboundMessageCard({
  message, label, title,
}: {
  message: OutboundMessageView;
  label: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-white">{label}</h2>
          <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
            Nothing is emailed automatically — send this from your own mailbox.
          </p>
        </div>
        <button onClick={() => setOpen(!open)} className="btn-ghost px-3 py-1.5 text-[13px]">
          {open ? "Hide" : "Show email"}
        </button>
      </div>
      {open && (
        <div className="mt-4">
          <CopyableMessage title={title} message={message} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
