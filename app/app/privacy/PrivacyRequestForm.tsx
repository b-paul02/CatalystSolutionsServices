"use client";

import { useActionState } from "react";
import { submitPrivacyRequest } from "./actions";
import type { FormState } from "../(auth)/actions";
import { Card, FormNotice, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

export default function PrivacyRequestForm() {
  const [state, action] = useActionState<FormState, FormData>(submitPrivacyRequest, {});
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="kind">I want to…</Label>
          <Select id="kind" name="kind" defaultValue="access">
            <option value="access">See what data you hold about me</option>
            <option value="correction">Correct my data</option>
            <option value="deletion">Delete my data</option>
            <option value="objection">Object to how my data is used</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="email">Your email address</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="phone">Your phone number (if the request is about a phone number)</Label>
          <Input id="phone" name="phone" placeholder="+91…" />
        </div>
        <div>
          <Label htmlFor="details">Anything we should know</Label>
          <Input id="details" name="details" placeholder="Optional details" />
        </div>
        <SubmitButton className="w-full">Submit request</SubmitButton>
      </form>
    </Card>
  );
}
