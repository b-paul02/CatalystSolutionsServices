"use client";

import { useActionState, useState } from "react";
import { requestReplacement } from "./actions";
import type { FormState } from "../../(auth)/actions";
import { GhostButton, Input, SubmitButton } from "@/components/leados/ui";

export default function ReplacementButton({ allocationId }: { allocationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(requestReplacement, {});
  if (state.ok) return <span className="text-[12.5px] text-[var(--los-success)]">{state.ok}</span>;
  if (!open) {
    return (
      <GhostButton onClick={() => setOpen(true)} className="!px-2 !py-1 text-[12.5px]">
        Request replacement
      </GhostButton>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2">
      {state.error && <span className="text-[12px] text-[var(--los-danger)]">{state.error}</span>}
      <input type="hidden" name="allocationId" value={allocationId} />
      <Input name="reason" placeholder="What's wrong? (wrong number, not interested…)" className="!w-[260px] !py-1 text-[13px]" />
      <SubmitButton className="!px-2.5 !py-1 text-[12.5px]">Send</SubmitButton>
    </form>
  );
}
