import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import ReviewRow from "./ReviewRow";

export const metadata = { title: "Compliance reviews" };

export default async function ReviewsPage() {
  await requirePlatform("super_admin", "compliance_admin", "campaign_admin", "auditor");
  const reviews = await db.losComplianceReview.findMany({
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const orgIds = [...new Set(reviews.map((r) => r.orgId).filter(Boolean))] as string[];
  const orgs = await db.losOrg.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? "platform";
  return (
    <div className="shell py-8">
      <h1 className="mb-6 text-2xl font-extrabold text-white">Compliance reviews</h1>
      <div className="space-y-3">
        {reviews.length === 0 && <p className="text-[var(--color-muted)]">Queue is empty.</p>}
        {reviews.map((r) => (
          <ReviewRow
            key={r.id}
            review={{
              id: r.id, subjectKind: r.subjectKind, subjectId: r.subjectId,
              orgName: orgName(r.orgId), status: r.status, note: r.note,
              evidence: r.evidence, createdAt: r.createdAt.toISOString().slice(0, 16).replace("T", " "),
            }}
          />
        ))}
      </div>
    </div>
  );
}
