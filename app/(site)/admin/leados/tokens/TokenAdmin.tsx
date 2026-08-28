"use client";

import { useActionState } from "react";
import { addTokenRate, grantTokens } from "../plans/actions";
import type { FormState } from "@/app/app/(auth)/actions";

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";

export default function TokenAdmin(props: {
  orgs: { id: string; name: string; market: string; balance: number }[];
  rates: { id: string; leadType: string; industry: string | null; exclusiveTokens: number; sharedTokens: number; verifiedBonusPct: number; effectiveFrom: string }[];
  ledger: { id: string; orgName: string; delta: number; kind: string; note: string | null; at: string }[];
}) {
  const [grantState, grantAction] = useActionState<FormState, FormData>(grantTokens, {});
  const [rateState, rateAction] = useActionState<FormState, FormData>(addTokenRate, {});
  return (
    <div className="shell space-y-6 py-8">
      <h1 className="text-2xl font-extrabold text-white">Token economy</h1>

      <div className="card !p-4">
        <div className="mb-2 text-[15px] font-bold text-white">Balances</div>
        <div className="flex flex-wrap gap-3">
          {props.orgs.map((o) => (
            <div key={o.id} className="rounded-lg bg-black/30 px-3 py-2 text-[13px]">
              <div className="text-white">{o.name} <span className="text-[11px] text-[var(--color-faint)]">({o.market})</span></div>
              <div className="text-[20px] font-extrabold text-[var(--color-brand-soft)]">{o.balance.toLocaleString()} <span className="text-[12px] font-normal">tokens</span></div>
            </div>
          ))}
        </div>
      </div>

      <form action={grantAction} className="card flex flex-wrap items-end gap-3 !p-4 text-[13.5px]">
        <div className="w-full text-[15px] font-bold text-white">Grant / adjust tokens</div>
        {grantState.error && <p className="w-full text-red-400">{grantState.error}</p>}
        {grantState.ok && <p className="w-full text-[var(--color-success)]">{grantState.ok}</p>}
        <label className={label}>Organization
          <select name="orgId" required className={`${input} w-[220px]`}>
            <option value="">Select…</option>
            {props.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className={label}>Amount (± tokens)<input name="amount" type="number" required className={`${input} w-[110px]`} /></label>
        <label className={label}>Reason<input name="note" required placeholder="e.g. Managed Leads pilot grant" className={`${input} w-[280px]`} /></label>
        <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Record</button>
      </form>

      <div className="card !p-4">
        <div className="mb-2 text-[15px] font-bold text-white">Rate card</div>
        <table className="mb-3 w-full text-left text-[13px] text-[var(--color-muted)]">
          <thead>
            <tr className="text-[12px] uppercase">
              <th className="py-1.5 pr-3">Type</th><th className="py-1.5 pr-3">Industry</th>
              <th className="py-1.5 pr-3">Exclusive</th><th className="py-1.5 pr-3">Shared</th>
              <th className="py-1.5 pr-3">Verified bonus</th><th className="py-1.5">Effective</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {props.rates.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-3 uppercase">{r.leadType}</td>
                <td className="py-1.5 pr-3">{r.industry ?? "— default —"}</td>
                <td className="py-1.5 pr-3">{r.exclusiveTokens}</td>
                <td className="py-1.5 pr-3">{r.sharedTokens}</td>
                <td className="py-1.5 pr-3">+{r.verifiedBonusPct}%</td>
                <td className="py-1.5">{r.effectiveFrom}</td>
              </tr>
            ))}
            {props.rates.length === 0 && <tr><td colSpan={6} className="py-3">No rates yet — built-in defaults apply (b2c 30/10, b2b 60/20, +50% verified).</td></tr>}
          </tbody>
        </table>
        <form action={rateAction} className="flex flex-wrap items-end gap-3 text-[13.5px]">
          {rateState.error && <p className="w-full text-red-400">{rateState.error}</p>}
          {rateState.ok && <p className="w-full text-[var(--color-success)]">{rateState.ok}</p>}
          <label className={label}>Type
            <select name="leadType" className={input}>
              <option value="b2c">B2C</option>
              <option value="b2b">B2B</option>
            </select>
          </label>
          <label className={label}>Industry (empty = default)<input name="industry" placeholder="Real estate" className={`${input} w-[160px]`} /></label>
          <label className={label}>Exclusive tokens<input name="exclusiveTokens" type="number" min={1} required className={`${input} w-[100px]`} /></label>
          <label className={label}>Shared tokens<input name="sharedTokens" type="number" min={1} required className={`${input} w-[100px]`} /></label>
          <label className={label}>Verified bonus %<input name="verifiedBonusPct" type="number" min={0} defaultValue={50} className={`${input} w-[90px]`} /></label>
          <button className="rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 font-semibold text-white">Add rate</button>
        </form>
      </div>

      <div className="card !p-0">
        <div className="border-b border-[var(--color-line)] px-4 py-2.5 text-[15px] font-bold text-white">Recent ledger</div>
        <table className="w-full text-left text-[13px] text-[var(--color-muted)]">
          <tbody className="divide-y divide-[var(--color-line)]">
            {props.ledger.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.at}</td>
                <td className="px-4 py-2 text-white">{l.orgName}</td>
                <td className={`px-4 py-2 font-semibold ${l.delta > 0 ? "text-[var(--color-success)]" : "text-red-400"}`}>{l.delta > 0 ? "+" : ""}{l.delta}</td>
                <td className="px-4 py-2">{l.kind}</td>
                <td className="px-4 py-2">{l.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
