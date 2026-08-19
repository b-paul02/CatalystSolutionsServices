import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import { db } from "@/lib/audit/db";
import { APPLICANT_STATUS_COPY } from "@/lib/partner/application-fields";

export const metadata: Metadata = { title: "Application status", robots: { index: false } };

const LINK_LIFETIME_DAYS = 90;

// Applicant-facing. The allow-list here is the whole page: stage copy and the
// date they applied. No score, no band, no reviewer, no notes, no reason code.
export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await db.partnerApplication.findUnique({
    where: { statusToken: token },
    select: { status: true, fullName: true, submittedAt: true, createdAt: true, deletedAt: true },
  });

  const expired =
    app && Date.now() - app.createdAt.getTime() > LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

  if (!app || app.deletedAt || expired) {
    return (
      <Shell title="This link is no longer valid">
        <p className="text-[15px] leading-[1.6] text-[var(--color-muted)]">
          Status links stay live for {LINK_LIFETIME_DAYS} days. If you need an update on your application, reply to the
          confirmation email we sent you and we will pick it up from there.
        </p>
      </Shell>
    );
  }

  if (!app.submittedAt) {
    return (
      <Shell title="Application not submitted yet">
        <p className="text-[15px] leading-[1.6] text-[var(--color-muted)]">
          We have your draft but it has not been submitted. Open the form again to finish it — your answers are saved.
        </p>
        <Link href="/partners/apply" className="btn-primary mt-6">Finish your application</Link>
      </Shell>
    );
  }

  const copy = APPLICANT_STATUS_COPY[app.status] ?? APPLICANT_STATUS_COPY.screening;
  return (
    <Shell title={copy.title}>
      <p className="text-[15px] leading-[1.6] text-[var(--color-muted)]">{copy.body}</p>
      <p className="mt-6 text-[13px] text-[var(--color-faint)]">
        Applied {app.submittedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        {app.fullName ? ` · ${app.fullName}` : ""}
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-5 py-20">
      <div className="card w-full max-w-[560px]">
        <span className="icon-grad mb-5 flex h-12 w-12 text-[24px]"><Icon name="fact_check" /></span>
        <h1 className="mb-3 text-[24px] font-bold text-white">{title}</h1>
        {children}
      </div>
    </section>
  );
}
