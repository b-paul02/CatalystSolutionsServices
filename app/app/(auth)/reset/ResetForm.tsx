"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword, type FormState } from "../actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-[18px] font-bold">Choose a new password</h1>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <input type="hidden" name="token" value={token} />
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </div>
        <SubmitButton className="w-full">Update password</SubmitButton>
        {state.ok && (
          <p className="text-center text-[13.5px]">
            <Link href="/app/login" className="font-medium text-[var(--los-brand)]">Sign in</Link>
          </p>
        )}
      </form>
    </Card>
  );
}
