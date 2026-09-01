"use client";

import { useActionState, useState } from "react";
import { createPlan } from "./actions";
import type { FormState } from "@/app/app/(auth)/actions";

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";

type GeoOption = { value: string; leadType: string; count: number };
export type GeoOptions = { countries: GeoOption[]; states: GeoOption[]; cities: GeoOption[] };

function GeoSelect({ name, title, options, leadType }: { name: string; title: string; options: GeoOption[]; leadType: string }) {
  const visible = options.filter((o) => o.leadType === leadType);
  return (
    <label className={label}>{title} (in stock)
      <select name={name} multiple size={Math.min(4, Math.max(2, visible.length))} className={`${input} min-w-[150px]`}>
        {visible.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#111]">{o.value} ({o.count})</option>
        ))}
      </select>
      {visible.length === 0 && <span className="text-[11px]">No available {title.toLowerCase()} for this lead type — any matches.</span>}
    </label>
  );
}

export type FieldOptions = { column: string; values: GeoOption[] }[];

// "productInterest" → "Product interest"
const humanize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/([a-z])([A-Z])/g, "$1 $2");

export default function PlanForm({ orgs, geo, fieldOptions }: { orgs: { id: string; name: string }[]; geo: GeoOptions; fieldOptions: FieldOptions }) {
  const [state, action] = useActionState<FormState, FormData>(createPlan, {});
  const [leadType, setLeadType] = useState("b2c");
  const [filters, setFilters] = useState<string[]>([]);
  const available = fieldOptions.filter((f) => f.values.some((v) => v.leadType === leadType));
  return (
    <form action={action} className="card space-y-3 !p-4 text-[13.5px]">
      <div className="text-[15px] font-bold text-white">New lead plan</div>
      {state.error && <p className="text-red-400">{state.error}</p>}
      {state.ok && <p className="text-[var(--color-success)]">{state.ok}</p>}
      <div className="flex flex-wrap gap-3">
        <label className={label}>Client organization
          <select name="orgId" required className={`${input} w-[220px]`}>
            <option value="">Select…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className={label}>Plan name<input name="name" required className={`${input} w-[200px]`} /></label>
        <label className={label}>Type
          <select name="leadType" className={input} value={leadType} onChange={(e) => setLeadType(e.target.value)}>
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
          </select>
        </label>
        <label className={label}>Leads / working day<input name="dailyQuota" type="number" min={1} defaultValue={10} required className={`${input} w-[90px]`} /></label>
        <label className={label}>Start<input name="startDate" type="date" required className={input} /></label>
        <label className={label}>End (optional)<input name="endDate" type="date" className={input} /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className={label}>Working days (ISO 1-7)<input name="workingDays" defaultValue="1,2,3,4,5" className={`${input} w-[130px]`} /></label>
        <label className={label}>Holidays (YYYY-MM-DD, comma)<input name="holidays" className={`${input} w-[220px]`} /></label>
        <label className={label}>Timezone<input name="timezone" defaultValue="Asia/Kolkata" className={`${input} w-[150px]`} /></label>
        <label className={label}>Delivery hour<input name="deliveryHour" type="number" min={0} max={23} defaultValue={9} className={`${input} w-[70px]`} /></label>
        <label className={label}>Exclusivity
          <select name="exclusivity" className={input}>
            <option value="exclusive">Exclusive</option>
            <option value="shared">Shared</option>
          </select>
        </label>
        <label className={label}>Rollover
          <select name="rollover" className={input}>
            <option value="none">No rollover</option>
            <option value="week">Within week</option>
            <option value="campaign_end">Until campaign end</option>
            <option value="approval">Admin approval</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className={label}>Purpose<input name="purpose" defaultValue="sales_contact" className={`${input} w-[160px]`} /></label>
        <GeoSelect name="countries" title="Countries" options={geo.countries} leadType={leadType} />
        <GeoSelect name="states" title="States" options={geo.states} leadType={leadType} />
        <GeoSelect name="cities" title="Cities" options={geo.cities} leadType={leadType} />
        <label className={label}>Min quality<input name="minQuality" type="number" min={0} max={100} defaultValue={0} className={`${input} w-[80px]`} /></label>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]"><input type="checkbox" name="demo" /> demo</label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>Dataset filters
          <select
            className={`${input} w-[200px]`}
            value=""
            onChange={(e) => e.target.value && setFilters((f) => [...f, e.target.value])}
          >
            <option value="">{available.length === 0 ? "No filterable columns in stock" : "Add a filter…"}</option>
            {available.filter((f) => !filters.includes(f.column)).map((f) => (
              <option key={f.column} value={f.column}>{humanize(f.column)}</option>
            ))}
          </select>
        </label>
        {filters.map((column) => {
          const opts = fieldOptions.find((f) => f.column === column)?.values ?? [];
          return (
            <div key={column} className="flex items-end gap-1">
              <GeoSelect name={`ff_${column}`} title={humanize(column)} options={opts} leadType={leadType} />
              <button type="button" className="pb-2 text-[12px] text-red-400" onClick={() => setFilters((f) => f.filter((c) => c !== column))}>✕</button>
            </div>
          );
        })}
      </div>
      <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Create plan</button>
    </form>
  );
}
