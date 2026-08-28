"use client";

import { useActionState, useState } from "react";
import { uploadDataset } from "./actions";
import type { FormState } from "@/app/app/(auth)/actions";

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";

export default function UploadDatasetForm() {
  const [state, action] = useActionState<FormState, FormData>(uploadDataset, {});
  const [leadType, setLeadType] = useState("b2c");
  const [exclusivity, setExclusivity] = useState("exclusive");
  return (
    <form action={action} className="card space-y-3 !p-4 text-[13.5px]">
      <div className="text-[15px] font-bold text-white">Upload dataset</div>
      {state.error && <p className="text-red-400">{state.error}</p>}
      <div className="flex flex-wrap gap-3">
        <label className={label}>Dataset name<input name="name" required className={`${input} w-[220px]`} /></label>
        <label className={label}>Data source<input name="sourceName" required placeholder="Supplier / campaign name" className={`${input} w-[220px]`} /></label>
        <label className={label}>Type
          <select name="leadType" value={leadType} onChange={(e) => setLeadType(e.target.value)} className={input}>
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
          </select>
        </label>
        <label className={label}>CSV file<input name="file" type="file" accept=".csv" required className="text-[13px]" /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className={label}>Exclusivity
          <select name="exclusivity" value={exclusivity} onChange={(e) => setExclusivity(e.target.value)} className={input}>
            <option value="exclusive">Exclusive (1 client)</option>
            <option value="shared">Shared</option>
          </select>
        </label>
        {exclusivity === "shared" && (
          <label className={label}>Max clients per lead<input name="maxShare" type="number" min={2} max={10} defaultValue={3} className={`${input} w-[80px]`} /></label>
        )}
        <label className={label}>Cooling days<input name="coolingDays" type="number" min={0} defaultValue={0} className={`${input} w-[80px]`} /></label>
        <label className={label}>Expiry (days)<input name="expiryDays" type="number" min={1} placeholder="never" className={`${input} w-[90px]`} /></label>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]"><input type="checkbox" name="demo" /> demo data</label>
      </div>
      <label className={label}>Contract / permission evidence<input name="contractEvidence" placeholder="Contract ref, DPA, collection description" className={`${input} w-full`} /></label>
      {leadType === "b2c" && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-black/30 p-3">
          <label className={label}>Permitted purposes<input name="luPurposes" defaultValue="sales_contact" className={`${input} w-[220px]`} /></label>
          <label className={label}>Permitted channels<input name="luChannels" defaultValue="call, whatsapp" className={`${input} w-[200px]`} /></label>
          <label className={label}>Evidence<input name="luEvidence" placeholder="How consent/permission was obtained" className={`${input} w-[280px]`} /></label>
          <label className={label}>Retention days<input name="luRetention" type="number" min={1} className={`${input} w-[100px]`} /></label>
        </div>
      )}
      <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Upload → compliance review</button>
    </form>
  );
}
