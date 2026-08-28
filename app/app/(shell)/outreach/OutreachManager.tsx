"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSequence, deleteTemplate, saveTemplate, setSequenceStatus } from "./actions";
import type { FormState } from "../../(auth)/actions";
import { Badge, Card, FormNotice, GhostButton, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

type Template = { id: string; name: string; channel: string; subject: string | null; body: string };
type Sequence = { id: string; name: string; status: string; enrollments: number; steps: { label: string }[] };

export default function OutreachManager(props: {
  canManageTemplates: boolean;
  canManageSequences: boolean;
  templates: Template[];
  sequences: Sequence[];
  messages: { id: string; channel: string; status: string; blockReason: string | null; at: string }[];
}) {
  const [tplState, tplAction] = useActionState<FormState, FormData>(saveTemplate, {});
  const [seqState, seqAction] = useActionState<FormState, FormData>(createSequence, {});
  const [pending, start] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState<Template | null>(null);
  const [steps, setSteps] = useState<{ templateId: string; delay: number }[]>([{ templateId: "", delay: 24 }]);

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-extrabold tracking-tight">Outreach</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Message templates</h2>
          <ul className="mb-4 space-y-2">
            {props.templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13.5px]">
                <span className="font-medium">{t.name}</span>
                <Badge>{t.channel}</Badge>
                {props.canManageTemplates && (
                  <span className="ml-auto flex gap-2 text-[12.5px]">
                    <button className="text-[var(--los-brand)]" onClick={() => setEditing(t)}>edit</button>
                    <button className="text-[var(--los-danger)]" onClick={() => { if (confirm(`Delete "${t.name}"?`)) start(async () => { await deleteTemplate(t.id); router.refresh(); }); }}>delete</button>
                  </span>
                )}
              </li>
            ))}
            {props.templates.length === 0 && <li className="text-[13px] text-[var(--los-faint)]">No templates yet.</li>}
          </ul>
          {props.canManageTemplates && (
            <form action={tplAction} className="space-y-3 rounded-lg bg-[var(--los-surface-2)] p-3" key={editing?.id ?? "new"}>
              <FormNotice state={tplState} />
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="flex gap-2">
                <div className="flex-1"><Label>Name</Label><Input name="name" defaultValue={editing?.name ?? ""} placeholder="First follow-up" /></div>
                <div><Label>Channel</Label>
                  <Select name="channel" defaultValue={editing?.channel ?? "whatsapp"}>
                    <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
                  </Select>
                </div>
              </div>
              <div><Label>Subject (email only)</Label><Input name="subject" defaultValue={editing?.subject ?? ""} /></div>
              <div>
                <Label>Body — variables: {"{{firstName}} {{lastName}} {{city}}"}</Label>
                <textarea name="body" defaultValue={editing?.body ?? ""} className="h-24 w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px]" />
              </div>
              <div className="flex gap-2">
                <SubmitButton>{editing ? "Update" : "Create"} template</SubmitButton>
                {editing && <GhostButton onClick={() => setEditing(null)}>Cancel</GhostButton>}
              </div>
            </form>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Sequences</h2>
          <ul className="mb-4 space-y-2">
            {props.sequences.map((s) => (
              <li key={s.id} className="rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13.5px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge tone={s.status === "active" ? "success" : "warn"}>{s.status}</Badge>
                  <span className="text-[12px] text-[var(--los-faint)]">{s.enrollments} enrolled</span>
                  {props.canManageSequences && (
                    <button
                      className="ml-auto text-[12.5px] text-[var(--los-brand)]"
                      onClick={() => start(async () => { await setSequenceStatus(s.id, s.status === "active" ? "paused" : "active"); router.refresh(); })}
                      disabled={pending}
                    >
                      {s.status === "active" ? "pause" : "resume"}
                    </button>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-[var(--los-muted)]">{s.steps.map((st) => st.label).join(" → ")}</div>
              </li>
            ))}
            {props.sequences.length === 0 && <li className="text-[13px] text-[var(--los-faint)]">No sequences yet.</li>}
          </ul>
          {props.canManageSequences && props.templates.length > 0 && (
            <form action={seqAction} className="space-y-3 rounded-lg bg-[var(--los-surface-2)] p-3">
              <FormNotice state={seqState} />
              <div><Label>Sequence name</Label><Input name="name" placeholder="New-lead nurture" /></div>
              {steps.map((s, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label>Step {i + 1} template</Label>
                    <Select name="stepTemplate" value={s.templateId} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, templateId: e.target.value } : x)))}>
                      <option value="">Select…</option>
                      {props.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
                    </Select>
                  </div>
                  <div className="w-[110px]">
                    <Label>Delay (h)</Label>
                    <Input name="stepDelay" type="number" min={1} value={s.delay} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, delay: parseInt(e.target.value, 10) || 24 } : x)))} />
                  </div>
                  {i === steps.length - 1 && steps.length < 6 && (
                    <GhostButton onClick={() => setSteps([...steps, { templateId: "", delay: 48 }])} className="!px-2.5">+</GhostButton>
                  )}
                </div>
              ))}
              <SubmitButton>Create sequence</SubmitButton>
              <p className="text-[12px] text-[var(--los-faint)]">
                Sequences stop automatically on reply, opt-out, conversion, or lost. Sends respect consent channels and working hours (9:00–19:00 IST).
              </p>
            </form>
          )}
        </Card>
      </div>

      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Recent sends</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {props.messages.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-5 py-2 text-[13px]">
              <span className="flex items-center gap-2">
                <Badge tone={m.status === "sent" ? "success" : m.status === "blocked" || m.status === "failed" ? "danger" : "neutral"}>{m.channel}</Badge>
                {m.status.replace(/_/g, " ")}{m.blockReason ? ` — ${m.blockReason.replace(/_/g, " ")}` : ""}
              </span>
              <span className="text-[12.5px] text-[var(--los-faint)]">{m.at}</span>
            </li>
          ))}
          {props.messages.length === 0 && <li className="px-5 py-6 text-center text-[13px] text-[var(--los-faint)]">No messages yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
