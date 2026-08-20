"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FAMILIES, MARKETS, QUOTE_THRESHOLD_TIERS, REASON_CODES, REASON_CODE_LABELS, REQUESTABLE_FIELDS,
} from "@/lib/partner/application-fields";
import CopyableMessage, { type OutboundMessageView } from "@/components/CopyableMessage";
import { approveApplication, rejectApplication, requestInfo, setApplicationStatus } from "../actions";

type Mode = null | "approve" | "reject" | "info";

export default function DecisionPanel({
  applicationId, defaultLegalName, applicantMarkets, applicantFamilies,
}: {
  applicationId: string;
  defaultLegalName: string;
  applicantMarkets: string[];
  applicantFamilies: string[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The email the admin now has to send by hand.
  const [outbound, setOutbound] = useState<{ title: string; message: OutboundMessageView } | null>(null);

  // Approve terms. The rate is entered as a percentage and stored as basis
  // points — there is no default rate baked into the code path.
  const [ratePct, setRatePct] = useState("30");
  const [rateReason, setRateReason] = useState("Standard rate for a new partner at onboarding.");
  const [markets, setMarkets] = useState<string[]>(applicantMarkets.length ? applicantMarkets : ["IN"]);
  const [families, setFamilies] = useState<string[]>(applicantFamilies);
  const [protectionDays, setProtectionDays] = useState("90");
  const [tier, setTier] = useState("T2");
  const [legalName, setLegalName] = useState(defaultLegalName);

  const [reasonCode, setReasonCode] = useState<string>("");
  const [internalNote, setInternalNote] = useState("");

  const [fields, setFields] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const rateBp = Math.round(Number(ratePct) * 100);
  const rateValid = Number.isFinite(rateBp) && rateBp >= 0 && rateBp <= 5000;
  const needsSecond = rateBp > 3000;

  async function run(fn: () => Promise<unknown>, done?: string, emailTitle?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = (await fn()) as { message?: OutboundMessageView } | OutboundMessageView | undefined;
      const message = result && "subject" in (result as OutboundMessageView)
        ? (result as OutboundMessageView)
        : (result as { message?: OutboundMessageView } | undefined)?.message;
      if (message && emailTitle) {
        // Hold the refresh: refreshing here would re-render this page into its
        // decided state and unmount the panel — taking the one-time password
        // with it. The refresh happens when the admin dismisses the message.
        setOutbound({ title: emailTitle, message });
        if (done) setNotice(done);
        setMode(null);
        setBusy(false);
        return;
      }
      if (done) setNotice(done);
      setMode(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="card">
      <h2 className="mb-3.5 text-[15px] font-bold text-white">Decision</h2>

      {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}

      {outbound && (
        <div className="mb-4">
          <CopyableMessage
            title={outbound.title}
            message={outbound.message}
            onDone={() => { setOutbound(null); router.refresh(); }}
          />
        </div>
      )}
      {notice && <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">{notice}</p>}

      {mode === null && (
        <div className="grid gap-2">
          <button onClick={() => setMode("approve")} disabled={busy} className="btn-primary w-full justify-center text-[13.5px]">Approve</button>
          <button onClick={() => setMode("info")} disabled={busy} className="btn-ghost w-full justify-center text-[13.5px]">Request more information</button>
          <button onClick={() => run(() => setApplicationStatus(applicationId, "low_priority"), "Moved to low priority.")}
                  disabled={busy} className="btn-ghost w-full justify-center text-[13.5px]">Move to low priority</button>
          <button onClick={() => setMode("reject")} disabled={busy}
                  className="w-full rounded-xl border border-red-500/30 px-4 py-2.5 text-[13.5px] text-red-300 hover:bg-red-500/10">Reject</button>
        </div>
      )}

      {mode === "approve" && (
        <div className="grid gap-3.5">
          <Field label="Partner legal name">
            <input className="field" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>

          <Field label="Commission rate (% of the onboarding fee)">
            <input className="field" type="number" min={0} max={50} step={0.5} value={ratePct} onChange={(e) => setRatePct(e.target.value)} />
            <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--color-faint)]">
              Stored as {rateBp} basis points. Recurring Growth Plan revenue is never commissionable.
            </p>
            {!rateValid && <p className="mt-1 text-[12px] text-red-300">The rate must be between 0% and 50%.</p>}
            {rateValid && needsSecond && (
              <p className="mt-1 text-[12px] text-amber-300">
                Above 30% — this rate is recorded but stays pending until a second admin approves it.
              </p>
            )}
          </Field>

          <Field label="Reason for this rate (recorded in the rate history)">
            <textarea className="field resize-y" rows={2} value={rateReason} onChange={(e) => setRateReason(e.target.value)} />
          </Field>

          <Field label="Markets enabled">
            <Chips options={MARKETS.map((m) => m.value)} labels={MARKETS.map((m) => m.label)}
                   selected={markets} onToggle={(v) => toggle(markets, setMarkets, v)} />
          </Field>

          <Field label="Families enabled">
            <Chips options={FAMILIES.map((f) => f.value)} labels={FAMILIES.map((f) => f.label)}
                   selected={families} onToggle={(v) => toggle(families, setFamilies, v)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Protection days">
              <input className="field" type="number" min={1} max={365} value={protectionDays} onChange={(e) => setProtectionDays(e.target.value)} />
            </Field>
            <Field label="Quote threshold">
              <select className="field" value={tier} onChange={(e) => setTier(e.target.value)}>
                {QUOTE_THRESHOLD_TIERS.map((t) => <option key={t} className="bg-[#13101f]">{t}</option>)}
              </select>
            </Field>
          </div>

          <Actions busy={busy} onCancel={() => setMode(null)} label="Approve and create partner"
            disabled={!rateValid || rateReason.trim().length < 10 || markets.length === 0}
            onConfirm={() => run(() => approveApplication(applicationId, {
              rateBp, rateReason, markets, families,
              protectionDays: Number(protectionDays), quoteThresholdTier: tier, legalName,
            }), "Partner created.", "Welcome email — send this to the new partner")} />
        </div>
      )}

      {mode === "reject" && (
        <div className="grid gap-3.5">
          <Field label="Reason code (internal — never sent to the applicant)">
            <select className="field" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="" className="bg-[#13101f]">Select a reason…</option>
              {REASON_CODES.map((c) => <option key={c} value={c} className="bg-[#13101f]">{REASON_CODE_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="Internal note (optional)">
            <textarea className="field resize-y" rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
          </Field>
          <p className="text-[12px] leading-[1.5] text-[var(--color-faint)]">
            You will get a short, gracious email to send. It contains no reason code and no note. The record is retained.
          </p>
          <Actions busy={busy} onCancel={() => setMode(null)} label="Reject application" disabled={!reasonCode}
            onConfirm={() => run(() => rejectApplication(applicationId, reasonCode as never, internalNote),
              "Application rejected.", "Rejection email — send this to the applicant")} />
        </div>
      )}

      {mode === "info" && (
        <div className="grid gap-3.5">
          <Field label="Fields the applicant may edit">
            <Chips options={REQUESTABLE_FIELDS.map((f) => f.key)} labels={REQUESTABLE_FIELDS.map((f) => f.label)}
                   selected={fields} onToggle={(v) => toggle(fields, setFields, v)} />
          </Field>
          <Field label="What do you need from them?">
            <textarea className="field resize-y" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Actions busy={busy} onCancel={() => setMode(null)} label="Send request"
            disabled={fields.length === 0 || message.trim().length < 5}
            onConfirm={() => run(() => requestInfo(applicationId, fields, message),
              "Information requested.", "Information request — send this to the applicant")} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-[7px]"><label className="label">{label}</label>{children}</div>;
}

function Actions({ busy, disabled, label, onConfirm, onCancel }: {
  busy: boolean; disabled?: boolean; label: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-3">
      <button onClick={onConfirm} disabled={busy || disabled} className="btn-primary flex-1 justify-center text-[13.5px] disabled:opacity-50">
        {busy ? "Working…" : label}
      </button>
      <button onClick={onCancel} disabled={busy} className="text-[13px] text-[var(--color-muted)] hover:text-white">Cancel</button>
    </div>
  );
}

function Chips({ options, labels, selected, onToggle }: {
  options: string[]; labels: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o, i) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-[12.5px] ${
              on ? "border-[#7C3AED] bg-[#7C3AED]/20 text-white" : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-white"}`}>
            {labels[i]}
          </button>
        );
      })}
    </div>
  );
}
