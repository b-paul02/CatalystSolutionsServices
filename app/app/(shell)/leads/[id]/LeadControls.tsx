"use client";

import { useActionState, useTransition } from "react";
import { assignLead, deleteLead, setLeadStatus, updateLeadBasics } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Card, FormNotice, GhostButton, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

const STATUSES = ["new", "assigned", "contacted", "engaged", "qualified", "converted", "lost"];

export default function LeadControls(props: {
  leadId: string;
  status: string;
  ownerId: string | null;
  lostReason: string | null;
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  basics: { firstName: string; lastName: string; city: string; state: string; country: string; language: string };
  members: { userId: string; label: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(updateLeadBasics, {});
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="mb-3 text-[14px] font-bold">Stage & owner</h2>
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select
              value={props.status}
              disabled={!props.canEdit || pending}
              onChange={(e) => {
                const status = e.target.value;
                const lostReason = status === "lost" ? prompt("Lost reason?") ?? undefined : undefined;
                start(() => setLeadStatus(props.leadId, status, lostReason));
              }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            {props.status === "lost" && props.lostReason && (
              <p className="mt-1 text-[12.5px] text-[var(--los-faint)]">Lost: {props.lostReason}</p>
            )}
          </div>
          <div>
            <Label>Owner</Label>
            <Select
              value={props.ownerId ?? ""}
              disabled={!props.canAssign || pending}
              onChange={(e) => start(() => assignLead(props.leadId, e.target.value || null))}
            >
              <option value="">Unassigned</option>
              {props.members.map((m) => <option key={m.userId} value={m.userId}>{m.label}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {props.canEdit && (
        <Card className="p-5">
          <h2 className="mb-3 text-[14px] font-bold">Edit details</h2>
          <form action={action} className="space-y-3">
            <FormNotice state={state} />
            <input type="hidden" name="leadId" value={props.leadId} />
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" defaultValue={props.basics.firstName} /></div>
              <div><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" defaultValue={props.basics.lastName} /></div>
              <div><Label htmlFor="city">City</Label><Input id="city" name="city" defaultValue={props.basics.city} /></div>
              <div><Label htmlFor="state">State</Label><Input id="state" name="state" defaultValue={props.basics.state} /></div>
              <div><Label htmlFor="country">Country</Label><Input id="country" name="country" defaultValue={props.basics.country} /></div>
              <div><Label htmlFor="language">Language</Label><Input id="language" name="language" defaultValue={props.basics.language} /></div>
            </div>
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
      )}

      {props.canDelete && (
        <GhostButton
          disabled={pending}
          className="w-full text-[var(--los-danger)]"
          onClick={() => {
            if (confirm("Delete this lead? It disappears from lists but stays recoverable by support.")) {
              start(() => deleteLead(props.leadId));
            }
          }}
        >
          Delete lead
        </GhostButton>
      )}
    </div>
  );
}
