// Public hosted campaign landing page. No auth, mobile-first, indexable only
// when live. Consent UI is rendered server-side and cannot be hidden.
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import type { FormSpec, PageSpec } from "@/lib/leados/campaigns";
import PublicLeadForm from "./PublicLeadForm";

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const campaign = await db.losCampaign.findUnique({ where: { publicId } });
  const page = campaign?.pageSpec ? (JSON.parse(campaign.pageSpec) as PageSpec) : null;
  return { title: page?.headline ?? "Campaign", robots: { index: false } };
}

export default async function PublicCampaignPage({
  params, searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { publicId } = await params;
  const sp = await searchParams;
  const campaign = await db.losCampaign.findUnique({ where: { publicId } });
  if (!campaign || campaign.status !== "active") notFound();
  const version = await db.losCampaignVersion.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: "desc" },
  });
  if (!version) notFound();
  const formSpec = JSON.parse(version.formSpec) as FormSpec;
  const pageSpec = JSON.parse(version.pageSpec) as PageSpec;
  const trackingCode = sp.t?.slice(0, 20) ?? null;
  const utm = Object.fromEntries(
    Object.entries(sp).filter(([k]) => k.startsWith("utm_")).map(([k, v]) => [k, String(v).slice(0, 200)]),
  );

  // Page-view attribution (fire and forget).
  db.losAttributionEvent
    .create({ data: { campaignId: campaign.id, kind: "view", trackingCode, utm: Object.keys(utm).length ? JSON.stringify(utm) : null } })
    .catch(() => {});

  const embed = sp.embed === "1";
  const org = await db.losOrg.findUnique({ where: { id: campaign.orgId }, select: { name: true } });

  const split = pageSpec.template === "split";
  return (
    <div className={embed ? "" : "flex min-h-dvh items-center justify-center px-4 py-8"} style={{ background: "var(--los-bg)" }}>
      <div
        className={`w-full ${split ? "grid max-w-[880px] gap-8 md:grid-cols-2" : "max-w-[480px]"} rounded-2xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 sm:p-8`}
        style={{ borderTopColor: pageSpec.brandColor, borderTopWidth: 4 }}
      >
        <div className={pageSpec.template === "compact" ? "order-2" : ""}>
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--los-faint)]">{org?.name}</div>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{pageSpec.headline}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--los-muted)]">{pageSpec.body}</p>
          {pageSpec.whatsappNumber && (
            <a
              href={`https://wa.me/${pageSpec.whatsappNumber.replace(/\D/g, "")}`}
              className="mt-3 inline-block text-[13.5px] font-medium text-[var(--los-brand)] underline"
            >
              Or chat with us on WhatsApp →
            </a>
          )}
        </div>
        <PublicLeadForm
          publicId={publicId}
          formSpec={formSpec}
          cta={pageSpec.cta}
          brandColor={pageSpec.brandColor}
          trackingCode={trackingCode}
          utm={utm}
          calendarUrl={pageSpec.calendarUrl ?? null}
          thankYouRedirect={pageSpec.thankYouRedirect ?? null}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY_PUBLIC ?? null}
        />
      </div>
    </div>
  );
}
