import Link from "next/link";
import { requireOrgPage } from "@/lib/os/guard";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, EvidenceBadge, field, PageHeader } from "@/components/os/bits";
import { draftReport, publishReport } from "../../_os/actions";

export const metadata = { title: "Reports" };

type Body = { suggestions?: { text: string; evidence: string }[]; metrics: { name: string; value: number | null; label: string; baseline?: number | null; grade?: string | null; target?: number }[]; delivered: { title: string; studio: string | null }[]; next: { title: string; dueAt: Date | string | null }[]; narrative: string; limitations: string[] };

// Weekly owner brief / monthly note (blueprint §7.2): measured vs estimated vs
// unavailable, baseline comparison, what was delivered, what's next, limits.
export default async function ReportNotesPage() {
  const actor = await requireOrgPage("reports.view", "work.view");
  const reports = await db.cosReport.findMany({ where: { orgId: actor.orgId, ...(can(actor.role, "work.review") || can(actor.role, "strategy.manage") ? {} : { status: "published" }) }, orderBy: { createdAt: "desc" }, take: 12 });
  const author = can(actor.role, "strategy.manage") || can(actor.role, "work.review");
  return (
    <div className="max-w-[900px]">
      <PageHeader title="Reports" sub="Baseline comparison, what shipped, what's next — and what the numbers can't tell you.">
        <Link href="/app/reports" className="text-[13px] text-[var(--los-brand)] hover:underline">Live metrics →</Link>
      </PageHeader>
      {author && (
        <Card className="mb-5 p-4">
          <ActionForm action={draftReport} submit="Generate draft" tone="ghost" className="flex flex-wrap items-end gap-2 text-[13.5px]">
            <div><Label>Kind</Label><select name="kind" className={field}><option value="monthly">Monthly note</option><option value="weekly">Weekly brief</option></select></div>
            <div><Label>Period</Label><Input name="period" placeholder="2026-09 or 2026-09-14" /></div>
          </ActionForm>
        </Card>
      )}
      <div className="space-y-4">
        {reports.map((r) => {
          const b = JSON.parse(r.body) as Body;
          return (
            <Card key={r.id} className="p-5 text-[13.5px]">
              <div className="mb-2 flex items-center justify-between"><div className="text-[15px] font-bold capitalize">{r.kind} · {r.period}</div><span className="text-[12.5px] text-[var(--los-faint)]">{r.status === "published" ? `published ${day(r.publishedAt)}` : "draft"}</span></div>
              <table className="mb-3 w-full text-[13px]">
                <tbody>
                  {b.metrics.map((m) => (
                    <tr key={m.name} className="border-t border-[var(--los-line)]">
                      <td className="py-1 pr-2">{m.name}</td>
                      <td className="py-1 pr-2 text-right font-medium">{m.value === null || m.value === undefined ? "unavailable" : m.value.toLocaleString()}{m.target ? ` / ${m.target.toLocaleString()}` : ""}</td>
                      <td className="py-1 pr-2 text-right text-[var(--los-faint)]">{m.baseline !== null && m.baseline !== undefined ? `baseline ${m.baseline}` : ""}</td>
                      <td className="py-1 text-right"><EvidenceBadge label={m.label} />{m.grade ? <span className="ml-1 text-[11.5px] text-[var(--los-faint)]">{m.grade}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {b.narrative ? <p className="mb-3 whitespace-pre-wrap">{b.narrative}</p> : null}
              {b.suggestions?.length ? <ul className="mb-3 list-disc pl-5 text-[13px]">{b.suggestions.map((s, i) => <li key={i}>{s.text} <span className="text-[var(--los-faint)]">— based on {s.evidence}</span></li>)}</ul> : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div><div className="font-semibold">Delivered</div><ul className="ml-4 list-disc text-[13px]">{b.delivered.map((d) => <li key={d.title}>{d.title}{d.studio ? ` (${d.studio})` : ""}</li>)}{b.delivered.length === 0 && <li className="text-[var(--los-faint)]">nothing in period</li>}</ul></div>
                <div><div className="font-semibold">Next</div><ul className="ml-4 list-disc text-[13px]">{b.next.map((n) => <li key={n.title}>{n.title}{n.dueAt ? ` · due ${String(n.dueAt).slice(0, 10)}` : ""}</li>)}</ul></div>
              </div>
              <p className="mt-3 text-[12px] text-[var(--los-faint)]">Limitations: {b.limitations.join(" ")}</p>
              {author && r.status === "draft" && (
                <ActionForm action={publishReport} submit="Publish to client" hidden={{ id: r.id }} className="mt-3 space-y-2 border-t border-[var(--los-line)] pt-3" confirm="Published reports are immutable. Publish?">
                  <Label>Narrative — what worked, what didn&apos;t, and why (no guarantees)</Label>
                  <textarea name="narrative" rows={5} defaultValue={b.narrative} className={field} />
                </ActionForm>
              )}
            </Card>
          );
        })}
        {reports.length === 0 && <Card><Empty>No reports yet.</Empty></Card>}
      </div>
    </div>
  );
}
