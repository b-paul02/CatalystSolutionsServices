import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { Card, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, Empty, field, human, PageHeader, SectionTitle, TierBadge } from "@/components/os/bits";
import { decide, revoke } from "../_os/actions";

export const metadata = { title: "Approvals" };

// Decision inbox (blueprint §4.1): approve, approve with edits, reject with
// reason. Staff see the queue read-only — Catalyst can't approve its own work.
export default async function ApprovalsPage() {
  const { actor } = await requireModule("approvals", "work.view");
  const [pending, recent] = await Promise.all([
    db.cosApproval.findMany({ where: { orgId: actor.orgId, status: "requested" }, include: { workItem: true }, orderBy: { createdAt: "asc" } }),
    db.cosApproval.findMany({ where: { orgId: actor.orgId, status: { not: "requested" } }, include: { workItem: { select: { title: true, id: true } } }, orderBy: { decidedAt: "desc" }, take: 25 }),
  ]);
  // channel versions are approved one by one, each bound to its exact version
  const variantIds = pending.filter((a) => a.subject === "variant").map((a) => a.subjectId);
  const [variants, revisions] = await Promise.all([
    db.cosContentVariant.findMany({ where: { orgId: actor.orgId, id: { in: variantIds } } }),
    db.cosRevision.findMany({ where: { orgId: actor.orgId, subject: "variant", subjectId: { in: variantIds } }, orderBy: { version: "desc" } }),
  ]);
  const canDecide = can(actor.role, "approvals.decide");
  const canSpend = can(actor.role, "spend.approve");

  return (
    <div className="max-w-[900px]">
      <PageHeader title="Approvals" sub="Nothing is published, sent, launched or charged without a decision recorded here." />
      <div className="space-y-4">
        {pending.map((a) => {
          const item = a.workItem;
          const variant = a.subject === "variant" ? variants.find((v) => v.id === a.subjectId) : undefined;
          const body = variant ? (variant.format === "thread" ? variant.parts.join("\n\n") : variant.body) : item?.payload ? ((JSON.parse(item.payload) as { body?: string }).body ?? "") : "";
          const earlier = variant ? revisions.filter((r) => r.subjectId === variant.id && r.version < variant.version) : [];
          const href = variant ? `/app/content/${variant.workItemId}#v-${variant.id}` : `/app/work/${a.subjectId}`;
          const diff: { inScope?: boolean; incrementalCharge?: number } = a.diff ? JSON.parse(a.diff) : {};
          const spend = (item?.riskTier ?? 0) >= 3 || (diff.inScope === false && (diff.incrementalCharge ?? 0) > 0);
          const allowed = spend ? canSpend : canDecide;
          return (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={href} className="text-[15px] font-bold text-[var(--los-brand)] hover:underline">{a.summary}</Link>
                  <div className="text-[12.5px] text-[var(--los-faint)]">v{a.version} · requested {day(a.createdAt)} · expires {day(a.expiresAt)}</div>
                </div>
                {item && <TierBadge tier={item.riskTier} />}
              </div>
              {diff.inScope === false && (
                <p className="mt-2 rounded-lg border border-[var(--los-warn)] px-3 py-2 text-[13px]">
                  Scope change — outside your current contract.{diff.incrementalCharge ? ` Incremental charge: ${diff.incrementalCharge.toLocaleString()}.` : " No additional charge."}
                </p>
              )}
              {variant?.title && <div className="mt-3 text-[14px] font-bold">{variant.title}</div>}
              {body && <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--los-surface-2)] p-3 font-sans text-[13.5px]">{body}</pre>}
              {variant && (variant.cta || variant.destinationUrl || variant.mediaAssetIds.length > 0) && (
                <p className="mt-2 text-[12.5px] text-[var(--los-muted)]">{variant.cta ? `Call to action: ${variant.cta}. ` : ""}{variant.destinationUrl ? `Links to ${variant.destinationUrl}. ` : ""}{variant.mediaAssetIds.length ? `${variant.mediaAssetIds.length} media file(s) attached — ` : ""}{variant.mediaAssetIds.length > 0 && <Link className="underline" href={href}>see the full preview</Link>}</p>
              )}
              {earlier.length > 0 && (
                <details className="mt-2 text-[13px]"><summary className="cursor-pointer font-medium">What changed since v{earlier[0].version}</summary>
                  <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--los-line)] p-3 font-sans text-[12.5px] text-[var(--los-muted)]">{(() => { const s = JSON.parse(earlier[0].snapshot) as { body?: string; parts?: string[] }; return s.body || s.parts?.join("\n\n") || "(empty)"; })()}</pre>
                  <p className="mt-1 text-[12px] text-[var(--los-faint)]">Your decision applies to v{a.version} exactly. If it is edited afterwards, it comes back to you.</p>
                </details>
              )}
              {allowed ? (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <ActionForm action={decide} submit="Approve" hidden={{ approvalId: a.id, decision: "approved" }} />
                  {body && (
                    <details className="md:col-span-3">
                      <summary className="cursor-pointer text-[13px] font-medium text-[var(--los-brand)]">Approve with edits</summary>
                      <ActionForm action={decide} submit="Approve this version" hidden={{ approvalId: a.id, decision: "approved_with_edits" }} className="mt-2 space-y-2">
                        <textarea name="editedBody" rows={8} defaultValue={body} className={field} />
                      </ActionForm>
                    </details>
                  )}
                  <details className="md:col-span-3">
                    <summary className="cursor-pointer text-[13px] font-medium text-[var(--los-danger)]">Reject</summary>
                    <ActionForm action={decide} submit="Send back" tone="danger" hidden={{ approvalId: a.id, decision: "rejected" }} className="mt-2 space-y-2">
                      <Label>Reason (required)</Label>
                      <textarea name="reason" rows={2} required className={field} />
                    </ActionForm>
                  </details>
                </div>
              ) : (
                <p className="mt-3 text-[12.5px] text-[var(--los-faint)]">{spend ? "Spend, releases and paid scope changes need a workspace owner." : "Waiting for a client approver."}</p>
              )}
            </Card>
          );
        })}
        {pending.length === 0 && <Card><Empty>Nothing waiting for a decision.</Empty></Card>}
      </div>

      <Card className="mt-6">
        <SectionTitle>Decision log</SectionTitle>
        <ul className="divide-y divide-[var(--los-line)]">
          {recent.map((a) => (
            <li key={a.id} className="px-5 py-2.5 text-[13.5px]">
              <div className="flex items-center justify-between gap-3">
                <Link href={a.subject === "variant" && a.workItemId ? `/app/content/${a.workItemId}` : `/app/work/${a.subjectId}`} className="min-w-0 truncate font-medium hover:underline">{a.subject === "variant" ? a.summary : a.workItem?.title ?? a.summary}</Link>
                <span className="shrink-0 text-[12.5px] text-[var(--los-faint)]">v{a.version} · {human(a.status)} · {day(a.decidedAt)}</span>
              </div>
              {a.reason && <div className="text-[12.5px] text-[var(--los-muted)]">“{a.reason}”</div>}
              {canDecide && (a.status === "approved" || a.status === "approved_with_edits") && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[12px] text-[var(--los-faint)]">Revoke</summary>
                  <ActionForm action={revoke} submit="Revoke approval" tone="danger" hidden={{ approvalId: a.id }} className="mt-1 flex items-end gap-2">
                    <input name="reason" required placeholder="Reason" className={field} />
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
          {recent.length === 0 && <Empty>No decisions yet.</Empty>}
        </ul>
      </Card>
    </div>
  );
}
