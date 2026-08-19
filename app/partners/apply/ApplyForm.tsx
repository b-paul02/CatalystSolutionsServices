"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  DEAL_SIZE_BANDS, ENTITY_TYPES, EXPECTED_DEALS_BANDS, FAMILIES, INDUSTRIES,
  LEAD_SOURCES, MARKETS, PROSPECT_BANDS,
} from "@/lib/partner/application-fields";
import { saveStep, submitApplication, type DraftFields } from "./actions";

const STEPS = ["About you", "Your business", "Track record", "Pipeline", "Fit & commitment"];

export default function ApplyForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [f, setF] = useState<DraftFields>({ industries: [], leadSources: [], markets: [], targetFamilies: [] });
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DraftFields>(k: K, v: DraftFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k: "industries" | "leadSources" | "markets" | "targetFamilies", v: string) =>
    setF((p) => {
      const cur = p[k] ?? [];
      return { ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  function invalid(): string | null {
    if (step === 0) {
      if (!f.fullName?.trim()) return "Please tell us your name.";
      if (!f.email?.includes("@")) return "Please give a valid email address.";
    }
    if (step === 4 && (f.markets?.length ?? 0) === 0) return "Please choose at least one market.";
    return null;
  }

  async function next() {
    const problem = invalid();
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try {
      const res = await saveStep(token, f);
      setToken(res.token);
      if (step < STEPS.length - 1) setStep(step + 1);
      else {
        const done = await submitApplication(res.token, honeypot);
        router.push(`/partners/apply/status/${done.token}`);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-[12.5px] text-[var(--color-faint)]">
          <span>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] transition-all"
               style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        <Grid>
          <Field label="Full name" required><input className="field" value={f.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" /></Field>
          <Field label="Email" required><input className="field" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} autoComplete="email" /></Field>
          <Field label="Phone"><input className="field" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" /></Field>
          <Field label="LinkedIn profile"><input className="field" value={f.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/…" /></Field>
          <Field label="Country"><input className="field" value={f.country ?? ""} onChange={(e) => set("country", e.target.value)} autoComplete="country-name" /></Field>
          <Field label="City"><input className="field" value={f.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
        </Grid>
      )}

      {step === 1 && (
        <Grid>
          <Field label="Company name"><input className="field" value={f.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} /></Field>
          <Field label="Company website"><input className="field" value={f.companyWebsite ?? ""} onChange={(e) => set("companyWebsite", e.target.value)} placeholder="yoursite.com" /></Field>
          <Field label="How you operate">
            <select className="field" value={f.entityType ?? ""} onChange={(e) => set("entityType", e.target.value)}>
              <option value="" className="bg-[#13101f]">Select…</option>
              {ENTITY_TYPES.map((o) => <option key={o} className="bg-[#13101f]">{o}</option>)}
            </select>
          </Field>
          <Field label="Team size"><input className="field" type="number" min={0} value={f.teamSize ?? ""} onChange={(e) => set("teamSize", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          <Field label="Delivery" full>
            <label className="flex items-center gap-2.5 text-[14px] text-[var(--color-muted)]">
              <input type="checkbox" checked={f.hasOwnDelivery ?? false} onChange={(e) => set("hasOwnDelivery", e.target.checked)} />
              I have my own delivery team as well as sales
            </label>
          </Field>
        </Grid>
      )}

      {step === 2 && (
        <Grid>
          <Field label="Years selling services"><input className="field" type="number" min={0} value={f.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          <Field label="Typical deal size you close">
            <select className="field" value={f.typicalDealSizeBand ?? ""} onChange={(e) => set("typicalDealSizeBand", e.target.value)}>
              <option value="" className="bg-[#13101f]">Select…</option>
              {DEAL_SIZE_BANDS.map((o) => <option key={o} className="bg-[#13101f]">{o}</option>)}
            </select>
          </Field>
          <Field label="Industries you have sold into" full>
            <Chips options={INDUSTRIES} selected={f.industries ?? []} onToggle={(v) => toggle("industries", v)} />
          </Field>
          <Field label="Two or three deals you closed — what, for whom, roughly what size" full>
            <textarea className="field resize-y" rows={5} value={f.dealExamples ?? ""} onChange={(e) => set("dealExamples", e.target.value)} />
          </Field>
        </Grid>
      )}

      {step === 3 && (
        <Grid>
          <Field label="Prospects you could approach in the next 90 days">
            <select className="field" value={f.prospects90dBand ?? ""} onChange={(e) => set("prospects90dBand", e.target.value)}>
              <option value="" className="bg-[#13101f]">Select…</option>
              {PROSPECT_BANDS.map((o) => <option key={o} className="bg-[#13101f]">{o}</option>)}
            </select>
          </Field>
          <Field label="Deals you expect to close">
            <select className="field" value={f.expectedDealsBand ?? ""} onChange={(e) => set("expectedDealsBand", e.target.value)}>
              <option value="" className="bg-[#13101f]">Select…</option>
              {EXPECTED_DEALS_BANDS.map((o) => <option key={o} className="bg-[#13101f]">{o}</option>)}
            </select>
          </Field>
          <Field label="Where your leads come from" full>
            <Chips options={LEAD_SOURCES} selected={f.leadSources ?? []} onToggle={(v) => toggle("leadSources", v)} />
          </Field>
        </Grid>
      )}

      {step === 4 && (
        <Grid>
          <Field label="Markets you can sell in" full required>
            <Chips options={MARKETS.map((m) => m.label)} selected={(f.markets ?? []).map((v) => MARKETS.find((m) => m.value === v)?.label ?? v)}
                   onToggle={(label) => toggle("markets", MARKETS.find((m) => m.label === label)!.value)} />
          </Field>
          <Field label="Programme families you want to sell" full>
            <Chips options={FAMILIES.map((x) => x.label)} selected={(f.targetFamilies ?? []).map((v) => FAMILIES.find((x) => x.value === v)?.label ?? v)}
                   onToggle={(label) => toggle("targetFamilies", FAMILIES.find((x) => x.label === label)!.value)} />
          </Field>
          <Field label="Hours a week you can give this"><input className="field" type="number" min={0} max={80} value={f.hoursPerWeek ?? ""} onChange={(e) => set("hoursPerWeek", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          <Field label="Why Catalyst?" full>
            <textarea className="field resize-y" rows={4} value={f.whyCatalyst ?? ""} onChange={(e) => set("whyCatalyst", e.target.value)} />
          </Field>
          {/* Honeypot — hidden from people, irresistible to bots. */}
          <input type="text" name="company_website_confirm" tabIndex={-1} autoComplete="off" aria-hidden="true"
                 value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
                 className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        </Grid>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => { setError(null); setStep(Math.max(0, step - 1)); }}
                disabled={step === 0 || busy}
                className="text-[13.5px] text-[var(--color-muted)] hover:text-white disabled:opacity-40">Back</button>
        <button type="button" onClick={next} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? "Saving…" : step === STEPS.length - 1 ? "Submit application" : "Continue"}
          <Icon name="arrow_forward" className="text-[19px]" />
        </button>
      </div>
      <p className="mt-3 text-right text-[12px] text-[var(--color-faint)]">Your progress is saved as you go.</p>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="relative grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, children, full, required }: { label: string; children: React.ReactNode; full?: boolean; required?: boolean }) {
  return (
    <div className={`flex flex-col gap-[7px] ${full ? "sm:col-span-2" : ""}`}>
      <label className="label">{label}{required && <span className="text-[var(--color-brand-soft)]"> *</span>}</label>
      {children}
    </div>
  );
}

function Chips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={on}
            className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
              on ? "border-[#7C3AED] bg-[#7C3AED]/20 text-white" : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-white"}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
