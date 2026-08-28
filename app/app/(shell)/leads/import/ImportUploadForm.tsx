"use client";

import { useActionState } from "react";
import { uploadImport } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Card, FormNotice, Label, Select, SubmitButton } from "@/components/leados/ui";

export default function ImportUploadForm() {
  const [state, action] = useActionState<FormState, FormData>(uploadImport, {});
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="leadType">These are…</Label>
          <Select id="leadType" name="leadType" defaultValue="b2c">
            <option value="b2c">B2C leads (consumers)</option>
            <option value="b2b">B2B leads (business contacts)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="file">CSV file</Label>
          <input
            id="file" name="file" type="file" accept=".csv,text/csv" required
            className="block w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[13.5px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--los-brand-soft)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[var(--los-brand)]"
          />
          <p className="mt-1 text-[12.5px] text-[var(--los-faint)]">
            Up to 10,000 rows, 8 MB. First row must be column headers. Using Excel? File → Save as → CSV.
          </p>
        </div>
        <SubmitButton>Upload & map columns</SubmitButton>
      </form>
    </Card>
  );
}
