"use client";

import { useActionState, useTransition } from "react";
import { approveDataset, rejectDataset, saveDatasetMapping } from "../actions";
import type { FormState } from "@/app/app/(auth)/actions";

export default function DatasetDetail(props: {
  dataset: {
    id: string; status: string; leadType: "b2b" | "b2c";
    headers: string[]; sampleRow: string[];
    mapping: Record<string, string>;
    lawfulUse: string | null; report: string | null;
  };
  fields: { key: string; label: string }[];
}) {
  const { dataset: ds } = props;
  const [state, mapAction] = useActionState<FormState, FormData>(saveDatasetMapping, {});
  const [pending, start] = useTransition();
  const lawfulUse = ds.lawfulUse ? (JSON.parse(ds.lawfulUse) as Record<string, unknown>) : null;
  const report = ds.report ? (JSON.parse(ds.report) as Record<string, number>) : null;

  return (
    <div className="space-y-5">
      {lawfulUse && (
        <div className="card !p-4 text-[13px] text-[var(--color-muted)]">
          <div className="mb-1 font-bold text-white">Lawful use</div>
          {Object.entries(lawfulUse).map(([k, v]) => (
            <div key={k}><span className="text-[var(--color-faint)]">{k}:</span> {Array.isArray(v) ? v.join(", ") : String(v)}</div>
          ))}
        </div>
      )}
      {report && (
        <div className="card !p-4 text-[13px] text-[var(--color-success)]">
          Materialized: {report.created} inventory records ({report.skipped} skipped — no contact, in-file duplicate, or suppressed).
        </div>
      )}

      {ds.status === "compliance_review" && (
        <>
          <form action={mapAction} className="card !p-4">
            <div className="mb-2 text-[15px] font-bold text-white">Column mapping</div>
            {state.error && <p className="mb-2 text-[13px] text-red-400">{state.error}</p>}
            {state.ok && <p className="mb-2 text-[13px] text-[var(--color-success)]">{state.ok}</p>}
            <input type="hidden" name="datasetId" value={ds.id} />
            <table className="w-full text-left text-[13px] text-[var(--color-muted)]">
              <tbody className="divide-y divide-[var(--color-line)]">
                {ds.headers.map((h, i) => (
                  <tr key={h}>
                    <td className="py-1.5 pr-3 font-medium text-white">{h}</td>
                    <td className="max-w-[180px] truncate py-1.5 pr-3">{ds.sampleRow[i] ?? ""}</td>
                    <td className="py-1.5">
                      <select name={`map:${h}`} defaultValue={ds.mapping[h] ?? ""} className="rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1 text-white">
                        <option value="">— skip —</option>
                        {props.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-3 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-white hover:border-[var(--color-brand)]">Save mapping</button>
          </form>

          <div className="flex gap-3">
            <button
              disabled={pending}
              onClick={() => {
                if (confirm("Approve this dataset and add its records to inventory?")) start(() => approveDataset(ds.id));
              }}
              className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-[14px] font-semibold text-white"
            >
              Approve & materialize inventory
            </button>
            <button
              disabled={pending}
              onClick={() => {
                const note = prompt("Rejection reason?");
                if (note) start(() => rejectDataset(ds.id, note));
              }}
              className="rounded-lg border border-red-500/50 px-4 py-2 text-[14px] text-red-400 hover:bg-red-500/10"
            >
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}
