"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { programs, type Program, type Tier } from "@/lib/programs";
import { customPresets } from "@/lib/customPresets";
import { savePlan } from "./actions";

// Editable tier — prices are entered once, in the plan's market currency.
type TierDraft = {
  label: string;
  name: string;
  positioning: string;
  whoFor: string;
  deliverables: string; // one per line
  guardrails: string; // one per line
  setup: string; // "₹50,000" — empty = call-to-quote tier
  setupLabel: string;
  monthly: string; // "₹9,999/mo" — empty = no maintenance option
  priceNote: string;
};

const blankTier = (): TierDraft => ({
  label: "Fixed Project",
  name: "",
  positioning: "",
  whoFor: "",
  deliverables: "",
  guardrails: "",
  setup: "",
  setupLabel: "Project price",
  monthly: "",
  priceNote: "",
});

const toDraft = (t: Tier, market: "in" | "us"): TierDraft => ({
  label: t.label,
  name: t.name,
  positioning: t.positioning,
  whoFor: t.whoFor,
  deliverables: (t.deliverables ?? []).join("\n"),
  guardrails: t.guardrails.join("\n"),
  setup: t.setup?.[market] ?? "",
  setupLabel: t.setupLabel ?? "Onboarding",
  monthly: t.monthly?.[market] ?? "",
  priceNote: t.priceNote ?? "",
});

// The stored Money carries the entered string on both sides — the plan's
// market field decides which one is ever read. ponytail: single-currency plans.
const toTier = (d: TierDraft): Tier => ({
  label: d.label.trim() || "Option",
  name: d.name.trim(),
  positioning: d.positioning.trim(),
  whoFor: d.whoFor.trim(),
  deliverables: d.deliverables.split("\n").map((s) => s.trim()).filter(Boolean),
  guardrails: d.guardrails.split("\n").map((s) => s.trim()).filter(Boolean),
  ...(d.setup.trim() ? { setup: { in: d.setup.trim(), us: d.setup.trim() }, setupLabel: d.setupLabel.trim() || "Onboarding" } : {}),
  ...(d.monthly.trim() ? { monthly: { in: d.monthly.trim(), us: d.monthly.trim() } } : {}),
  ...(d.priceNote.trim() ? { priceNote: d.priceNote.trim() } : {}),
});

export type PlanInitial = {
  id?: string;
  customerName: string;
  email: string;
  market: "in" | "us";
  expiresAt: string;
  program: Program | null;
};

export default function PlanEditor({ initial }: { initial: PlanInitial }) {
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [email, setEmail] = useState(initial.email);
  const [market, setMarket] = useState<"in" | "us">(initial.market);
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt);
  const [planName, setPlanName] = useState(initial.program?.name ?? "");
  const [tagline, setTagline] = useState(initial.program?.tagline ?? "");
  const [termLine, setTermLine] = useState(initial.program?.termLine ?? "12-month standard term.");
  const [upfrontPct, setUpfrontPct] = useState<50 | 100>(initial.program?.upfrontPct ?? 50);
  const [tiers, setTiers] = useState<TierDraft[]>(initial.program?.tiers.map((t) => toDraft(t, initial.market)) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTier = (i: number, patch: Partial<TierDraft>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, dir: -1 | 1) =>
    setTiers((ts) => {
      const j = i + dir;
      if (j < 0 || j >= ts.length) return ts;
      const next = [...ts];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const loadProgram = (slug: string) => {
    const p = programs.find((x) => x.slug === slug);
    if (!p) return;
    setPlanName(p.name);
    setTagline(p.tagline);
    setTermLine(p.termLine);
    setTiers(p.tiers.map((t) => toDraft(t, market)));
  };

  const addPreset = (name: string) => {
    const t = customPresets.find((x) => x.name === name);
    if (t) setTiers((ts) => [...ts, toDraft(t, market)]);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const program: Program = {
        industry: "Custom",
        name: planName.trim(),
        slug: "custom",
        tagline: tagline.trim(),
        termLine: termLine.trim(),
        tiers: tiers.map(toTier).filter((t) => t.name),
        upgradePath: [],
        upfrontPct,
      };
      await savePlan({ id: initial.id, customerName, email, market, expiresAt, json: JSON.stringify(program) });
    } catch (e) {
      // redirect() throws internally — rethrow it so navigation happens
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError(e instanceof Error ? e.message : "Couldn't save the plan.");
      setSaving(false);
    }
  };

  const input =
    "w-full rounded-lg border border-[var(--color-line)] bg-white/[0.04] px-3 py-2 text-[13.5px] text-white placeholder:text-[var(--color-faint)] focus:border-[rgba(168,85,247,0.6)] focus:outline-none";
  const label = "mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)]";
  const cur = market === "in" ? "₹" : "$";

  return (
    <section className="shell py-14">
      <nav className="mb-6 flex items-center gap-2 text-[13px] text-[var(--color-faint)]">
        <Link href="/admin/plans" className="hover:text-[var(--color-brand-soft)]">Custom Plans</Link>
        <Icon name="chevron_right" className="text-[16px]" />
        <span className="text-[var(--color-brand-soft)]">{initial.id ? "Edit" : "New"}</span>
      </nav>
      <h1 className="mb-8 text-[28px] font-extrabold text-white">{initial.id ? "Edit Custom Plan" : "New Custom Plan"}</h1>

      {/* PLAN META */}
      <div className="card mb-6 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label}>Customer name *</label>
          <input className={input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Acme Clinic, Dr. Rao…" />
        </div>
        <div>
          <label className={label}>Customer email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className={label}>Market</label>
          <select className={input} value={market} onChange={(e) => setMarket(e.target.value as "in" | "us")}>
            <option value="in">India (₹)</option>
            <option value="us">US ($)</option>
          </select>
        </div>
        <div>
          <label className={label}>Valid until</label>
          <input className={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div>
          <label className={label}>Charged at booking</label>
          <select className={input} value={upfrontPct} onChange={(e) => setUpfrontPct(Number(e.target.value) as 50 | 100)}>
            <option value={50}>50% deposit — balance at launch</option>
            <option value={100}>100% upfront</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Plan title *</label>
          <input className={input} value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Growth Plan for Acme Clinic" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Tagline</label>
          <input className={input} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One line under the title on the customer page" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={label}>Term line (shown at checkout)</label>
          <input className={input} value={termLine} onChange={(e) => setTermLine(e.target.value)} />
        </div>
      </div>

      {/* STARTING POINTS */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setTiers((ts) => [...ts, blankTier()])} className="btn-ghost px-4 py-2 text-[13px]">
          <Icon name="add" className="text-[16px]" /> Blank tier
        </button>
        <select className={`${input} w-auto`} value="" onChange={(e) => e.target.value && addPreset(e.target.value)}>
          <option value="">Add custom service preset…</option>
          {customPresets.map((p) => (
            <option key={p.name} value={p.name}>{p.name} — {p.setup?.[market]}</option>
          ))}
        </select>
        <select className={`${input} w-auto`} value="" onChange={(e) => e.target.value && loadProgram(e.target.value)}>
          <option value="">Load industry program (replaces tiers)…</option>
          {programs.map((p) => (
            <option key={p.slug} value={p.slug}>{p.industry} — {p.name}</option>
          ))}
        </select>
      </div>

      {/* TIERS */}
      <div className="flex flex-col gap-4">
        {tiers.map((t, i) => (
          <div key={i} className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Tier {i + 1}</span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => move(i, -1)} className="btn-ghost px-2 py-1 text-[12px]" title="Move up"><Icon name="arrow_upward" className="text-[15px]" /></button>
                <button type="button" onClick={() => move(i, 1)} className="btn-ghost px-2 py-1 text-[12px]" title="Move down"><Icon name="arrow_downward" className="text-[15px]" /></button>
                <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="btn-ghost px-2 py-1 text-[12px] text-[#FCA5A5]" title="Remove"><Icon name="delete" className="text-[15px]" /></button>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={label}>Label</label>
                <input className={input} value={t.label} onChange={(e) => setTier(i, { label: e.target.value })} placeholder="Tier 1 / Fixed Project" />
              </div>
              <div>
                <label className={label}>Name *</label>
                <input className={input} value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="WordPress Website" />
              </div>
              <div>
                <label className={label}>Price ({cur}) — blank = book a call</label>
                <input className={input} value={t.setup} onChange={(e) => setTier(i, { setup: e.target.value })} placeholder={market === "in" ? "₹50,000" : "$1,800"} />
              </div>
              <div>
                <label className={label}>Price label</label>
                <input className={input} value={t.setupLabel} onChange={(e) => setTier(i, { setupLabel: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Positioning (one line)</label>
                <input className={input} value={t.positioning} onChange={(e) => setTier(i, { positioning: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Who it&apos;s for</label>
                <input className={input} value={t.whoFor} onChange={(e) => setTier(i, { whoFor: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Deliverables (one per line)</label>
                <textarea className={`${input} min-h-[110px]`} value={t.deliverables} onChange={(e) => setTier(i, { deliverables: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Scope guardrails (one per line)</label>
                <textarea className={`${input} min-h-[110px]`} value={t.guardrails} onChange={(e) => setTier(i, { guardrails: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Monthly maintenance ({cur}/mo) — blank = none</label>
                <input className={input} value={t.monthly} onChange={(e) => setTier(i, { monthly: e.target.value })} placeholder={market === "in" ? "₹9,999/mo" : "$699/mo"} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Price note</label>
                <input className={input} value={t.priceNote} onChange={(e) => setTier(i, { priceNote: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        {tiers.length === 0 && (
          <p className="card p-6 text-[13.5px] text-[var(--color-faint)]">No tiers yet — add a blank tier, a custom service preset, or load an industry program above.</p>
        )}
      </div>

      {error && <p className="mt-4 text-[13.5px] text-[#FCA5A5]">{error}</p>}
      <div className="mt-6 flex items-center gap-4">
        <button type="button" onClick={submit} disabled={saving} className="btn-primary px-6 disabled:opacity-60">
          {saving ? "Saving…" : "Save plan"}
        </button>
        <Link href="/admin/plans" className="btn-ghost">Cancel</Link>
      </div>
    </section>
  );
}
