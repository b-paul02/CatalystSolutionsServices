import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { Badge, Card } from "@/components/leados/ui";
import TaskList from "./TaskList";

export const metadata = { title: "My day" };

// The personal work queue: due tasks first, then untouched assigned leads.
export default async function TasksPage() {
  const actor = await requireOrg("leads.view");
  const now = new Date();
  const [tasks, needsAttention] = await Promise.all([
    db.losTask.findMany({
      where: { orgId: actor.orgId, assigneeId: actor.userId, doneAt: null },
      orderBy: { dueAt: "asc" },
      take: 50,
    }),
    db.losLead.findMany({
      where: { orgId: actor.orgId, ownerId: actor.userId, deletedAt: null, status: { in: ["assigned", "new"] } },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
  ]);
  const leadIds = tasks.map((t) => t.leadId).filter(Boolean) as string[];
  const leads = await db.losLead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const leadName = (id: string | null) => {
    const l = leads.find((x) => x.id === id);
    return l ? [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email || l.phone : null;
  };
  return (
    <div className="max-w-[760px]">
      <h1 className="mb-1 text-[22px] font-extrabold tracking-tight">My day</h1>
      <p className="mb-5 text-[13.5px] text-[var(--los-muted)]">
        {tasks.filter((t) => t.dueAt <= now).length} due now · {tasks.length} open task{tasks.length === 1 ? "" : "s"} · {needsAttention.length} lead{needsAttention.length === 1 ? "" : "s"} waiting for first contact
      </p>
      <TaskList
        tasks={tasks.map((t) => ({
          id: t.id, title: t.title, kind: t.kind,
          dueAt: t.dueAt.toISOString(), overdue: t.dueAt <= now,
          leadId: t.leadId, leadName: leadName(t.leadId),
        }))}
      />
      <Card className="mt-5">
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Waiting for first contact</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {needsAttention.map((l) => (
            <li key={l.id} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]">
              <Link href={`/app/leads/${l.id}`} className="font-medium text-[var(--los-brand)] hover:underline">
                {[l.firstName, l.lastName].filter(Boolean).join(" ") || l.email || l.phone}
              </Link>
              <div className="flex items-center gap-2 text-[12.5px] text-[var(--los-faint)]">
                <Badge tone="warn">{l.status}</Badge>
                since {l.createdAt.toISOString().slice(0, 10)}
              </div>
            </li>
          ))}
          {needsAttention.length === 0 && <li className="px-5 py-6 text-center text-[13.5px] text-[var(--los-faint)]">All caught up. 🎉</li>}
        </ul>
      </Card>
    </div>
  );
}
