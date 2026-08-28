"use client";

import { useActionState } from "react";
import { updateOrg } from "./actions";
import type { FormState } from "../../(auth)/actions";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

export default function OrgForm({ org, canManage }: { org: { name: string; website: string; industry: string }; canManage: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updateOrg, {});
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" name="name" defaultValue={org.name} disabled={!canManage} required />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" type="url" defaultValue={org.website} disabled={!canManage} />
        </div>
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" name="industry" defaultValue={org.industry} disabled={!canManage} />
        </div>
        {canManage ? (
          <SubmitButton>Save changes</SubmitButton>
        ) : (
          <p className="text-[13px] text-[var(--los-faint)]">Only owners and admins can edit organization details.</p>
        )}
      </form>
    </Card>
  );
}
