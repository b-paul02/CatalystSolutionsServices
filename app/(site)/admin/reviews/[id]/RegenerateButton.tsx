"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerate } from "../actions";

export default function RegenerateButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn-primary px-5 py-2.5 text-[13px]"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await regenerate(reportId);
              setMsg("Regeneration started — the progress bar will track it.");
              router.refresh();
            } catch (e) {
              setMsg((e as Error).message);
            }
          })
        }
      >
        {pending ? "Starting…" : "Regenerate report"}
      </button>
      {msg && <p className="mt-2 text-[12.5px] text-[var(--color-brand-soft)]">{msg}</p>}
    </div>
  );
}
