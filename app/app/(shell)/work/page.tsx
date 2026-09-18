import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { SERVICES } from "@/lib/os/catalog";
import { WORK_STATES } from "@/lib/os/workflow";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, field, human, PageHeader, StateBadge, TierBadge } from "@/components/os/bits";
import { newWorkItem, requestService } from "../_os/actions";

export const metadata = { title: "Work" };

// The one work ledger: tasks, content, projects, experiments, change requests.
export default async function WorkPage({ searchParams }: { searchParams: Promise<{ state?: string; studio?: string; request?: string }> }) {
  const actor = await requireOrg();
  const sp = await searchParams;
  const viewAll = can(actor.role, "work.view");
  const state = (WORK_STATES as readonly string[]).includes(sp.state ?? "") ? sp.state : undefined;
  const items = await db.cosWorkItem.findMany({
    where: {
      orgId: actor.orgId, parentId: null,
      ...(viewAll ? {} : { assigneeId: actor.userId }), // freelancers: assigned only
      ...(state ? { state } : { state: { notIn: ["closed", "cancelled"] } }),
      ...(sp.studio ? { studio: sp.studio } : {}),
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
  const studios = [...new Set(SERVICES.map((s) => s.studio))];
  const manage = can(actor.role, "work.manage");

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Work" sub="Every recommendation, task, project and request — with its owner, state and approval trail." />

      <div className="mb-4 flex flex-wrap gap-1.5 text-[12.5px]">
        <Link href="/app/work" className={`rounded-full border px-2.5 py-1 ${!state && !sp.studio ? "border-[var(--los-brand)] text-[var(--los-brand)]" : "border-[var(--los-line)] text-[var(--los-muted)]"}`}>Open</Link>
        {["blocked", "client_review", "internal_qa", "in_progress", "closed"].map((s) => (
          <Link key={s} href={`/app/work?state=${s}`} className={`rounded-full border px-2.5 py-1 capitalize ${state === s ? "border-[var(--los-brand)] text-[var(--los-brand)]" : "border-[var(--los-line)] text-[var(--los-muted)]"}`}>{human(s)}</Link>
        ))}
        <span className="mx-1 text-[var(--los-faint)]">·</span>
        {studios.map((s) => (
          <Link key={s} href={`/app/work?studio=${s}`} className={`rounded-full border px-2.5 py-1 ${sp.studio === s ? "border-[var(--los-brand)] text-[var(--los-brand)]" : "border-[var(--los-line)] text-[var(--los-muted)]"}`}>{s}</Link>
        ))}
      </div>

      <Card className="mb-6">
        <ul className="divide-y divide-[var(--los-line)]">
          {items.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]">
              <div className="min-w-0">
                <Link href={`/app/work/${w.id}`} className="font-medium text-[var(--los-brand)] hover:underline">{w.title}</Link>
                <div className="text-[12px] text-[var(--los-faint)]">{human(w.type)}{w.studio ? ` · ${w.studio}` : ""} · v{w.version} · due {day(w.dueAt)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2"><TierBadge tier={w.riskTier} /><StateBadge state={w.state} /></div>
            </li>
          ))}
          {items.length === 0 && <Empty>Nothing here.</Empty>}
        </ul>
      </Card>

      {manage && (
        <Card className="mb-6 p-5">
          <div className="mb-3 text-[15px] font-bold">New work item</div>
          <ActionForm action={newWorkItem} submit="Create" className="grid gap-3 text-[13.5px] md:grid-cols-2">
            <div className="md:col-span-2"><Label>Title</Label><Input name="title" required maxLength={160} /></div>
            <div><Label>Type</Label>
              <select name="type" className={field}><option value="task">Task</option><option value="project">Project (from service template)</option><option value="experiment">Experiment</option></select>
            </div>
            <div><Label>Service</Label>
              <select name="serviceSlug" className={field}><option value="">— none —</option>{SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}</select>
            </div>
            <div><Label>Risk tier</Label>
              <select name="riskTier" defaultValue="1" className={field}><option value="0">0 · read / reason</option><option value="1">1 · internal, reversible</option><option value="2">2 · publishes or contacts</option><option value="3">3 · money / release</option></select>
            </div>
            <div><Label>Due</Label><Input name="dueAt" type="date" /></div>
            <div className="md:col-span-2"><Label>Problem / objective</Label><textarea name="problem" rows={2} className={field} /></div>
            <div className="md:col-span-2"><Label>Success measure</Label><Input name="successMeasure" /></div>
            <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="clientReviewRequired" defaultChecked /> Client review required before delivery</label>
            <p className="text-[12px] text-[var(--los-faint)] md:col-span-2">A service outside the signed contract is created as a change request and cannot start until the client approves it.</p>
          </ActionForm>
        </Card>
      )}

      {can(actor.role, "work.request") && !manage && (
        <Card className="p-5" >
          <div className="mb-3 text-[15px] font-bold">Request a service</div>
          <ActionForm action={requestService} submit="Send request" className="grid gap-3 text-[13.5px]">
            <div><Label>What do you need?</Label><Input name="title" required maxLength={160} autoFocus={sp.request === "1"} /></div>
            <div><Label>Service</Label>
              <select name="serviceSlug" className={field}><option value="">Not sure</option>{SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}</select>
            </div>
            <div><Label>Details</Label><textarea name="details" rows={3} className={field} /></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
