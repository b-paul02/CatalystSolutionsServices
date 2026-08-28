"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTask } from "../leads/actions";
import { Badge, Card } from "@/components/leados/ui";

type Task = { id: string; title: string; kind: string; dueAt: string; overdue: boolean; leadId: string | null; leadName: string | null };

export default function TaskList({ tasks }: { tasks: Task[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Tasks</div>
      <ul className="divide-y divide-[var(--los-line)]">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
            <input type="checkbox" disabled={pending} onChange={() => start(async () => { await toggleTask(t.id); router.refresh(); })} />
            <span className="flex-1">
              {t.title}
              {t.leadId && t.leadName && (
                <>
                  {" · "}
                  <Link href={`/app/leads/${t.leadId}`} className="text-[var(--los-brand)] hover:underline">{t.leadName}</Link>
                </>
              )}
            </span>
            <Badge>{t.kind.replace(/_/g, " ")}</Badge>
            <span className={`text-[12.5px] ${t.overdue ? "font-semibold text-[var(--los-danger)]" : "text-[var(--los-faint)]"}`}>
              {t.dueAt.slice(0, 16).replace("T", " ")}
            </span>
          </li>
        ))}
        {tasks.length === 0 && <li className="px-5 py-6 text-center text-[13.5px] text-[var(--los-faint)]">No open tasks.</li>}
      </ul>
    </Card>
  );
}
