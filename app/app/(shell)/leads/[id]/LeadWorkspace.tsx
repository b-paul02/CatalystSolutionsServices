"use client";

// Lead workspace: timeline, notes, tasks, messages, sequences — below the
// profile columns. Sends run through the guarded outreach path.
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote, addTask, enrollInSequence, sendOneToOne, toggleTask } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Badge, Card, FormNotice, GhostButton, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

type Activity = { id: string; kind: string; at: string; actor: string | null; data: Record<string, unknown> };
type Note = { id: string; body: string; author: string; at: string };
type Task = { id: string; title: string; kind: string; dueAt: string; done: boolean; assignee: string };
type Message = { id: string; channel: string; status: string; body: string; at: string; events: string[] };

export default function LeadWorkspace(props: {
  leadId: string;
  canContact: boolean;
  canEdit: boolean;
  activities: Activity[];
  notes: Note[];
  tasks: Task[];
  messages: Message[];
  templates: { id: string; name: string; channel: string; subject: string | null; body: string }[];
  sequences: { id: string; name: string }[];
  enrollment: { sequenceName: string; status: string } | null;
  members: { userId: string; label: string }[];
  permittedChannels: string[] | null; // null for b2b (no channel gating)
}) {
  const [tab, setTab] = useState<"timeline" | "notes" | "tasks" | "messages">("timeline");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [noteState, noteAction] = useActionState<FormState, FormData>(addNote, {});
  const [taskState, taskAction] = useActionState<FormState, FormData>(addTask, {});
  const [msgState, msgAction] = useActionState<FormState, FormData>(sendOneToOne, {});
  const [channel, setChannel] = useState("whatsapp");
  const [body, setBody] = useState("");

  const describe = (a: Activity): string => {
    switch (a.kind) {
      case "stage_change": return `Stage: ${a.data.from} → ${a.data.to}${a.data.lostReason ? ` (${a.data.lostReason})` : ""}`;
      case "note": return `Note: ${a.data.preview}`;
      case "task_created": return `Task created: ${a.data.title}`;
      case "task_done": return `Task done: ${a.data.title}`;
      case "message_sent": return `Message sent via ${a.data.channel} (${a.data.status})`;
      case "message_event": return `Reply received via ${a.data.channel}`;
      default: return a.kind.replace(/_/g, " ");
    }
  };

  return (
    <Card className="mt-4">
      <div className="flex gap-1 border-b border-[var(--los-line)] px-4 pt-3">
        {(["timeline", "notes", "tasks", "messages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-2 text-[13.5px] font-medium capitalize ${tab === t ? "bg-[var(--los-brand-soft)] text-[var(--los-brand)]" : "text-[var(--los-muted)]"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "timeline" && (
          <ul className="space-y-2">
            {props.activities.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="shrink-0 text-[12px] text-[var(--los-faint)]">{a.at}</span>
                <span>{describe(a)}</span>
                {a.actor && <span className="text-[12px] text-[var(--los-faint)]">— {a.actor}</span>}
              </li>
            ))}
            {props.activities.length === 0 && <li className="text-[13.5px] text-[var(--los-faint)]">No activity yet.</li>}
          </ul>
        )}

        {tab === "notes" && (
          <div className="space-y-3">
            {props.canEdit && (
              <form action={noteAction} className="space-y-2">
                <FormNotice state={noteState} />
                <input type="hidden" name="leadId" value={props.leadId} />
                <textarea
                  name="body" placeholder="Add a note… (@email to mention)"
                  className="h-20 w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px]"
                />
                <SubmitButton>Add note</SubmitButton>
              </form>
            )}
            {props.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-[var(--los-surface-2)] p-3 text-[13.5px]">
                <div className="mb-1 text-[12px] text-[var(--los-faint)]">{n.author} · {n.at}</div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-3">
            {props.canEdit && (
              <form action={taskAction} className="flex flex-wrap items-end gap-2">
                <FormNotice state={taskState} />
                <input type="hidden" name="leadId" value={props.leadId} />
                <div className="min-w-[200px] flex-1"><Label>Task</Label><Input name="title" placeholder="Call about site visit" /></div>
                <div><Label>Type</Label><Select name="kind"><option value="call">Call</option><option value="follow_up">Follow-up</option><option value="other">Other</option></Select></div>
                <div><Label>Due</Label><Input name="dueAt" type="datetime-local" /></div>
                <div><Label>Assignee</Label>
                  <Select name="assigneeId">{props.members.map((m) => <option key={m.userId} value={m.userId}>{m.label}</option>)}</Select>
                </div>
                <SubmitButton>Add</SubmitButton>
              </form>
            )}
            <ul className="space-y-1.5">
              {props.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" checked={t.done} disabled={pending || !props.canEdit}
                    onChange={() => start(async () => { await toggleTask(t.id); router.refresh(); })} />
                  <span className={t.done ? "text-[var(--los-faint)] line-through" : ""}>{t.title}</span>
                  <Badge>{t.kind.replace(/_/g, " ")}</Badge>
                  <span className={`text-[12px] ${!t.done && t.dueAt < new Date().toISOString() ? "text-[var(--los-danger)]" : "text-[var(--los-faint)]"}`}>
                    due {t.dueAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="text-[12px] text-[var(--los-faint)]">· {t.assignee}</span>
                </li>
              ))}
              {props.tasks.length === 0 && <li className="text-[13.5px] text-[var(--los-faint)]">No tasks.</li>}
            </ul>
          </div>
        )}

        {tab === "messages" && (
          <div className="space-y-3">
            {props.canContact && (
              <form action={msgAction} className="space-y-2 rounded-lg bg-[var(--los-surface-2)] p-3">
                <FormNotice state={msgState} />
                <input type="hidden" name="leadId" value={props.leadId} />
                <div className="flex flex-wrap items-end gap-2">
                  <div><Label>Channel</Label>
                    <Select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                      {["whatsapp", "sms", "email"].map((ch) => (
                        <option key={ch} value={ch} disabled={props.permittedChannels !== null && !props.permittedChannels.includes(ch)}>
                          {ch}{props.permittedChannels !== null && !props.permittedChannels.includes(ch) ? " (no consent)" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <Label>Template</Label>
                    <Select
                      defaultValue=""
                      onChange={(e) => {
                        const t = props.templates.find((x) => x.id === e.target.value);
                        if (t) setBody(t.body);
                      }}
                    >
                      <option value="">— none —</option>
                      {props.templates.filter((t) => t.channel === channel).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </div>
                </div>
                {channel === "email" && <div><Label>Subject</Label><Input name="subject" /></div>}
                <textarea
                  name="body" value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{firstName}}, …"
                  className="h-24 w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px]"
                />
                <div className="flex items-center gap-2">
                  <SubmitButton>Send</SubmitButton>
                  {props.sequences.length > 0 && !props.enrollment && (
                    <Select
                      defaultValue=""
                      disabled={pending}
                      onChange={(e) => {
                        if (e.target.value) start(async () => { await enrollInSequence(props.leadId, e.target.value); router.refresh(); });
                      }}
                      className="!w-auto"
                    >
                      <option value="">Enroll in sequence…</option>
                      {props.sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  )}
                  {props.enrollment && (
                    <Badge tone={props.enrollment.status === "active" ? "brand" : "neutral"}>
                      {props.enrollment.sequenceName}: {props.enrollment.status.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
              </form>
            )}
            <ul className="space-y-2">
              {props.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-[var(--los-line)] p-3 text-[13.5px]">
                  <div className="mb-1 flex items-center gap-2 text-[12px] text-[var(--los-faint)]">
                    <Badge tone={m.status === "sent" ? "success" : m.status === "blocked" || m.status === "failed" ? "danger" : "neutral"}>{m.channel} · {m.status.replace(/_/g, " ")}</Badge>
                    {m.at}
                    {m.events.map((e, i) => <Badge key={i} tone="warn">{e}</Badge>)}
                  </div>
                  <div className="whitespace-pre-wrap text-[var(--los-muted)]">{m.body.slice(0, 300)}</div>
                </li>
              ))}
              {props.messages.length === 0 && <li className="text-[13.5px] text-[var(--los-faint)]">No messages yet.</li>}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
