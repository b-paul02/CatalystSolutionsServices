import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireModule } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { STAGE_LABEL, type EngagementStage } from "@/lib/os/engagement";
import { Card } from "@/components/leados/ui";
import { PageHeader, day } from "@/components/os/bits";
import { Notice, Pill } from "@/components/os/v2";

export const metadata = { title: "Engagement" };

export default async function EngagementsPage() {
  const { actor } = await requireModule("engagement", "work.view");
  const list = await db.cosEngagement.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" } });
  if (list.length === 1) redirect(`/app/engagement/${list[0].id}`);
  return (
    <div className="max-w-[900px]">
      <PageHeader title="Engagements" sub="Each engagement has its own goals, scope and commercial record.">
        {can(actor.role, "org.export") && <a href="/api/os/export" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--los-surface-2)]">Export everything</a>}
      </PageHeader>
      <Card>
        {list.length === 0 ? <Notice title="No engagement yet">Your Catalyst account lead sets this up with you. Once scope is proposed you will see it on Home to review and sign.</Notice> : (
          <ul className="divide-y divide-[var(--los-line)]">
            {list.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
                <div><Link href={`/app/engagement/${e.id}`} className="font-semibold text-[var(--los-brand)] hover:underline">{e.name}</Link><div className="text-[12px] text-[var(--los-faint)]">{e.goalFocus.join(", ") || "focus not set"}{e.renewalAt ? ` · renews ${day(e.renewalAt)}` : ""}</div></div>
                <div className="flex items-center gap-2">{e.hold !== "none" && <Pill value={e.hold} />}<Pill value={e.stage} label={STAGE_LABEL[e.stage as EngagementStage] ?? e.stage} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
