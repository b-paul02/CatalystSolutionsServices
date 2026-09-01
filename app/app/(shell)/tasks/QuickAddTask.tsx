"use client";

import { useActionState } from "react";
import { addTask } from "../leads/actions";
import type { FormState } from "@/app/app/(auth)/actions";
import { Card, Input, Label } from "@/components/leados/ui";

export default function QuickAddTask() {
  const [state, action] = useActionState<FormState, FormData>(addTask, {});
  return (
    <Card className="mb-5">
      <form action={action} className="flex flex-wrap items-end gap-3 px-5 py-4 text-[13.5px]">
        <div className="min-w-[220px] flex-1">
          <Label>New task</Label>
          <Input name="title" required placeholder="Call back about pricing" />
        </div>
        <div>
          <Label>Kind</Label>
          <select name="kind" className="w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[13.5px]">
            <option value="follow_up">Follow-up</option>
            <option value="call">Call</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <Label>Due</Label>
          <Input name="dueAt" type="datetime-local" required />
        </div>
        <button className="rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[13.5px] font-semibold text-white">Add</button>
        {state.error && <p className="w-full text-[13px] text-[var(--los-danger)]">{state.error}</p>}
      </form>
    </Card>
  );
}
