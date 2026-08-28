"use client";

import { useActionState } from "react";
import { register, type FormState } from "../actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(register, {});
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-[18px] font-bold">Create your account</h1>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Your name" />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          <p className="mt-1 text-[12px] text-[var(--los-faint)]">At least 10 characters.</p>
        </div>
        <SubmitButton className="w-full">Create account</SubmitButton>
        <p className="text-[12px] leading-relaxed text-[var(--los-faint)]">
          By creating an account you agree to the Catalyst Solutions terms of service and data processing agreement.
        </p>
      </form>
    </Card>
  );
}
