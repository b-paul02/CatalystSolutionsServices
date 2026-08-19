import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { BAND_LABEL, SCORE_MAX, bandOf, type ScoreBreakdown } from "@/lib/partner/scoring";
import { FAMILIES, REASON_CODE_LABELS } from "@/lib/partner/application-fields";
import DecisionPanel from "./DecisionPanel";
import StatusPill from "../StatusPill";

export const metadata = { title: "Application", robots: { index: false } };

const list = (v: string | null) => { try { return JSON.parse(v ?? "[]") as string[]; } catch { return []; } };

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await staffPage("admin", "super_admin", "deal_desk");
  const { id } = await params;
  const app = await db.partnerApplication.findUnique({ where: { id } });
  if (!app || app.deletedAt) notFound();

  const breakdown: ScoreBreakdown | null = app.scoreBreakdown ? JSON.parse(app.scoreBreakdown) : null;
  const band = app.score === null ? null : bandOf(app.score);
  const dupes = app.duplicateFlags ? (JSON.parse(app.duplicateFlags) as { applicationId: string; on: string[] }[]) : [];
  const audit = await db.auditLog.findMany({
    where: { entity: "partner_application", entityId: app.id }, orderBy: { at: "desc" }, take: 25,
  });
  const decided = app.status === "approved" || app.status === "rejected";

  return (
    <section className="shell py-10">
      <Link href="/admin/partners/applications" className="text-[13px] text-[var(--color-muted)] hover:text-white">← Back to queue</Link>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold text-white">{app.fullName}</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">
            {app.email}{app.phone ? ` · ${app.phone}` : ""}{app.city || app.country ? ` · ${[app.city, app.country].filter(Boolean).join(", ")}` : ""}
          </p>
        </div>
        <StatusPill status={app.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-4">
          {dupes.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="mb-1 text-[13.5px] font-semibold text-amber-300">
                {dupes.length} possible duplicate{dupes.length > 1 ? "s" : ""} — flagged, not blocked
              </p>
              <ul className="text-[13px] text-[var(--color-muted)]">
                {dupes.map((d) => (
                  <li key={d.applicationId}>
                    Matches on {d.on.join(", ")} ·{" "}
                    <Link href={`/admin/partners/applications/${d.applicationId}`} className="text-[var(--color-brand-soft)] hover:underline">open</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card title="Track record">
            <Row label="Years selling" value={app.yearsExperience} />
            <Row label="Typical deal size" value={app.typicalDealSizeBand} />
            <Row label="Industries" value={list(app.industries).join(", ")} />
            <Row label="Deals closed" value={app.dealExamples} pre />
          </Card>

          <Card title="Pipeline">
            <Row label="Prospects next 90 days" value={app.prospects90dBand} />
            <Row label="Expects to close" value={app.expectedDealsBand} />
            <Row label="Lead sources" value={list(app.leadSources).join(", ")} />
          </Card>

          <Card title="Fit & commitment">
            <Row label="Markets" value={list(app.markets).join(", ")} />
            <Row label="Families" value={list(app.targetFamilies).map((f) => FAMILIES.find((x) => x.value === f)?.label ?? f).join(", ")} />
            <Row label="Hours a week" value={app.hoursPerWeek} />
            <Row label="Own delivery team" value={app.hasOwnDelivery ? "Yes" : "No"} />
            <Row label="Why Catalyst" value={app.whyCatalyst} pre />
          </Card>

          <Card title="Business">
            <Row label="Company" value={app.companyName} />
            <Row label="Website" value={app.companyWebsite} />
            <Row label="LinkedIn" value={app.linkedinUrl} />
            <Row label="Operates as" value={app.entityType} />
            <Row label="Team size" value={app.teamSize} />
          </Card>

          {app.internalNotes && (
            <Card title="Internal notes">
              <pre className="whitespace-pre-wrap text-[13px] leading-[1.6] text-[var(--color-muted)]">{app.internalNotes}</pre>
            </Card>
          )}

          <Card title="History">
            <ul className="grid gap-1.5 text-[12.5px] text-[var(--color-muted)]">
              {audit.map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--color-faint)]">{a.at.toLocaleString("en-GB")}</span> · {a.action.replace(/_/g, " ")}
                  {a.reason ? ` — ${a.reason}` : ""}
                </li>
              ))}
              {audit.length === 0 && <li>No recorded activity.</li>}
            </ul>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Score">
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-[40px] font-extrabold leading-none text-white">{app.score ?? "—"}</span>
              <span className="text-[13.5px] text-[var(--color-muted)]">/ 100 · {band ? BAND_LABEL[band] : "not scored"}</span>
            </div>
            {breakdown ? (
              <div className="grid gap-2">
                {(Object.keys(SCORE_MAX) as (keyof ScoreBreakdown)[]).map((k) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-[12.5px] text-[var(--color-muted)]">
                      <span>{k.replace(/_/g, " ")}</span>
                      <span>{breakdown[k]} / {SCORE_MAX[k]}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7]"
                           style={{ width: `${(breakdown[k] / SCORE_MAX[k]) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[13px] text-[var(--color-muted)]">Not scored.</p>}
            <p className="mt-4 text-[12px] leading-[1.55] text-[var(--color-faint)]">
              The score sorts the queue. It never decides anything — approve and reject are always a person's call.
            </p>
          </Card>

          {decided ? (
            <Card title="Decision">
              <p className="text-[14px] text-[var(--color-muted)]">
                {app.status === "approved" ? "Approved" : "Rejected"} on {app.updatedAt.toLocaleDateString("en-GB")}.
                {app.reasonCode && ` Reason (internal): ${REASON_CODE_LABELS[app.reasonCode] ?? app.reasonCode}.`}
              </p>
              {app.convertedPartnerId && (
                <Link href={`/admin/partners/${app.convertedPartnerId}`} className="btn-primary mt-4 w-full justify-center text-[13.5px]">
                  Open partner record
                </Link>
              )}
            </Card>
          ) : (
            <DecisionPanel
              applicationId={app.id}
              defaultLegalName={app.companyName || app.fullName}
              applicantMarkets={list(app.markets)}
              applicantFamilies={list(app.targetFamilies)}
              actorEmail={actor.email}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-3.5 text-[15px] font-bold text-white">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, pre }: { label: string; value: string | number | null | undefined; pre?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`grid gap-1 border-t border-[var(--color-line)] py-2.5 first:border-0 first:pt-0 ${pre ? "" : "sm:grid-cols-[170px_1fr]"}`}>
      <span className="text-[12.5px] text-[var(--color-faint)]">{label}</span>
      {pre
        ? <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-[var(--color-muted)]">{value}</p>
        : <span className="text-[13.5px] text-[var(--color-muted)]">{value}</span>}
    </div>
  );
}
