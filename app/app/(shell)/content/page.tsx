import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field, PageHeader, StateBadge } from "@/components/os/bits";
import { fillCalendar, newContentItem } from "../_os/actions";

export const metadata = { title: "Content Studio" };

const CHANNELS = ["linkedin", "x", "facebook", "instagram", "blog", "email", "whatsapp"];

// Two-week calendar of content work items (blueprint §6.2). Publishing is a
// tier-2 action: every item passes QA → client approval before "scheduled".
export default async function ContentPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { actor } = await requireModule("content", "work.view");
  const sp = await searchParams;
  const start = sp.start && !Number.isNaN(Date.parse(sp.start)) ? new Date(sp.start) : new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 14 * 86_400_000);
  const [scheduled, unscheduled] = await Promise.all([
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, type: "content", scheduledAt: { gte: start, lt: end }, state: { notIn: ["cancelled"] } }, orderBy: { scheduledAt: "asc" } }),
    db.cosWorkItem.findMany({ where: { orgId: actor.orgId, type: "content", scheduledAt: null, state: { notIn: ["cancelled", "closed"] } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const manage = can(actor.role, "work.manage");
  const shift = (n: number) => `/app/content?start=${new Date(start.getTime() + n * 86_400_000).toISOString().slice(0, 10)}`;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Content Studio" sub={`${day(start)} → ${day(new Date(end.getTime() - 1))}`}>
        <div className="flex gap-2 text-[13px]"><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href={shift(-14)}>← Prev</Link><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href="/app/content">Today</Link><Link className="rounded-lg border border-[var(--los-line)] px-3 py-1.5" href={shift(14)}>Next →</Link></div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-7">
        {days.map((d) => {
          const items = scheduled.filter((w) => w.scheduledAt && day(w.scheduledAt) === day(d));
          return (
            <Card key={d.toISOString()} className="min-h-[110px] p-2">
              <div className="mb-1 text-[11.5px] font-semibold text-[var(--los-faint)]">{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</div>
              {items.map((w) => {
                const p = w.payload ? (JSON.parse(w.payload) as { channel?: string }) : {};
                return (
                  <Link key={w.id} href={`/app/work/${w.id}`} className="mb-1 block rounded-md bg-[var(--los-surface-2)] px-1.5 py-1 text-[12px] hover:bg-[var(--los-brand-soft)]">
                    <div className="truncate font-medium">{w.title}</div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--los-faint)]"><span>{p.channel}</span><StateBadge state={w.state} /></div>
                  </Link>
                );
              })}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {manage && (
          <Card className="p-5">
            <div className="mb-2 text-[15px] font-bold">Fill the fortnight</div>
            {aiAvailable() ? (
              <ActionForm action={fillCalendar} submit="Generate drafts" hidden={{ start: day(start) }} className="space-y-2 text-[13.5px]">
                <div className="flex flex-wrap gap-2">{CHANNELS.map((c) => <label key={c} className="flex items-center gap-1 capitalize"><input type="checkbox" name="channels" value={c} defaultChecked={c === "linkedin" || c === "blog"} />{c}</label>)}</div>
                <p className="text-[12px] text-[var(--los-faint)]">Creates draft items (persona, hook, format, CTA) from the brand profile and audit. Nothing is published without QA and your approval.</p>
              </ActionForm>
            ) : <p className="text-[13px] text-[var(--los-warn)]">AI is not configured (LLM_API_KEY). Add items manually.</p>}
          </Card>
        )}
        {manage && (
          <Card className="p-5">
            <div className="mb-2 text-[15px] font-bold">Add an item</div>
            <ActionForm action={newContentItem} submit="Add" className="grid gap-2 text-[13.5px] md:grid-cols-2">
              <div className="md:col-span-2"><Label>Topic / title</Label><Input name="title" required /></div>
              <div><Label>Channel</Label><select name="channel" className={field}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><Label>Scheduled</Label><Input name="scheduledAt" type="date" /></div>
              <div><Label>Hook</Label><Input name="hook" /></div>
              <div><Label>CTA</Label><Input name="cta" /></div>
            </ActionForm>
          </Card>
        )}
      </div>

      {unscheduled.length > 0 && (
        <Card className="mt-5">
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Unscheduled</div>
          <ul className="divide-y divide-[var(--los-line)]">
            {unscheduled.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-5 py-2 text-[13.5px]"><Link href={`/app/work/${w.id}`} className="font-medium text-[var(--los-brand)] hover:underline">{w.title}</Link><StateBadge state={w.state} /></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
