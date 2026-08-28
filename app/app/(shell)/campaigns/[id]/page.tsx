import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { APP_URL } from "@/lib/leados/email";
import { Badge } from "@/components/leados/ui";
import CampaignEditor from "./CampaignEditor";

export const metadata = { title: "Campaign" };

const TONE: Record<string, "neutral" | "brand" | "success" | "warn" | "danger"> = {
  draft: "neutral", in_review: "warn", approved: "brand", active: "success",
  paused: "warn", completed: "neutral", rejected: "danger",
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOrg("campaigns.view");
  const { id } = await params;
  const campaign = await db.losCampaign.findFirst({
    where: { id, orgId: actor.orgId },
    include: { trackingLinks: true },
  });
  if (!campaign) notFound();
  const [members, stats, recentSubmissions] = await Promise.all([
    db.losMembership.findMany({
      where: { orgId: actor.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.losAttributionEvent.groupBy({ by: ["kind"], where: { campaignId: id }, _count: true }),
    db.losFormSubmission.findMany({ where: { campaignId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const views = stats.find((s) => s.kind === "view")?._count ?? 0;
  const submits = stats.find((s) => s.kind === "submit")?._count ?? 0;
  const publicUrl = `${APP_URL}/c/${campaign.publicId}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/app/campaigns" className="text-[13px] text-[var(--los-muted)] hover:text-[var(--los-fg)]">← Campaigns</Link>
        <h1 className="text-[22px] font-extrabold tracking-tight">{campaign.name}</h1>
        <Badge tone={TONE[campaign.status] ?? "neutral"}>{campaign.status.replace(/_/g, " ")}</Badge>
        <Badge>{campaign.type.replace(/_/g, " ")}</Badge>
      </div>
      {campaign.status === "rejected" && campaign.reviewNote && (
        <div className="mb-4 rounded-lg bg-[var(--los-danger-soft)] px-4 py-2.5 text-[13.5px] text-[var(--los-danger)]">
          Rejected by review: {campaign.reviewNote}
        </div>
      )}
      <CampaignEditor
        campaign={{
          id: campaign.id, status: campaign.status, type: campaign.type,
          publicUrl,
          offer: JSON.parse(campaign.offer ?? "{}"),
          formSpec: JSON.parse(campaign.formSpec ?? "{}"),
          pageSpec: JSON.parse(campaign.pageSpec ?? "{}"),
          distribution: JSON.parse(campaign.distribution ?? "{}"),
          trackingLinks: campaign.trackingLinks.map((t) => ({ id: t.id, label: t.label, code: t.code })),
        }}
        canManage={can(actor.role, "campaigns.manage")}
        members={members.map((m) => ({ userId: m.userId, label: m.user.name ?? m.user.email }))}
        analytics={{ views, submits, accepted: recentSubmissions.filter((s) => s.status === "accepted").length }}
        submissions={recentSubmissions.map((s) => ({
          id: s.id, status: s.status, createdAt: s.createdAt.toISOString().slice(0, 16).replace("T", " "),
          leadId: s.leadId, data: s.data, trackingCode: s.trackingCode,
        }))}
      />
    </div>
  );
}
