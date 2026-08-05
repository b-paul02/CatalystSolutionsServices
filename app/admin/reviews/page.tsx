import Link from "next/link";
import { db } from "@/lib/audit/db";

export const metadata = { title: "Review Queue", robots: { index: false } };
export const dynamic = "force-dynamic";

const tagStyle: Record<string, string> = {
  priority: "text-[#6EE7B7] bg-[rgba(110,231,183,0.1)]",
  standard: "text-[#C4B5FD] bg-[rgba(168,85,247,0.12)]",
  nurture: "text-[#FCD34D] bg-[rgba(252,211,77,0.1)]",
};

export default async function ReviewsPage() {
  // includes leads whose pipeline crashed before producing a report (status needs_attention, no report row)
  const leads = await db.lead.findMany({
    where: { OR: [{ report: { isNot: null } }, { status: { in: ["generating", "needs_attention"] } }] },
    include: { report: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const order = { needs_attention: 0, pending: 1, rejected: 2, approved: 3 } as Record<string, number>;
  leads.sort((a, b) => (order[a.report?.status ?? a.status] ?? 9) - (order[b.report?.status ?? b.status] ?? 9));

  return (
    <section className="shell py-14">
      <h1 className="mb-8 text-[28px] font-extrabold text-white">Report review queue</h1>
      <div className="grid gap-3">
        {leads.length === 0 && <p className="text-[var(--color-muted)]">No reports yet.</p>}
        {leads.map((l) => {
          const flags: string[] = l.redFlags ? JSON.parse(l.redFlags) : [];
          const status = l.report?.status ?? `${l.status} (no report — check event log / server logs)`;
          const body = (
            <>
              <div className="min-w-[200px] flex-1">
                <div className="text-[15px] font-semibold text-white">{l.url.replace(/^https?:\/\//, "")}</div>
                <div className="text-[12.5px] text-[var(--color-faint)]">{l.email} · {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tagStyle[l.tag ?? "standard"] ?? ""}`}>{l.tag ?? "—"} · G1 {l.g1Score ?? "—"}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                status === "pending" ? "bg-[rgba(96,165,250,0.12)] text-[#93C5FD]"
                : status.startsWith("needs_attention") ? "bg-[rgba(252,165,165,0.12)] text-[#FCA5A5]"
                : status === "approved" ? "bg-[rgba(110,231,183,0.1)] text-[#6EE7B7]"
                : "bg-white/5 text-[var(--color-muted)]"}`}>
                {status}{l.report?.reviewerName ? ` · ${l.report.reviewerName}` : ""}
              </span>
              {flags.length > 0 && <span className="rounded-full bg-[rgba(252,165,165,0.12)] px-2.5 py-1 text-[11.5px] font-semibold text-[#FCA5A5]">⚑ {flags.length} flag{flags.length > 1 ? "s" : ""}</span>}
            </>
          );
          return l.report ? (
            <Link key={l.id} href={`/admin/reviews/${l.id}`} className="card-i flex flex-wrap items-center gap-4">{body}</Link>
          ) : (
            <div key={l.id} className="card flex flex-wrap items-center gap-4 opacity-80">{body}</div>
          );
        })}
      </div>
    </section>
  );
}
