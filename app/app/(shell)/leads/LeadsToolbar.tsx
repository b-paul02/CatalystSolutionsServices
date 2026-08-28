"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { exportLeadsCsv } from "./actions";
import { GhostButton, Input, Select } from "@/components/leados/ui";

export default function LeadsToolbar(props: {
  canImport: boolean;
  canExport: boolean;
  canCreate: boolean;
  filters: { type: string; status: string; q: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const apply = (patch: Partial<typeof props.filters>) => {
    const f = { ...props.filters, ...patch };
    const qs = new URLSearchParams();
    if (f.type) qs.set("type", f.type);
    if (f.status) qs.set("status", f.status);
    if (f.q) qs.set("q", f.q);
    router.push(`/app/leads?${qs}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: new FormData(e.currentTarget).get("q") as string });
        }}
      >
        <Input name="q" defaultValue={props.filters.q} placeholder="Search name, email, phone" className="!w-[220px]" />
      </form>
      <Select value={props.filters.type} onChange={(e) => apply({ type: e.target.value })} className="!w-auto">
        <option value="">All types</option>
        <option value="b2b">B2B</option>
        <option value="b2c">B2C</option>
      </Select>
      <Select value={props.filters.status} onChange={(e) => apply({ status: e.target.value })} className="!w-auto">
        <option value="">All statuses</option>
        {["new", "assigned", "contacted", "engaged", "qualified", "converted", "lost"].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Select>
      {props.canExport && (
        <GhostButton
          disabled={pending}
          onClick={() =>
            start(async () => {
              const csv = await exportLeadsCsv({ leadType: props.filters.type, status: props.filters.status, q: props.filters.q });
              const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "leados-b2b-export.csv";
              a.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          Export B2B
        </GhostButton>
      )}
      {props.canImport && (
        <Link href="/app/leads/import" className="inline-flex items-center rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-4 py-2 text-[14px] font-medium hover:bg-[var(--los-surface-2)]">
          Import CSV
        </Link>
      )}
      {props.canCreate && (
        <Link href="/app/leads/new" className="inline-flex items-center rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90">
          Add lead
        </Link>
      )}
    </div>
  );
}
