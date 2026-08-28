"use client";

import { useActionState, useTransition } from "react";
import { changeMemberRole, inviteMember, removeMember, revokeInvite } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Badge, Card, FormNotice, GhostButton, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

const ROLES = ["admin", "campaign_manager", "sales_manager", "sales_rep", "analyst"];

type Member = { id: string; userId: string; role: string; email: string; name: string | null };
type Invite = { id: string; email: string; role: string };

export default function TeamManager(props: {
  canManage: boolean;
  isOwner: boolean;
  selfUserId: string;
  members: Member[];
  invites: Invite[];
}) {
  const [state, action] = useActionState<FormState, FormData>(inviteMember, {});
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {props.canManage && (
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Invite a teammate</h2>
          <form action={action} className="space-y-3">
            <FormNotice state={state} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required placeholder="teammate@company.com" />
              </div>
              <div className="sm:w-[190px]">
                <Label htmlFor="invite-role">Role</Label>
                <Select id="invite-role" name="role" defaultValue="sales_rep">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </Select>
              </div>
              <div className="flex items-end">
                <SubmitButton>Invite</SubmitButton>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Members</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {props.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">{m.name ?? m.email}</div>
                <div className="truncate text-[12.5px] text-[var(--los-faint)]">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {m.role === "owner" ? (
                  <Badge tone="brand">owner</Badge>
                ) : props.canManage ? (
                  <>
                    <Select
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => start(() => changeMemberRole(m.id, e.target.value))}
                      className="!w-auto py-1 text-[13px]"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </Select>
                    {m.userId !== props.selfUserId && (
                      <GhostButton
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Remove ${m.email} from the organization?`)) start(() => removeMember(m.id));
                        }}
                        className="!px-2 !py-1 text-[13px] text-[var(--los-danger)]"
                      >
                        Remove
                      </GhostButton>
                    )}
                  </>
                ) : (
                  <Badge>{m.role.replace(/_/g, " ")}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {props.invites.length > 0 && (
        <Card>
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Pending invitations</div>
          <ul className="divide-y divide-[var(--los-line)]">
            {props.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-[14px]">{i.email}</div>
                  <div className="text-[12.5px] capitalize text-[var(--los-faint)]">{i.role.replace(/_/g, " ")}</div>
                </div>
                {props.canManage && (
                  <GhostButton disabled={pending} onClick={() => start(() => revokeInvite(i.id))} className="!px-2 !py-1 text-[13px]">
                    Revoke
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
