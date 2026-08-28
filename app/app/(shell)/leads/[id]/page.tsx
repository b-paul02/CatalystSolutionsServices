import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { Badge, Card } from "@/components/leados/ui";
import LeadControls from "./LeadControls";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOrg("leads.view");
  const { id } = await params;
  const lead = await db.losLead.findFirst({
    where: { id, orgId: actor.orgId, deletedAt: null },
    include: {
      b2b: true, b2c: true, company: true,
      tags: { include: { tag: true } },
    },
  });
  if (!lead) notFound();
  const [sources, verifications, members] = await Promise.all([
    db.losLeadSourceRecord.findMany({ where: { leadId: lead.id, orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.losVerificationEvent.findMany({ where: { leadId: lead.id, orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.losMembership.findMany({ where: { orgId: actor.orgId }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || lead.phone || "Lead";
  const b2c = lead.b2c;
  const parse = (s: string | null | undefined): string[] => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/app/leads" className="text-[13px] text-[var(--los-muted)] hover:text-[var(--los-fg)]">← Leads</Link>
        <h1 className="text-[22px] font-extrabold tracking-tight">{name}</h1>
        <Badge tone="brand">{lead.leadType.toUpperCase()}</Badge>
        {b2c?.suppressedAt && <Badge tone="danger">suppressed</Badge>}
        {b2c?.withdrawnAt && <Badge tone="danger">consent withdrawn</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* identity */}
        <Card className="p-5">
          <h2 className="mb-3 text-[14px] font-bold">Contact</h2>
          <dl className="space-y-2 text-[13.5px]">
            <div><dt className="text-[var(--los-faint)]">Email</dt><dd>{lead.email ?? "—"} {lead.emailStatus !== "unverified" && <Badge tone={lead.emailStatus === "valid" ? "success" : "danger"}>{lead.emailStatus}</Badge>}</dd></div>
            <div><dt className="text-[var(--los-faint)]">Phone</dt><dd>{lead.phone ?? "—"} {lead.phoneStatus !== "unverified" && <Badge tone={lead.phoneStatus === "valid" ? "success" : "danger"}>{lead.phoneStatus}</Badge>}</dd></div>
            <div><dt className="text-[var(--los-faint)]">Location</dt><dd>{[lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "—"}</dd></div>
            <div><dt className="text-[var(--los-faint)]">Language</dt><dd>{lead.language ?? "—"}</dd></div>
            <div><dt className="text-[var(--los-faint)]">Source</dt><dd>{lead.source}{lead.sourceRef ? ` · ${lead.sourceRef.slice(0, 12)}…` : ""}</dd></div>
            <div><dt className="text-[var(--los-faint)]">Tags</dt><dd className="space-x-1">{lead.tags.length ? lead.tags.map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>) : "—"}</dd></div>
          </dl>
        </Card>

        {/* type-specific + provenance */}
        <Card className="p-5">
          {lead.leadType === "b2b" ? (
            <>
              <h2 className="mb-3 text-[14px] font-bold">Business profile</h2>
              <dl className="space-y-2 text-[13.5px]">
                <div><dt className="text-[var(--los-faint)]">Company</dt><dd>{lead.company?.name ?? "—"}{lead.company?.domain ? ` (${lead.company.domain})` : ""}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Job title</dt><dd>{lead.b2b?.jobTitle ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Department</dt><dd>{lead.b2b?.department ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Seniority</dt><dd>{lead.b2b?.seniority ?? "—"}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-[14px] font-bold">Consumer profile & permissions</h2>
              <dl className="space-y-2 text-[13.5px]">
                <div><dt className="text-[var(--los-faint)]">Interest</dt><dd>{b2c?.productInterest ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Budget</dt><dd>{b2c?.budgetBand ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Timeline</dt><dd>{b2c?.purchaseTimeline ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Permitted purposes</dt><dd className="space-x-1">{parse(b2c?.permittedPurposes).map((p) => <Badge key={p} tone="brand">{p.replace(/_/g, " ")}</Badge>)}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Permitted channels</dt><dd className="space-x-1">{parse(b2c?.permittedChannels).map((c) => <Badge key={c}>{c}</Badge>)}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Evidence</dt><dd>{b2c?.consentRef ?? "—"}</dd></div>
                <div><dt className="text-[var(--los-faint)]">Retention expires</dt><dd>{b2c?.retentionExpiresAt?.toISOString().slice(0, 10) ?? "—"}</dd></div>
              </dl>
            </>
          )}
          <h2 className="mb-2 mt-5 text-[14px] font-bold">Verification history</h2>
          <ul className="space-y-1 text-[12.5px] text-[var(--los-muted)]">
            {verifications.map((v) => (
              <li key={v.id}>{v.channel} · {v.provider} → {v.result} · {v.createdAt.toISOString().slice(0, 16).replace("T", " ")}</li>
            ))}
            {verifications.length === 0 && <li>—</li>}
          </ul>
          <h2 className="mb-2 mt-5 text-[14px] font-bold">Provenance</h2>
          <ul className="space-y-1 text-[12.5px] text-[var(--los-muted)]">
            {sources.map((s) => (
              <li key={s.id}>{s.kind}{s.ref ? ` · ${s.ref.slice(0, 12)}…` : ""} · {s.createdAt.toISOString().slice(0, 10)}</li>
            ))}
          </ul>
        </Card>

        {/* actions */}
        <LeadControls
          leadId={lead.id}
          status={lead.status}
          ownerId={lead.ownerId}
          lostReason={lead.lostReason}
          canEdit={can(actor.role, "leads.edit")}
          canAssign={can(actor.role, "leads.assign")}
          canDelete={can(actor.role, "leads.delete")}
          basics={{
            firstName: lead.firstName ?? "", lastName: lead.lastName ?? "",
            city: lead.city ?? "", state: lead.state ?? "", country: lead.country ?? "", language: lead.language ?? "",
          }}
          members={members.map((m) => ({ userId: m.userId, label: m.user.name ?? m.user.email }))}
        />
      </div>
    </div>
  );
}
