import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import ReportView from "../ReportView";
import PrintButton from "./PrintButton";

export const metadata: Metadata = { title: "Growth Snapshot", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await db.report.findUnique({ where: { token }, include: { lead: true } });
  if (!record) notFound();

  if (record.status !== "approved") {
    return (
      <section className="px-5 py-28 sm:px-8">
        <div className="card mx-auto max-w-[560px] text-center">
          <span className="badge mb-5"><span className="badge-dot anim-pulse" />In review</span>
          <h1 className="mb-3 text-[24px] font-bold text-white">Your report is being reviewed</h1>
          <p className="text-[14.5px] leading-[1.65] text-[var(--color-muted)]">
            A member of our team checks every report before release. Yours will be ready within 1 business day —
            it will appear right here on this page, so keep this link and check back. You&apos;ll be able to save it as a PDF too.
          </p>
        </div>
      </section>
    );
  }

  const report = JSON.parse(record.json);
  return (
    <section className="relative px-5 py-16 sm:px-8 print:py-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)] print:hidden" />
      <div className="relative">
        <div className="mx-auto mb-10 max-w-[780px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="badge mb-4"><span className="badge-dot" />Growth Snapshot</span>
              <h1 className="text-[clamp(1.8rem,4vw,38px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-white">{report.business_name}</h1>
            </div>
            <PrintButton />
          </div>
        </div>
        <ReportView report={report}
          meta={{ url: record.lead.url, date: (record.deliveredAt ?? record.updatedAt).toISOString(), version: record.version, reviewer: record.reviewerName }} />
      </div>
    </section>
  );
}
