import Link from "next/link";
import { db } from "@/lib/audit/db";
import { staffPage } from "@/lib/partner/page-guards";
import { formatMoney, formatRate, type Currency } from "@/lib/partner/money";
import { COMMISSION_STATES, ledgerRows, ledgerSummary } from "@/lib/partner/ledger";
import LedgerRowActions from "./LedgerRowActions";

export const metadata = { title: "Commission ledger", robots: { index: false } };

const shortDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

const STATE_TONE: Record<string, string> = {
  pending: "bg-white/5 text-[var(--color-muted)]",
  accrued: "bg-sky-500/15 text-sky-300",
  payable: "bg-amber-500/15 text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  adjusted: "bg-red-500/15 text-red-300",
  void: "bg-white/5 text-[var(--color-faint)]",
};

export default async function CommissionLedger({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await staffPage("finance", "admin", "super_admin");
  const q = await searchParams;
  const filters = { partnerId: q.partnerId, state: q.state, market: q.market, from: q.from, to: q.to };

  const [rows, summary, partners] = await Promise.all([
    ledgerRows(filters),
    ledgerSummary(filters),
    db.partner.findMany({ select: { id: true, legalName: true }, orderBy: { legalName: "asc" } }),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <section className="shell py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white">Commission ledger</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">
            {rows.length} row{rows.length === 1 ? "" : "s"}. Every row shows the rate it was actually calculated with.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/partners" className="text-[13.5px] text-[var(--color-muted)] hover:text-white">Partners →</Link>
          <a href={`/api/admin/partners/commissions/export${exportQs ? `?${exportQs}` : ""}`}
             className="btn-ghost px-3 py-1.5 text-[13px]">Export CSV</a>
        </div>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" action="/admin/partners/commissions">
        <Select name="partnerId" label="Partner" value={q.partnerId}
                options={partners.map((p) => ({ value: p.id, label: p.legalName }))} />
        <Select name="state" label="State" value={q.state}
                options={COMMISSION_STATES.map((s) => ({ value: s, label: s }))} />
        <Select name="market" label="Market" value={q.market}
                options={[{ value: "IN", label: "IN" }, { value: "US", label: "US" }]} />
        <div className="flex flex-col gap-[7px]">
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={q.from ?? ""} className="field h-[38px] py-1" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={q.to ?? ""} className="field h-[38px] py-1" />
        </div>
        <button className="btn-primary h-[38px] px-4 text-[13px]">Filter</button>
        <Link href="/admin/partners/commissions" className="pb-2 text-[13px] text-[var(--color-muted)] hover:text-white">Clear</Link>
      </form>

      <h2 className="mb-3 text-[15px] font-bold text-white">Per-partner earnings</h2>
      {summary.length === 0 ? (
        <p className="card mb-8 text-[14px] text-[var(--color-muted)]">No commissions match these filters.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Partner</th>
                {COMMISSION_STATES.map((s) => <th key={s} className="px-4 py-3 text-right font-semibold">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={`${s.partnerId}-${s.currency}`} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/partners/${s.partnerId}`} className="font-medium text-white hover:underline">{s.partnerName}</Link>
                    <span className="ml-2 text-[11.5px] text-[var(--color-faint)]">{s.currency}</span>
                  </td>
                  {COMMISSION_STATES.map((state) => (
                    <td key={state} className={`px-4 py-3 text-right ${state === "paid" ? "text-emerald-300" : "text-[var(--color-muted)]"}`}>
                      {s.totals[state] === 0n ? "—" : formatMoney(s.totals[state], s.currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-[15px] font-bold text-white">Commissions</h2>
      {rows.length === 0 ? (
        <p className="card text-[14px] text-[var(--color-muted)]">Nothing to show.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
          <table className="w-full min-w-[1020px] text-left text-[13px]">
            <thead className="bg-[var(--color-bg-2)] text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
              <tr>
                {["Partner", "Deal", "Base", "Rate applied", "Amount", "State", "Dates", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const currency = r.currency as Currency;
                return (
                  <tr key={r.id} className="border-t border-[var(--color-line)] align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/partners/${r.partner.id}`} className="font-medium text-white hover:underline">
                        {r.partner.legalName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white">{r.deal.client.legalName}</div>
                      <div className="text-[11.5px] text-[var(--color-faint)]">{r.deal.market} · {r.deal.stage}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{formatMoney(r.baseAmount, currency)}</td>
                    <td className="px-4 py-3 font-semibold text-white">{formatRate(r.rateBp)}</td>
                    <td className={`px-4 py-3 font-semibold ${r.amount < 0n ? "text-red-300" : "text-white"}`}>
                      {formatMoney(r.amount, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-1 text-[11.5px] ${STATE_TONE[r.state] ?? ""}`}>{r.state}</span>
                      {r.adjustmentReasonCode && (
                        <div className="mt-1 text-[11.5px] text-red-300">{r.adjustmentReasonCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--color-faint)]">
                      <div>created {shortDate(r.createdAt)}</div>
                      {r.accruedAt && <div>accrued {shortDate(r.accruedAt)}</div>}
                      {r.payableAt && <div>payable {shortDate(r.payableAt)}</div>}
                      {r.paidAt && <div>paid {shortDate(r.paidAt)} · {r.payoutRef}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <LedgerRowActions
                        commissionId={r.id}
                        state={r.state}
                        dealId={r.deal.id}
                        currency={currency}
                        invoices={r.deal.invoices.map((i) => ({
                          id: i.id, amount: i.amount.toString(), status: i.status, reference: i.reference,
                        }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 text-[12px] leading-[1.55] text-[var(--color-faint)]">
        A commission can only be adjusted for a refund, a chargeback or recorded misselling. There is no retention
        clawback — a client ending the monthly Growth Plan never reduces what a partner has earned.
      </p>
    </section>
  );
}

function Select({ name, label, value, options }: {
  name: string; label: string; value?: string; options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <label className="label">{label}</label>
      <select name={name} defaultValue={value ?? ""} className="field h-[38px] py-1">
        <option value="" className="bg-[#13101f]">Any</option>
        {options.map((o) => <option key={o.value} value={o.value} className="bg-[#13101f]">{o.label}</option>)}
      </select>
    </div>
  );
}
