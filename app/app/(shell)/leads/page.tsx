import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { leadWhere } from "@/lib/leados/leadQuery";
import { Badge, Card } from "@/components/leados/ui";
import LeadsToolbar from "./LeadsToolbar";

export const metadata = { title: "Leads" };

const PAGE_SIZE = 50;

const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "warn" | "danger"> = {
  new: "neutral", assigned: "brand", contacted: "warn", engaged: "warn",
  qualified: "brand", converted: "success", lost: "danger",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireOrg("leads.view");
  const sp = await searchParams;
  const filters = { leadType: sp.type, status: sp.status, q: sp.q?.slice(0, 100) };
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where = leadWhere(actor.orgId, filters);
  const [leads, total] = await Promise.all([
    db.losLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { company: true, b2b: true, tags: { include: { tag: true } } },
    }),
    db.losLead.count({ where }),
  ]);
  const owners = await db.losMembership.findMany({
    where: { orgId: actor.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const ownerName = (id: string | null) => {
    const m = owners.find((o) => o.userId === id);
    return m ? (m.user.name ?? m.user.email) : "—";
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(sp.type ? { type: sp.type } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight">Leads</h1>
        <LeadsToolbar
          canImport={can(actor.role, "leads.import")}
          canExport={can(actor.role, "leads.export")}
          canCreate={can(actor.role, "leads.edit")}
          filters={{ type: sp.type ?? "", status: sp.status ?? "", q: sp.q ?? "" }}
        />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--los-line)] bg-[var(--los-surface-2)] text-[12px] uppercase tracking-wide text-[var(--los-muted)]">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Contact</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Company / Interest</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Owner</th>
              <th className="px-4 py-2.5 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--los-line)]">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-[var(--los-surface-2)]">
                <td className="px-4 py-2.5">
                  <Link href={`/app/leads/${l.id}`} className="font-medium text-[var(--los-brand)] hover:underline">
                    {[l.firstName, l.lastName].filter(Boolean).join(" ") || l.email || l.phone}
                  </Link>
                  {l.tags.length > 0 && (
                    <span className="ml-2 space-x-1">
                      {l.tags.slice(0, 3).map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[var(--los-muted)]">
                  <div>{l.email ?? "—"} {l.emailStatus === "valid" && <span title="verified" className="text-[var(--los-success)]">✓</span>}</div>
                  <div>{l.phone ?? ""}</div>
                </td>
                <td className="px-4 py-2.5 uppercase text-[12px] font-semibold text-[var(--los-faint)]">{l.leadType}</td>
                <td className="px-4 py-2.5 text-[var(--los-muted)]">{l.company?.name ?? "—"}</td>
                <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[l.status] ?? "neutral"}>{l.status}</Badge></td>
                <td className="px-4 py-2.5 text-[var(--los-muted)]">{ownerName(l.ownerId)}</td>
                <td className="px-4 py-2.5 text-[var(--los-faint)]">{l.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--los-faint)]">
                No leads match. Import a CSV or add a lead to get started.
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <div className="mt-3 flex items-center justify-between text-[13px] text-[var(--los-muted)]">
        <span>{total} lead{total === 1 ? "" : "s"}</span>
        {pages > 1 && (
          <span className="space-x-2">
            {page > 1 && <Link className="text-[var(--los-brand)]" href={qs(page - 1)}>← Prev</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link className="text-[var(--los-brand)]" href={qs(page + 1)}>Next →</Link>}
          </span>
        )}
      </div>
    </div>
  );
}
