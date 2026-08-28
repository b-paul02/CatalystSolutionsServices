"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "../actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-[18px] font-bold">Sign in</h1>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/app/forgot" className="text-[12.5px] text-[var(--los-brand)]">Forgot?</Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </form>
    </Card>
  );
}
