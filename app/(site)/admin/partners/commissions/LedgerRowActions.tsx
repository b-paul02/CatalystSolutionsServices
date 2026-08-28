"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS } from "@/lib/partner/commissions";
import { formatMoney, type Currency } from "@/lib/partner/money";
import {
  createAdjustmentAction, markPaidAction, recordCollectionAction, recordInvoiceAction,
} from "./actions";

type Mode = null | "invoice" | "collection" | "paid" | "adjust";
type Invoice = { id: string; amount: string; status: string; reference: string | null };

export default function LedgerRowActions({
  commissionId, state, dealId, currency, invoices,
}: {
  commissionId: string; state: string; dealId: string; currency: Currency; invoices: Invoice[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [method, setMethod] = useState("");
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const [reasonCode, setReasonCode] = useState<string>("");
  const [reason, setReason] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try {
      await fn();
      setMode(null); setAmount(""); setReference(""); setReason(""); setReasonCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  const can = {
    invoice: state === "pending",
    collection: state === "accrued" && invoices.length > 0,
    paid: state === "payable",
    adjust: ["pending", "accrued", "payable", "paid"].includes(state),
  };

  if (mode === null) {
    return (
      <div className="flex flex-col items-end gap-1 text-[12px]">
        {error && <p role="alert" className="max-w-[180px] text-right text-red-300">{error}</p>}
        {can.invoice && <Action onClick={() => setMode("invoice")}>Record invoice</Action>}
        {can.collection && <Action onClick={() => setMode("collection")}>Record collection</Action>}
        {can.paid && <Action onClick={() => setMode("paid")}>Mark paid</Action>}
        {can.adjust && <Action onClick={() => setMode("adjust")} danger>Adjust</Action>}
        {state === "accrued" && invoices.length === 0 && (
          <span className="text-[11.5px] text-[var(--color-faint)]">No invoice on this deal</span>
        )}
      </div>
    );
  }

  return (
    <div className="grid w-[260px] gap-2 rounded-xl border border-[var(--color-line)] bg-black/30 p-3 text-[12.5px]">
      {error && <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-300">{error}</p>}

      {mode === "invoice" && (
        <>
          <Label>Invoice amount ({currency})</Label>
          <input className="field h-[34px] py-1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="85000" />
          <Label>Reference</Label>
          <input className="field h-[34px] py-1" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Label>Due date</Label>
          <input className="field h-[34px] py-1" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <Buttons busy={busy} label="Record invoice" disabled={!amount.trim()}
                   onCancel={() => setMode(null)}
                   onConfirm={() => run(() => recordInvoiceAction(dealId, amount, reference, dueAt))} />
        </>
      )}

      {mode === "collection" && (
        <>
          <Label>Against invoice</Label>
          <select className="field h-[34px] py-1" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            {invoices.map((i) => (
              <option key={i.id} value={i.id} className="bg-[#13101f]">
                {formatMoney(BigInt(i.amount), currency)} · {i.status}{i.reference ? ` · ${i.reference}` : ""}
              </option>
            ))}
          </select>
          <Label>Amount collected ({currency})</Label>
          <input className="field h-[34px] py-1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="34000" />
          <p className="text-[11.5px] leading-[1.45] text-[var(--color-faint)]">
            A partial collection releases the same share of the commission.
          </p>
          <Label>Method</Label>
          <input className="field h-[34px] py-1" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="NEFT" />
          <Label>Reference</Label>
          <input className="field h-[34px] py-1" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Buttons busy={busy} label="Record collection" disabled={!amount.trim() || !invoiceId}
                   onCancel={() => setMode(null)}
                   onConfirm={() => run(() => recordCollectionAction(invoiceId, amount, method, reference))} />
        </>
      )}

      {mode === "paid" && (
        <>
          <Label>Payout reference</Label>
          <input className="field h-[34px] py-1" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="NEFT-2026-09-001" />
          <Buttons busy={busy} label="Mark paid" disabled={!reference.trim()}
                   onCancel={() => setMode(null)}
                   onConfirm={() => run(() => markPaidAction(commissionId, reference))} />
        </>
      )}

      {mode === "adjust" && (
        <>
          <Label>Reason code</Label>
          <select className="field h-[34px] py-1" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            <option value="" className="bg-[#13101f]">Select…</option>
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r} className="bg-[#13101f]">{ADJUSTMENT_REASON_LABELS[r]}</option>
            ))}
          </select>
          <p className="text-[11.5px] leading-[1.45] text-[var(--color-faint)]">
            These are the only reasons. A Growth Plan ending is never one of them.
          </p>
          <Label>Amount to reverse ({currency}) — blank for all</Label>
          <input className="field h-[34px] py-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Label>Reason (required)</Label>
          <textarea className="field resize-y py-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Buttons busy={busy} label="Create adjustment" disabled={!reasonCode || reason.trim().length < 10}
                   onCancel={() => setMode(null)}
                   onConfirm={() => run(() => createAdjustmentAction(commissionId, reasonCode, reason, amount))} />
        </>
      )}
    </div>
  );
}

function Action({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`hover:underline ${danger ? "text-red-300" : "text-[var(--color-brand-soft)]"}`}>
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="label text-[11px]">{children}</label>;
}

function Buttons({ busy, disabled, label, onConfirm, onCancel }: {
  busy: boolean; disabled?: boolean; label: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <button onClick={onConfirm} disabled={busy || disabled}
              className="btn-primary flex-1 justify-center px-2 py-1.5 text-[12px] disabled:opacity-50">
        {busy ? "Working…" : label}
      </button>
      <button onClick={onCancel} disabled={busy} className="text-[12px] text-[var(--color-muted)] hover:text-white">Cancel</button>
    </div>
  );
}
