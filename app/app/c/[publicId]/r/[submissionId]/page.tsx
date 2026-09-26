// WP-10a · public scorecard result page (share link). Shows the stored score only — never the person's answers,
// name or contact details. WP-10e adds the verified-audit column next to it.
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import type { FormSpec, PageSpec } from "@/lib/leados/campaigns";
import type { ScoreResult } from "@/lib/leados/scorecard";
import { ResultView } from "../../PublicScorecard";

export const metadata = { title: "Your result", robots: { index: false } };

export default async function ScorecardResultPage({ params }: { params: Promise<{ publicId: string; submissionId: string }> }) {
  const { publicId, submissionId } = await params;
  const campaign = await db.losCampaign.findUnique({ where: { publicId }, select: { id: true, orgId: true, pageSpec: true } });
  if (!campaign) notFound();
  const sub = await db.losFormSubmission.findFirst({ where: { id: submissionId, campaignId: campaign.id, score: { not: null } }, select: { score: true } });
  const version = await db.losCampaignVersion.findFirst({ where: { campaignId: campaign.id }, orderBy: { version: "desc" } });
  const spec = version ? (JSON.parse(version.formSpec) as FormSpec).scorecard : undefined;
  if (!sub?.score || !spec) notFound();
  const page = JSON.parse(campaign.pageSpec ?? "{}") as PageSpec;
  const org = await db.losOrg.findUnique({ where: { id: campaign.orgId }, select: { name: true } });
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8" style={{ background: "var(--los-bg)" }}>
      <div className="w-full max-w-[480px] rounded-2xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 sm:p-8" style={{ borderTopColor: page.brandColor, borderTopWidth: 4 }}>
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--los-faint)]">{org?.name} · assessment result</div>
        <ResultView spec={spec} score={JSON.parse(sub.score) as ScoreResult} brandColor={page.brandColor} shareUrl={null} orgName={org?.name ?? ""} />
        <p className="mt-4 text-center text-[13px]"><a className="font-semibold underline" href={`/c/${publicId}`}>Take the assessment yourself →</a></p>
      </div>
    </div>
  );
}
