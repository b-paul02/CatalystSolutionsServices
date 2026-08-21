"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { registerDealAction } from "../actions";

const TIERS = ["T1", "T2", "T3"];

export default function NewDealForm({
  markets, families, currencyOf,
}: {
  markets: { value: string; label: string }[];
  families: { value: string; label: string }[];
  currencyOf: Record<string, string>;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    clientLegalName: "", website: "", noWebsite: false, contactName: "", contactEmail: "", contactPhone: "",
    market: markets[0]?.value ?? "IN", family: "", estimatedTier: "", estimatedValue: "",
    expectedCloseDate: "", howYouKnowThem: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true); setRejection(null);
    try {
      const res = await registerDealAction(f);
      if (res.ok) {
        router.push(`/partner/deals/${res.dealId}?registered=1`);
        return;
      }
      setRejection(res.message);
    } catch (e) {
      setRejection(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      {rejection && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[14px] font-semibold text-amber-300">{rejection}</p>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-[var(--color-muted)]">
            If you think this is wrong, talk to your Catalyst contact — they can look into it.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client legal name" required full>
          <input className="field" value={f.clientLegalName} onChange={(e) => set("clientLegalName", e.target.value)} />
        </Field>

        {!f.noWebsite && (
          <Field label="Website or online profile" required full>
            <input className="field" value={f.website} onChange={(e) => set("website", e.target.value)}
                   placeholder="acme.co.in — or an Instagram, Facebook or Google Business page" />
            <p className="mt-1.5 text-[12px] text-[var(--color-faint)]">
              This is how we tell accounts apart, so it decides who has the deal. Get it right.
            </p>
          </Field>
        )}

        <Field label=" " full>
          <label className="flex items-center gap-2.5 text-[13.5px] text-[var(--color-muted)]">
            <input type="checkbox" checked={f.noWebsite}
                   onChange={(e) => set("noWebsite", e.target.checked)} />
            This business has no website or online profile
          </label>
          {f.noWebsite && (
            <p className="mt-1.5 text-[12px] text-amber-300">
              We will identify this business by its phone number instead — so the contact phone below must be right.
            </p>
          )}
        </Field>

        <Field label="Contact name"><input className="field" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
        <Field label="Contact email"><input className="field" type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
        <Field label="Contact phone" required={f.noWebsite}>
          <input className="field" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>

        <Field label="Market" required>
          <select className="field" value={f.market} onChange={(e) => set("market", e.target.value)}>
            {markets.map((m) => <option key={m.value} value={m.value} className="bg-[#13101f]">{m.label}</option>)}
          </select>
        </Field>

        <Field label="Family">
          <select className="field" value={f.family} onChange={(e) => set("family", e.target.value)}>
            <option value="" className="bg-[#13101f]">Not sure yet</option>
            {families.map((x) => <option key={x.value} value={x.value} className="bg-[#13101f]">{x.label}</option>)}
          </select>
        </Field>

        <Field label="Estimated tier">
          <select className="field" value={f.estimatedTier} onChange={(e) => set("estimatedTier", e.target.value)}>
            <option value="" className="bg-[#13101f]">Not sure yet</option>
            {TIERS.map((t) => <option key={t} className="bg-[#13101f]">{t}</option>)}
          </select>
        </Field>

        <Field label={`Estimated onboarding value (${currencyOf[f.market] ?? ""})`}>
          <input className="field" inputMode="numeric" value={f.estimatedValue}
                 onChange={(e) => set("estimatedValue", e.target.value)} placeholder="85000" />
          <p className="mt-1.5 text-[12px] text-[var(--color-faint)]">
            Your rough estimate, for your pipeline only. The real price comes from the price book when you build the quote.
          </p>
        </Field>

        <Field label="Expected close date">
          <input className="field" type="date" value={f.expectedCloseDate} onChange={(e) => set("expectedCloseDate", e.target.value)} />
        </Field>

        <Field label="How you know them" full>
          <input className="field" value={f.howYouKnowThem} onChange={(e) => set("howYouKnowThem", e.target.value)} />
        </Field>

        <Field label="Notes" full>
          <textarea className="field resize-y" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <button onClick={submit}
              disabled={busy || !f.clientLegalName.trim() || (f.noWebsite ? !f.contactPhone.trim() : !f.website.trim())}
              className="btn-primary mt-6 w-full justify-center disabled:opacity-50">
        {busy ? "Checking…" : "Register deal"} <Icon name="arrow_forward" className="text-[19px]" />
      </button>
      <p className="mt-3 text-center text-[12px] text-[var(--color-faint)]">
        We check the website against existing accounts before granting protection.
      </p>
    </div>
  );
}

function Field({ label, children, full, required }: { label: string; children: React.ReactNode; full?: boolean; required?: boolean }) {
  return (
    <div className={`flex flex-col gap-[7px] ${full ? "sm:col-span-2" : ""}`}>
      <label className="label">{label}{required && <span className="text-[var(--color-brand-soft)]"> *</span>}</label>
      {children}
    </div>
  );
}
