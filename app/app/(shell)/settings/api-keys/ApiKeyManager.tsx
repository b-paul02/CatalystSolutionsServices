"use client";

import { useActionState, useTransition } from "react";
import { createApiKey, revokeApiKey } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Card, FormNotice, GhostButton, Input, Label, SubmitButton } from "@/components/leados/ui";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export default function ApiKeyManager(props: { canManage: boolean; keys: Key[] }) {
  const [state, action] = useActionState<FormState & { secret?: string }, FormData>(createApiKey, {});
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {props.canManage && (
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Create a key</h2>
          <form action={action} className="space-y-3">
            <FormNotice state={state} />
            {state.secret && (
              <code className="block break-all rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13px] font-semibold">
                {state.secret}
              </code>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="key-name">Key name</Label>
                <Input id="key-name" name="name" required placeholder="Production integration" />
              </div>
              <SubmitButton>Create key</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Active keys</div>
        {props.keys.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px] text-[var(--los-faint)]">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--los-line)]">
            {props.keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{k.name}</div>
                  <div className="text-[12.5px] text-[var(--los-faint)]">
                    {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </div>
                </div>
                {props.canManage && (
                  <GhostButton
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Revoke "${k.name}"? Integrations using it will stop working.`)) start(() => revokeApiKey(k.id));
                    }}
                    className="!px-2 !py-1 text-[13px] text-[var(--los-danger)]"
                  >
                    Revoke
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
