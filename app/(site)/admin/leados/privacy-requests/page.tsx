import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import RequestRow from "./RequestRow";

export const metadata = { title: "Privacy requests" };

export default async function PrivacyRequestsPage() {
  await requirePlatform("super_admin", "compliance_admin", "auditor");
  const requests = await db.losPrivacyRequest.findMany({
    orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }],
    take: 100,
  });
  return (
    <div className="shell py-8">
      <h1 className="mb-6 text-2xl font-extrabold text-white">Privacy requests</h1>
      <div className="space-y-3">
        {requests.length === 0 && <p className="text-[var(--color-muted)]">No requests.</p>}
        {requests.map((r) => (
          <RequestRow
            key={r.id}
            request={{
              id: r.id, kind: r.kind, email: r.email, phone: r.phone,
              status: r.status, details: r.details,
              identityVerified: Boolean(r.identityVerifiedAt),
              dueAt: r.dueAt.toISOString().slice(0, 10),
              completedAt: r.completedAt?.toISOString().slice(0, 10) ?? null,
              resolutionNote: r.resolutionNote,
              resultPackage: r.resultPackage,
            }}
          />
        ))}
      </div>
    </div>
  );
}
