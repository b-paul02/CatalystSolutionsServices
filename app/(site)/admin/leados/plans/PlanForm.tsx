"use client";

import { useActionState } from "react";
import { createPlan } from "./actions";
import type { FormState } from "@/app/app/(auth)/actions";

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";

export default function PlanForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createPlan, {});
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
          <select name="leadType" className={input}>
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
        <label className={label}>Countries<input name="countries" placeholder="India" className={`${input} w-[140px]`} /></label>
        <label className={label}>States<input name="states" className={`${input} w-[140px]`} /></label>
        <label className={label}>Cities<input name="cities" placeholder="Mumbai, Pune" className={`${input} w-[160px]`} /></label>
        <label className={label}>Min quality<input name="minQuality" type="number" min={0} max={100} defaultValue={0} className={`${input} w-[80px]`} /></label>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]"><input type="checkbox" name="demo" /> demo</label>
      </div>
      <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Create plan</button>
    </form>
  );
}
