"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmMfa, disableMfa, revokeOtherSessions, revokeSession, startMfaSetup } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Badge, Card, FormNotice, GhostButton, Input, Label, SubmitButton } from "@/components/leados/ui";

type Session = { id: string; ip: string | null; userAgent: string | null; lastSeenAt: string };

export default function SecurityManager(props: { mfaEnabled: boolean; currentSessionId: string; sessions: Session[] }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [confirmState, confirmAction] = useActionState<FormState, FormData>(confirmMfa, {});
  const [disableState, disableAction] = useActionState<FormState, FormData>(disableMfa, {});
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[15px] font-bold">Two-factor authentication</h2>
          {props.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
        </div>

        {!props.mfaEnabled && !setup && (
          <>
            <p className="mb-3 text-[13.5px] text-[var(--los-muted)]">
              Add a 6-digit authenticator code to every sign-in.
            </p>
            <GhostButton disabled={pending} onClick={() => start(async () => setSetup(await startMfaSetup()))}>
              Set up MFA
            </GhostButton>
          </>
        )}

        {!props.mfaEnabled && setup && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-[var(--los-muted)]">
              In your authenticator app (Google Authenticator, 1Password, Authy…), add an account by
              <strong> manual entry</strong> with this secret key:
            </p>
            <code className="block break-all rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13px] font-semibold tracking-wide">
              {setup.secret}
            </code>
            <p className="break-all text-[12px] text-[var(--los-faint)]">or paste the URI: {setup.uri}</p>
            <form action={confirmAction} className="space-y-3">
              <FormNotice state={confirmState} />
              <div className="max-w-[220px]">
                <Label htmlFor="mfa-code">Enter the current code to confirm</Label>
                <Input id="mfa-code" name="code" inputMode="numeric" maxLength={6} required />
              </div>
              <SubmitButton>Turn on MFA</SubmitButton>
            </form>
          </div>
        )}

        {props.mfaEnabled && (
          <form action={disableAction} className="space-y-3">
            <FormNotice state={disableState} />
            <div className="max-w-[220px]">
              <Label htmlFor="mfa-off-code">Current code</Label>
              <Input id="mfa-off-code" name="code" inputMode="numeric" maxLength={6} required />
            </div>
            <SubmitButton className="!bg-[var(--los-danger)]">Turn off MFA</SubmitButton>
          </form>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-[var(--los-line)] px-5 py-3">
          <h2 className="text-[15px] font-bold">Active sessions</h2>
          <GhostButton disabled={pending} onClick={() => start(() => revokeOtherSessions())} className="!px-2 !py-1 text-[13px]">
            Sign out other sessions
          </GhostButton>
        </div>
        <ul className="divide-y divide-[var(--los-line)]">
          {props.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13.5px] font-medium">
                  {s.ip ?? "unknown ip"}
                  {s.id === props.currentSessionId && <Badge tone="brand">this device</Badge>}
                </div>
                <div className="truncate text-[12px] text-[var(--los-faint)]">
                  {s.userAgent ?? "unknown device"} · active {new Date(s.lastSeenAt).toLocaleString()}
                </div>
              </div>
              {s.id !== props.currentSessionId && (
                <GhostButton disabled={pending} onClick={() => start(() => revokeSession(s.id))} className="!px-2 !py-1 text-[13px]">
                  Revoke
                </GhostButton>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
