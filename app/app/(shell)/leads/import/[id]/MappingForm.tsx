"use client";

import { useActionState } from "react";
import { saveImportMapping } from "../../actions";
import type { FormState } from "../../../../(auth)/actions";
import { Card, FormNotice, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

export default function MappingForm(props: {
  importId: string;
  headers: string[];
  mapping: Record<string, string>;
  leadType: "b2b" | "b2c";
  fields: { key: string; label: string }[];
  sampleRow: string[];
  lawfulUse: { purposes: string[]; channels: string[]; evidenceNote?: string; retentionDays?: number } | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveImportMapping, {});
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[15px] font-bold">Map columns</h2>
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <input type="hidden" name="importId" value={props.importId} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] uppercase tracking-wide text-[var(--los-muted)]">
                <th className="py-1.5 pr-3 font-semibold">Your column</th>
                <th className="py-1.5 pr-3 font-semibold">First row</th>
                <th className="py-1.5 font-semibold">Maps to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--los-line)]">
              {props.headers.map((h, i) => (
                <tr key={h}>
                  <td className="py-2 pr-3 font-medium">{h}</td>
                  <td className="max-w-[180px] truncate py-2 pr-3 text-[var(--los-faint)]">{props.sampleRow[i] ?? ""}</td>
                  <td className="py-2">
                    <Select name={`map:${h}`} defaultValue={props.mapping[h] ?? ""} className="!w-auto py-1 text-[13px]">
                      <option value="">— skip —</option>
                      {props.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {props.leadType === "b2c" && (
          <div className="space-y-3 rounded-lg bg-[var(--los-surface-2)] p-4">
            <div className="text-[13.5px] font-semibold">Lawful use for this dataset (applies to every imported lead)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="luPurposes">Permitted purposes (comma separated)</Label>
                <Input id="luPurposes" name="luPurposes" defaultValue={props.lawfulUse?.purposes.join(", ") ?? "sales_contact"} placeholder="sales_contact, marketing" />
              </div>
              <div>
                <Label htmlFor="luChannels">Permitted channels</Label>
                <Input id="luChannels" name="luChannels" defaultValue={props.lawfulUse?.channels.join(", ") ?? "call, whatsapp"} placeholder="call, whatsapp, sms, email" />
              </div>
            </div>
            <div>
              <Label htmlFor="luEvidence">Consent / permission evidence</Label>
              <Input id="luEvidence" name="luEvidence" defaultValue={props.lawfulUse?.evidenceNote ?? ""} placeholder="e.g. Website inquiry form submissions, June–Aug 2026, notice v2" />
            </div>
            <div className="max-w-[220px]">
              <Label htmlFor="luRetention">Retention (days, optional)</Label>
              <Input id="luRetention" name="luRetention" type="number" min={1} defaultValue={props.lawfulUse?.retentionDays ?? ""} />
            </div>
          </div>
        )}

        <SubmitButton>Save mapping & preview</SubmitButton>
      </form>
    </Card>
  );
}
