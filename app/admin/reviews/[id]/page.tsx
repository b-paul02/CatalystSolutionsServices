import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/audit/db";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";
import ReportView from "@/app/growth-audit/report/ReportView";
import DoctorReportView from "@/app/growth-audit/report/DoctorReportView";
import ReviewControls from "./ReviewControls";
import GenerationProgress from "./GenerationProgress";

export const metadata = { title: "Review Report", robots: { index: false } };
export const dynamic = "force-dynamic";

function Pre({ title, obj }: { title: string; obj: unknown }) {
  return (
    <details className="card mb-4">
      <summary className="cursor-pointer text-[14px] font-semibold text-white">{title}</summary>
      <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-[12px] leading-[1.5] text-[var(--color-muted)]">{JSON.stringify(obj, null, 2)}</pre>
    </details>
  );
}

export default async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: { report: true, evidencePack: true, artifact: true, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!lead?.report) notFound();

  const report = JSON.parse(lead.report.json);
  // Placeholder row exists from submission; nothing to review until the pipeline finishes.
  if (lead.report.status === "generating" && !report.findings && !report.doctor_name) {
    return (
      <section className="shell py-14">
        <h1 className="mb-4 text-[24px] font-extrabold text-white">{lead.url || lead.email}</h1>
        <div className="max-w-[560px]">
          <GenerationProgress leadId={lead.id} />
          <p className="text-[13px] text-[var(--color-faint)]">
            The page updates itself when the report is ready. If generation fails, the event log on this page will show why.
          </p>
        </div>
      </section>
    );
  }
  const flags: string[] = lead.redFlags ? JSON.parse(lead.redFlags) : [];
  const pack = lead.evidencePack
    ? {
        scraped: JSON.parse(lead.evidencePack.scraped),
        profile: lead.evidencePack.profile ? JSON.parse(lead.evidencePack.profile) : null,
        intake: lead.evidencePack.intake ? JSON.parse(lead.evidencePack.intake) : null,
        moduleAnswers: lead.evidencePack.moduleAnswers ? JSON.parse(lead.evidencePack.moduleAnswers) : null,
      }
    : null;

  return (
    <section className="shell py-14">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold text-white">
            {lead.type === "doctor" && <span className="mr-2 rounded-full bg-[rgba(96,165,250,0.15)] px-2.5 py-1 align-middle text-[12px] font-bold text-[#93C5FD]">DOCTOR</span>}
            {report.business_name ?? report.doctor_name ?? lead.url ?? lead.email}
          </h1>
          <p className="text-[13px] text-[var(--color-faint)]">{lead.email} · {lead.url || "no website"} · lead status: {lead.status} · report v{lead.report.version} ({lead.report.status})</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[rgba(168,85,247,0.12)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-soft)]">
            G1 {lead.g1Score} · {lead.tag}{lead.tag === "priority" ? " — consider personalising the CTA line" : ""}
          </span>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="mb-6 rounded-xl border border-[rgba(252,165,165,0.3)] bg-[rgba(252,165,165,0.06)] p-4 text-[13.5px] text-[#FCA5A5]">
          <strong>Red flags (human decision required, never auto-reject):</strong> {flags.join(" · ")}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="mb-4 text-[17px] font-bold text-white">Report preview (as the user will see it)</h2>
          {lead.type === "doctor"
            ? <DoctorReportView report={report} meta={{ url: lead.url, date: lead.report.updatedAt.toISOString(), version: lead.report.version, reviewer: lead.report.reviewerName }} />
            : <ReportView report={report} meta={{ url: lead.url, date: lead.report.updatedAt.toISOString(), version: lead.report.version, reviewer: lead.report.reviewerName }} />}
        </div>
        <div>
          {(lead.status === "generating" || lead.report.status === "rejected") && <GenerationProgress leadId={lead.id} />}
          <ReviewControls reportId={lead.report.id} reportJson={lead.report.json} status={lead.report.status} token={lead.report.token}
            defaultReviewer={(await verifySession((await cookies()).get(SESSION_COOKIE)?.value)) ?? ""} />
          {pack && <Pre title="Evidence pack" obj={pack} />}
          {lead.artifact && <Pre title="Internal reviewer artifact (Part 4)" obj={JSON.parse(lead.artifact.json)} />}
          {lead.report.criticLog && <Pre title="Critic verdicts" obj={JSON.parse(lead.report.criticLog)} />}
          <Pre title="Event log" obj={lead.events.map((e) => ({ at: e.createdAt, type: e.type, data: e.data && JSON.parse(e.data) }))} />
          <p className="mt-2 text-[12px] text-[var(--color-faint)]">G1 components: {lead.g1Components}</p>
        </div>
      </div>
    </section>
  );
}
