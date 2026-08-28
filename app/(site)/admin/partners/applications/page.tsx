import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { BAND_LABEL, bandOf } from "@/lib/partner/scoring";
import { FAMILIES, MARKETS } from "@/lib/partner/application-fields";
import StatusPill from "./StatusPill";

export const metadata = { title: "Partner applications", robots: { index: false } };

const VIEWS = [
  { key: "new_week", label: "New this week" },
  { key: "fast_track", label: "Fast-track" },
  { key: "awaiting", label: "Awaiting decision" },
  { key: "waiting_applicant", label: "Waiting on applicant" },
  { key: "stale", label: "Stale >7 days" },
] as const;

const STATUSES = ["applied", "screening", "interview", "waiting_on_applicant", "low_priority", "approved", "rejected"];

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function whereFor(view: string | undefined, q: Record<string, string | undefined>): Prisma.PartnerApplicationWhereInput {
  const where: Prisma.PartnerApplicationWhereInput = { deletedAt: null, submittedAt: { not: null } };
  const and: Prisma.PartnerApplicationWhereInput[] = [];

  if (view === "new_week") and.push({ submittedAt: { gte: daysAgo(7) } });
  if (view === "fast_track") and.push({ score: { gte: 70 } });
  if (view === "awaiting") and.push({ status: { in: ["applied", "screening", "interview"] } });
  if (view === "waiting_applicant") and.push({ status: "waiting_on_applicant" });
  if (view === "stale") and.push({ status: { in: ["applied", "screening", "interview"] }, updatedAt: { lt: daysAgo(7) } });

  if (q.status) and.push({ status: q.status });
  if (q.market) and.push({ markets: { contains: `"${q.market}"` } });
  if (q.family) and.push({ targetFamilies: { contains: `"${q.family}"` } });
  if (q.band === "fast_track") and.push({ score: { gte: 70 } });
  if (q.band === "standard") and.push({ score: { gte: 45, lt: 70 } });
  if (q.band === "low_priority") and.push({ score: { lt: 45 } });
  if (q.since) and.push({ submittedAt: { gte: new Date(q.since) } });

  return and.length ? { ...where, AND: and } : where;
}

export default async function ApplicationsQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await staffPage("admin", "super_admin", "deal_desk");
  const q = await searchParams;

  const rows = await db.partnerApplication.findMany({
    where: whereFor(q.view, q),
    orderBy: [{ score: "desc" }, { submittedAt: "desc" }],
    take: 200,
    select: {
      id: true, fullName: true, email: true, country: true, score: true, status: true,
      markets: true, submittedAt: true, updatedAt: true, duplicateFlags: true, convertedPartnerId: true,
    },
  });

  const link = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, ...patch })) if (v) sp.set(k, v);
    return `/admin/partners/applications${sp.toString() ? `?${sp}` : ""}`;
  };

  return (
    <section className="shell py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white">Partner applications</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">
            {rows.length} shown. Sorted by score — a sort order only, never a decision.
          </p>
        </div>
        <Link href="/admin/partners" className="text-[13.5px] text-[var(--color-muted)] hover:text-white">Partners →</Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip href={link({ view: undefined })} on={!q.view}>All</Chip>
        {VIEWS.map((v) => (
          <Chip key={v.key} href={link({ view: v.key })} on={q.view === v.key}>{v.label}</Chip>
        ))}
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/admin/partners/applications">
        {q.view && <input type="hidden" name="view" value={q.view} />}
        <Select name="status" label="Status" value={q.status} options={STATUSES} />
        <Select name="band" label="Score band" value={q.band} options={["fast_track", "standard", "low_priority"]} />
        <Select name="market" label="Market" value={q.market} options={MARKETS.map((m) => m.value)} />
        <Select name="family" label="Family" value={q.family} options={FAMILIES.map((f) => f.value)} />
        <div className="flex flex-col gap-[7px]">
          <label className="label">Submitted since</label>
          <input type="date" name="since" defaultValue={q.since ?? ""} className="field h-[38px] py-1" />
        </div>
        <button className="btn-primary h-[38px] px-4 text-[13px]">Filter</button>
        <Link href="/admin/partners/applications" className="pb-2 text-[13px] text-[var(--color-muted)] hover:text-white">Clear</Link>
      </form>

      {rows.length === 0 ? (
        <p className="card text-[14px] text-[var(--color-muted)]">No applications match this view.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>
                {["Applicant", "Score", "Band", "Status", "Markets", "Submitted", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band = r.score === null ? null : bandOf(r.score);
                const dupes = r.duplicateFlags ? (JSON.parse(r.duplicateFlags) as unknown[]).length : 0;
                return (
                  <tr key={r.id} className="border-t border-[var(--color-line)] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.fullName}</div>
                      <div className="text-[12.5px] text-[var(--color-faint)]">
                        {r.email}{r.country ? ` · ${r.country}` : ""}
                        {dupes > 0 && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">{dupes} possible duplicate{dupes > 1 ? "s" : ""}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{r.score ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{band ? BAND_LABEL[band] : "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{(JSON.parse(r.markets ?? "[]") as string[]).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{r.submittedAt?.toLocaleDateString("en-GB") ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/partners/applications/${r.id}`} className="text-[var(--color-brand-soft)] hover:underline">Review</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1.5 text-[13px] ${
      on ? "border-[#7C3AED] bg-[#7C3AED]/20 text-white" : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-white"}`}>
      {children}
    </Link>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <label className="label">{label}</label>
      <select name={name} defaultValue={value ?? ""} className="field h-[38px] py-1">
        <option value="" className="bg-[#13101f]">Any</option>
        {options.map((o) => <option key={o} value={o} className="bg-[#13101f]">{o.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}
