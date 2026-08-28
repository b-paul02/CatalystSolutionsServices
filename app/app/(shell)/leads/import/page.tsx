import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { Badge, Card } from "@/components/leados/ui";
import ImportUploadForm from "./ImportUploadForm";

export const metadata = { title: "Import leads" };

export default async function ImportPage() {
  const actor = await requireOrg("leads.import");
  const recent = await db.losImport.findMany({
    where: { orgId: actor.orgId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return (
    <div className="max-w-[720px]">
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">Import leads</h1>
      <ImportUploadForm />
      {recent.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Recent imports</div>
          <ul className="divide-y divide-[var(--los-line)]">
            {recent.map((i) => {
              const report = i.report ? (JSON.parse(i.report) as { accepted: number; duplicates: number; invalid: number }) : null;
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                  <div>
                    <Link href={`/app/leads/import/${i.id}`} className="font-medium text-[var(--los-brand)] hover:underline">{i.fileName}</Link>
                    <span className="ml-2 text-[12px] uppercase text-[var(--los-faint)]">{i.leadType}</span>
                    {report && (
                      <span className="ml-2 text-[12.5px] text-[var(--los-muted)]">
                        {report.accepted} accepted · {report.duplicates} duplicates · {report.invalid} invalid
                      </span>
                    )}
                  </div>
                  <Badge tone={i.status === "done" ? "success" : i.status === "failed" ? "danger" : "warn"}>{i.status}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
