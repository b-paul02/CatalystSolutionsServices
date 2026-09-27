// WP-10a/10e · public scorecard result page (share link): the stored self-reported score, the verified column when the
// person ran the site check, a share image, and the booking CTA. Never the person's answers, name or contact details.
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import type { FormSpec, PageSpec } from "@/lib/leados/campaigns";
import { combinedRows, type StoredScore } from "@/lib/os/scorecardVerify";
import { signedGraphicUrl } from "@/lib/os/graphics";
import { ResultView } from "../../PublicScorecard";
import VerifyForm from "./VerifyForm";

export const metadata = { title: "Your result", robots: { index: false } };

export default async function ScorecardResultPage({ params }: { params: Promise<{ publicId: string; submissionId: string }> }) {
  const { publicId, submissionId } = await params;
  const campaign = await db.losCampaign.findUnique({ where: { publicId }, select: { id: true, orgId: true, pageSpec: true } });
  if (!campaign) notFound();
  const sub = await db.losFormSubmission.findFirst({ where: { id: submissionId, campaignId: campaign.id, score: { not: null } }, select: { score: true } });
  const version = await db.losCampaignVersion.findFirst({ where: { campaignId: campaign.id }, orderBy: { version: "desc" } });
  const spec = version ? (JSON.parse(version.formSpec) as FormSpec).scorecard : undefined;
  if (!sub?.score || !spec) notFound();
  const score = JSON.parse(sub.score) as StoredScore;
  const page = JSON.parse(campaign.pageSpec ?? "{}") as PageSpec;
  const [org, booking] = await Promise.all([db.losOrg.findUnique({ where: { id: campaign.orgId }, select: { name: true } }), db.cosBookingType.findFirst({ where: { orgId: campaign.orgId, status: "active" }, select: { id: true, name: true } })]);
  const rows = combinedRows(score);
  const share = signedGraphicUrl("scorecard_share", { title: `${score.pct} / 100 · ${score.band}`, body: `${org?.name ?? ""} assessment`, brand: org?.name ?? "", color: page.brandColor });
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8" style={{ background: "var(--los-bg)" }}>
      <div className="w-full max-w-[560px] rounded-2xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 sm:p-8" style={{ borderTopColor: page.brandColor, borderTopWidth: 4 }}>
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--los-faint)]">{org?.name} · assessment result</div>
        <ResultView spec={spec} score={score} brandColor={page.brandColor} shareUrl={null} orgName={org?.name ?? ""} />
        {score.verified ? (
          <div className="mt-5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--los-faint)]">Self-reported vs verified · {score.verified.url}</div>
            <table className="mt-2 w-full text-[13px]"><thead><tr className="text-left text-[11.5px] text-[var(--los-muted)]"><th className="py-1">Area</th><th className="py-1 text-right">You said</th><th className="py-1 text-right">We measured</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-[var(--los-line)]"><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{r.self ?? "—"}</td><td className="py-1.5 text-right font-semibold">{r.verified ?? "—"}{r.confidence && r.confidence !== "high" ? <span className="ml-1 text-[11px] font-normal text-[var(--los-faint)]">({r.confidence})</span> : null}</td></tr>)}</tbody></table>
            <ul className="mt-3 space-y-0.5 text-[12.5px]">{score.verified.checks.filter((c) => !c.pass).slice(0, 8).map((c) => <li key={c.label}>✕ {c.label} <span className="text-[var(--los-faint)]">({c.verification})</span></li>)}{score.verified.checks.every((c) => c.pass) && <li>✓ Every check passed.</li>}</ul>
            <p className="mt-2 text-[11.5px] text-[var(--los-faint)]">Verified {score.verified.checkedAt}: deterministic checks on the homepage and key pages{score.verified.pagespeed ? `; PageSpeed mobile ${score.verified.pagespeed.performanceScore}` : ""}. Not a full audit.</p>
          </div>
        ) : <VerifyForm publicId={publicId} submissionId={submissionId} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} brandColor={page.brandColor} />}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[13px]">
          {booking && <a href={`/app/b/${booking.id}`} className="rounded-lg px-4 py-2 font-bold text-white" style={{ background: page.brandColor }}>Book a call →</a>}
          <a href={share} className="underline" target="_blank" rel="noreferrer">Share image</a>
          <a className="underline" href={`/app/c/${publicId}`}>Take the assessment</a>
        </div>
      </div>
    </div>
  );
}
