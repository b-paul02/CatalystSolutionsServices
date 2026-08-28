"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "../actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-[18px] font-bold">Reset your password</h1>
      <p className="mb-4 text-[13.5px] text-[var(--los-muted)]">We&apos;ll email you a reset link.</p>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <SubmitButton className="w-full">Send reset link</SubmitButton>
      </form>
    </Card>
  );
}
