"use client";

import { useActionState, useState } from "react";
import { createCampaign } from "./actions";
import type { FormState } from "../../(auth)/actions";
import { CAMPAIGN_TYPES, OBJECTIVES } from "@/lib/leados/campaigns";
import { FormNotice, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

export default function NewCampaignButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(createCampaign, {});
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90">
        New campaign
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-[440px] rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-[17px] font-bold">New campaign</h2>
        <form action={action} className="space-y-4">
          <FormNotice state={state} />
          <div>
            <Label htmlFor="c-name">Campaign name</Label>
            <Input id="c-name" name="name" required placeholder="Mumbai 2BHK — September push" />
          </div>
          <div>
            <Label htmlFor="c-type">How will leads arrive?</Label>
            <Select id="c-type" name="type" defaultValue="hosted_page">
              {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="c-objective">Objective</Label>
            <Select id="c-objective" name="objective" defaultValue="generate_inquiries">
              {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <SubmitButton className="w-full">Create draft</SubmitButton>
        </form>
      </div>
    </div>
  );
}
