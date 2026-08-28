"use client";

import { useActionState } from "react";
import { verifyMfa, type FormState } from "../actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function MfaForm() {
  const [state, action] = useActionState<FormState, FormData>(verifyMfa, {});
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-[18px] font-bold">Two-factor verification</h1>
      <p className="mb-4 text-[13.5px] text-[var(--los-muted)]">Enter the 6-digit code from your authenticator app.</p>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoFocus className="text-center text-[20px] tracking-[0.4em]" />
        </div>
        <SubmitButton className="w-full">Verify</SubmitButton>
      </form>
    </Card>
  );
}
