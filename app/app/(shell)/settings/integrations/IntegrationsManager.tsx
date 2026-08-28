"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWebhook, deleteWebhook, saveSlack, toggleWebhook } from "./actions";
import type { FormState } from "../../../(auth)/actions";
import { Badge, Card, FormNotice, GhostButton, Input, Label, SubmitButton } from "@/components/leados/ui";

const EVENTS = ["lead.created", "lead.status_changed", "leads.delivered"];

export default function IntegrationsManager(props: {
  canManage: boolean;
  slackUrl: string;
  providers: { name: string; on: boolean }[];
  webhooks: { id: string; url: string; events: string[]; active: boolean; failCount: number; lastStatus: string | null; lastFiredAt: string | null }[];
}) {
  const [hookState, hookAction] = useActionState<FormState & { secret?: string }, FormData>(addWebhook, {});
  const [slackState, slackAction] = useActionState<FormState, FormData>(saveSlack, {});
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-2 text-[15px] font-bold">Platform channels</h2>
        <ul className="space-y-1.5 text-[13.5px]">
          {props.providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between">
              {p.name}
              <Badge tone={p.on ? "success" : "neutral"}>{p.on ? "connected" : "not configured"}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">Channels are configured platform-wide by the Catalyst team.</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-[15px] font-bold">Slack notifications</h2>
        <form action={slackAction} className="flex flex-wrap items-end gap-2">
          <FormNotice state={slackState} />
          <div className="min-w-[300px] flex-1">
            <Label>Incoming webhook URL</Label>
            <Input name="slackWebhookUrl" defaultValue={props.slackUrl} placeholder="https://hooks.slack.com/services/…" disabled={!props.canManage} />
          </div>
          {props.canManage && <SubmitButton>Save</SubmitButton>}
        </form>
        <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">Every new lead pings this channel. Create an incoming webhook in Slack → Apps.</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-[15px] font-bold">Outbound webhooks</h2>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">
          Connect Zapier, Make, n8n, or your CRM. Deliveries are signed with <code className="rounded bg-[var(--los-surface-2)] px-1">X-LeadOS-Signature: sha256=HMAC(body, secret)</code> and retried with backoff on failure.
        </p>
        <ul className="mb-4 space-y-2">
          {props.webhooks.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13px]">
              <span className="max-w-[320px] truncate font-medium">{w.url}</span>
              {w.events.map((e) => <Badge key={e}>{e}</Badge>)}
              <Badge tone={w.active ? (w.failCount > 3 ? "warn" : "success") : "neutral"}>
                {w.active ? (w.failCount > 3 ? `failing ×${w.failCount}` : "active") : "paused"}
              </Badge>
              {w.lastFiredAt && <span className="text-[11.5px] text-[var(--los-faint)]">last {w.lastFiredAt} ({w.lastStatus})</span>}
              {props.canManage && (
                <span className="ml-auto flex gap-2 text-[12.5px]">
                  <button className="text-[var(--los-brand)]" disabled={pending} onClick={() => start(async () => { await toggleWebhook(w.id); router.refresh(); })}>
                    {w.active ? "pause" : "resume"}
                  </button>
                  <button className="text-[var(--los-danger)]" disabled={pending} onClick={() => { if (confirm("Delete this webhook?")) start(async () => { await deleteWebhook(w.id); router.refresh(); }); }}>
                    delete
                  </button>
                </span>
              )}
            </li>
          ))}
          {props.webhooks.length === 0 && <li className="text-[13px] text-[var(--los-faint)]">No webhooks yet.</li>}
        </ul>
        {props.canManage && (
          <form action={hookAction} className="space-y-3 rounded-lg bg-[var(--los-surface-2)] p-3">
            <FormNotice state={hookState} />
            {hookState.secret && (
              <code className="block break-all rounded-lg bg-[var(--los-surface)] px-3 py-2 text-[12.5px] font-semibold">{hookState.secret}</code>
            )}
            <div><Label>Endpoint URL</Label><Input name="url" placeholder="https://hooks.zapier.com/…" /></div>
            <div className="flex flex-wrap gap-3 text-[13px]">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-1.5">
                  <input type="checkbox" name="events" value={e} defaultChecked={e === "lead.created"} /> {e}
                </label>
              ))}
            </div>
            <SubmitButton>Add webhook</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
