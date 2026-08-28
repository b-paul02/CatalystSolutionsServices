"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "../../actions";
import { Badge, Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function InviteForm(props: {
  token: string;
  orgName: string;
  email: string;
  role: string;
  signedInEmail: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(acceptInvite, {});
  const needsAccount = props.signedInEmail !== props.email;
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-[18px] font-bold">Join {props.orgName}</h1>
      <p className="mb-4 text-[13.5px] text-[var(--los-muted)]">
        {props.email} · <Badge tone="brand">{props.role.replace(/_/g, " ")}</Badge>
      </p>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <input type="hidden" name="token" value={props.token} />
        {needsAccount && props.signedInEmail === null && (
          <>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="password">Choose a password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
              <p className="mt-1 text-[12px] text-[var(--los-faint)]">
                At least 10 characters. If you already have a LeadOS account with this email, enter its password.
              </p>
            </div>
          </>
        )}
        <SubmitButton className="w-full">Accept invitation</SubmitButton>
      </form>
    </Card>
  );
}
