import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { walletInvariant, walletSummary } from "@/lib/os/credits";
import { checkoutConfigured } from "@/lib/os/creditPurchase";
import { STALE_RUNNING_MIN, TOOLS } from "@/lib/os/studio";
import { formatMinor } from "@/lib/os/commercial";
import { parseRates } from "@/lib/os/credits";
import { creditValueMicros, marginReport, minMarginPct, PROPOSED_PACKS, PROPOSED_RATES, profitabilityProblems, providerPrices } from "@/lib/os/pricing";
import AdminForm from "../AdminForm";
import { operationRelease, packCreate, packRetire, rateCardActivate, rateCardCreate, walletGrant } from "./actions";

export const metadata = { title: "AI credits — operator" };
export const dynamic = "force-dynamic";

const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";
const label = "flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]";
const th = "px-3 py-2 text-left text-[12px] font-semibold text-[var(--color-faint)]", td = "px-3 py-1.5";
const usd = (micros: number | null) => (micros === null ? "unknown" : `$${(micros / 1_000_000).toFixed(4)}`);

export default async function CreditsAdminPage() {
  await requirePlatform();
  const since = new Date(Date.now() - 30 * 86_400_000), day = new Date(Date.now() - 86_400_000), staleAt = new Date(Date.now() - STALE_RUNNING_MIN * 60_000);
  const [cards, packs, wallets, held, troubled, orders, unmatched, usage, ops30, ops24] = await Promise.all([
    db.cosCreditRateCard.findMany({ orderBy: { version: "desc" }, take: 8 }),
    db.cosCreditPack.findMany({ orderBy: [{ active: "desc" }, { credits: "asc" }] }),
    db.cosCreditWallet.findMany({ include: { org: { select: { name: true, demo: true } } }, orderBy: { updatedAt: "desc" }, take: 60 }),
    db.cosCreditReservation.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.cosAiOperation.findMany({ where: { OR: [{ status: "uncertain" }, { status: "failed", createdAt: { gte: since } }] }, include: { org: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.cosCreditOrder.findMany({ where: { OR: [{ status: { not: "paid" } }, { createdAt: { gte: since } }] }, include: { org: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.cosPaymentEvent.findMany({ where: { appliedTo: "unmatched", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.cosAiUsage.groupBy({ by: ["payer", "billingPurpose"], where: { createdAt: { gte: since } }, _count: { _all: true, costMicros: true }, _sum: { costMicros: true } }),
    db.cosAiOperation.groupBy({ by: ["orgId"], where: { createdAt: { gte: since }, payer: "client_wallet" }, _sum: { chargedCredits: true }, _count: true }),
    db.cosAiOperation.groupBy({ by: ["orgId", "status"], where: { createdAt: { gte: day } }, _sum: { chargedCredits: true }, _count: true }),
  ]);
  const summaries = await Promise.all(wallets.map(async (w) => ({ w, s: await walletSummary(w.orgId), inv: await walletInvariant(w.orgId) })));
  const orgName = new Map(wallets.map((w) => [w.orgId, w.org.name]));
  // anomaly = last 24h is more than 3× the 30-day daily average (min 20 credits), or most of today's runs failed
  const anomalies: string[] = [];
  for (const o of ops30) {
    const today = ops24.filter((x) => x.orgId === o.orgId), spent = today.reduce((a, x) => a + (x._sum.chargedCredits ?? 0), 0), avg = (o._sum.chargedCredits ?? 0) / 30;
    const runs = today.reduce((a, x) => a + x._count, 0), failed = today.filter((x) => x.status === "failed" || x.status === "uncertain").reduce((a, x) => a + x._count, 0);
    if (spent >= 20 && spent > avg * 3) anomalies.push(`${orgName.get(o.orgId) ?? o.orgId}: ${spent} credits in 24 h against a 30-day average of ${avg.toFixed(1)}/day`);
    if (runs >= 4 && failed / runs > 0.5) anomalies.push(`${orgName.get(o.orgId) ?? o.orgId}: ${failed} of ${runs} runs failed in 24 h`);
  }
  const active = cards.find((c) => c.status === "active");
  // a PROPOSAL to review (GROWTHOS_AI_PRICING_PROPOSAL.md) — saving it only makes a draft; activation runs the margin check
  const template = JSON.stringify(PROPOSED_RATES, null, 1);
  // profitability: worst case per tool for the card that is live, or else the newest draft
  const checked = active ?? cards.find((c) => c.status === "draft");
  const credit = creditValueMicros(packs), floor = minMarginPct();
  const margins = checked ? marginReport(parseRates(checked.rates), providerPrices(), credit.micros) : [];
  const marginProblems = checked && !checked.synthetic ? profitabilityProblems(margins, floor) : [];
  // realised, last 30 days: what client runs earned (at the cheapest credit value) against what the provider billed for them
  const clientUsage = usage.filter((u) => u.payer === "client_wallet");
  const earnedCredits = ops30.reduce((a, o) => a + (o._sum.chargedCredits ?? 0), 0);
  const costKnown = clientUsage.every((u) => u._count.costMicros === u._count._all), costMicros = clientUsage.reduce((a, u) => a + (u._sum.costMicros ?? 0), 0);

  return (
    <div className="shell space-y-8 py-8 text-[13.5px] text-[var(--color-muted)]">
      <div><Link href="/admin/os" className="text-[12.5px] text-[var(--color-brand-soft)]">← CatalystGrowthOS</Link><h1 className="text-2xl font-extrabold text-white">AI credits</h1>
        <p>Separate from lead tokens and from engagement invoices. Prices and packs below are commercial decisions — nothing is pre-filled. Paid auto-recharge does not exist in this release.</p></div>

      {(!active || packs.filter((p) => p.active && !p.synthetic).length === 0 || !checkoutConfigured()) && <div className="card !p-4 text-amber-300">
        <b>Client purchases are closed.</b> Needed: {!active && "an active rate card · "}{active?.synthetic && "a NON-synthetic rate card (synthetic ones are refused in production) · "}{packs.filter((p) => p.active && !p.synthetic).length === 0 && "at least one real credit pack · "}{!checkoutConfigured() && "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET"}
      </div>}
      {summaries.some((x) => !x.inv.ok) && <div className="card !p-4 text-red-400"><b>Ledger invariant broken</b> for {summaries.filter((x) => !x.inv.ok).map((x) => x.w.org.name).join(", ")} — stop and investigate before any adjustment.</div>}
      {anomalies.length > 0 && <div className="card !p-4"><div className="font-bold text-white">Usage anomalies</div><ul className="ml-4 list-disc">{anomalies.map((a) => <li key={a}>{a}</li>)}</ul></div>}

      <section><h2 className="mb-2 text-lg font-bold text-white">Price floor check (model cost only)</h2>
        <p className="mb-2 text-amber-200/80">This is a guard against selling a run below what the AI provider charges for it. It is not a profit figure: it ignores included and promotional credits (which earn nothing at the point of use), failed runs, tax, refunds, hosting and staff time. See GROWTHOS_AI_PRICING_PROPOSAL.md §4.</p>
        <p className="mb-2">Worst case per tool: full prompt context, output at the longest limit, one repair retry — against the <b>least</b> a credit earns ({credit.micros === null ? credit.basis : `$${(credit.micros / 1_000_000).toFixed(4)} · ${credit.basis}`}). A real rate card cannot be activated below a {floor}% margin, or when the cost cannot be checked.</p>
        {marginProblems.length > 0 && <ul className="card mb-3 ml-0 list-disc !p-4 pl-8 text-amber-300">{marginProblems.map((m) => <li key={m}>{m}</li>)}</ul>}
        {checked && <table className="card block w-full overflow-x-auto !p-0"><caption className="px-3 py-2 text-left text-[12px]">Rate card v{checked.version} ({checked.status}{checked.synthetic ? ", synthetic" : ""})</caption><thead><tr><th className={th}>Tool</th><th className={th}>Highest quote (credits)</th><th className={th}>Provider cost, worst case</th><th className={th}>Earns, worst case</th><th className={th}>Headroom over model cost</th></tr></thead><tbody>
          {margins.map((m) => <tr key={m.tool} className="border-t border-[var(--color-line)]"><td className={td}>{m.tool}</td><td className={td}>{m.maxCredits}</td><td className={td}>{usd(m.worstCostMicros)}</td><td className={td}>{usd(m.revenueMicros)}</td><td className={`${td} ${m.marginPct !== null && m.marginPct < floor ? "text-red-400" : ""}`}>{m.marginPct === null ? "unknown" : `${m.marginPct}%`}</td></tr>)}
        </tbody></table>}
        <p className="mt-2">Realised, last 30 days (client-paid runs): {earnedCredits} credits charged{credit.micros !== null && <> ≈ {usd(earnedCredits * credit.micros)} at the cheapest credit value</>} · provider cost {costKnown && clientUsage.length ? usd(costMicros) : "unknown (set the provider prices)"}{costKnown && credit.micros !== null && earnedCredits > 0 && <> · margin <b>{(((earnedCredits * credit.micros - costMicros) / (earnedCredits * credit.micros)) * 100).toFixed(1)}%</b></>}. Catalyst-paid internal runs are a delivery cost and are listed below, not here.</p>
        <details className="mt-2"><summary className="cursor-pointer text-white">Proposed packs (not created — enter the ones you accept under “New pack”)</summary><ul className="ml-4 list-disc">{PROPOSED_PACKS.map((p) => <li key={`${p.market}${p.credits}`}>{p.market} · {p.label}: {p.credits} credits for {formatMinor(p.amountMinor, p.currency)} ({formatMinor(Math.round(p.amountMinor / p.credits), p.currency)} a credit)</li>)}</ul></details>
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">AI consumption, last 30 days — who paid</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Payer</th><th className={th}>Purpose</th><th className={th}>Provider calls</th><th className={th}>Provider cost (Catalyst&apos;s money)</th></tr></thead><tbody>
          {usage.length === 0 && <tr><td className={td} colSpan={4}>No AI calls recorded.</td></tr>}
          {usage.map((u) => <tr key={`${u.payer}:${u.billingPurpose}`} className="border-t border-[var(--color-line)]"><td className={td}>{u.payer === "client_wallet" ? "Client wallet" : "Catalyst"}</td><td className={td}>{u.billingPurpose.replace(/_/g, " ")}</td><td className={td}>{u._count._all}</td><td className={td}>{u._count.costMicros === u._count._all ? usd(u._sum.costMicros ?? 0) : `${usd(u._count.costMicros ? u._sum.costMicros : null)}${u._count.costMicros ? ` known for ${u._count.costMicros} of ${u._count._all} calls` : " — set LLM_PRICE_* to price calls"}`}</td></tr>)}
        </tbody></table>
        <p className="mt-1 text-[12px]">Provider cost is money Catalyst pays the AI vendor; client credits are a separate unit and are never derived from it after the fact.</p>
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">Held and unresolved</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Workspace</th><th className={th}>State</th><th className={th}>Tool</th><th className={th}>Held / max</th><th className={th}>Detail</th><th className={th}></th></tr></thead><tbody>
          {held.length + troubled.length === 0 && <tr><td className={td} colSpan={6}>Nothing held, nothing failed.</td></tr>}
          {held.filter((h) => !troubled.some((t) => t.id === h.operationId)).map((h) => <tr key={h.id} className="border-t border-[var(--color-line)]"><td className={td}>{orgName.get(h.orgId) ?? h.orgId}</td><td className={td}>{h.createdAt < staleAt ? <span className="text-amber-300">held &gt; {STALE_RUNNING_MIN} min</span> : "running"}</td><td className={td}>—</td><td className={td}>{h.amount}</td><td className={td}>since {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td className={td}></td></tr>)}
          {troubled.map((o) => <tr key={o.id} className="border-t border-[var(--color-line)] align-top"><td className={td}>{o.org.name}</td><td className={td}>{o.status === "uncertain" ? <span className="text-amber-300">uncertain — credits still held</span> : "failed (released)"}</td><td className={td}>{o.toolKey}</td><td className={td}>{o.maxCredits}</td><td className={td}>{o.error?.slice(0, 140)}</td><td className={td}>{o.status === "uncertain" && <AdminForm action={operationRelease} submit="Close without charge" hidden={{ id: o.id }}><input name="reason" required placeholder="What you checked" aria-label="Reason" className={input} /></AdminForm>}</td></tr>)}
        </tbody></table>
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">Payments and reconciliation</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Workspace</th><th className={th}>Order</th><th className={th}>Status</th><th className={th}>Refunded</th><th className={th}>Credits reversed</th><th className={th}>Mode</th></tr></thead><tbody>
          {orders.length === 0 && <tr><td className={td} colSpan={6}>No credit orders.</td></tr>}
          {orders.map((o) => <tr key={o.id} className="border-t border-[var(--color-line)]"><td className={td}>{o.org.name}</td><td className={td}>{o.credits} cr · {formatMinor(o.amountMinor, o.currency)}</td><td className={td}>{o.status}{o.disputeStatus ? ` · dispute ${o.disputeStatus}` : ""}{o.status === "pending" && o.createdAt < day ? " · stale" : ""}</td><td className={td}>{o.refundedMinor ? formatMinor(o.refundedMinor, o.currency) : "—"}</td><td className={td}>{o.reversedCredits || "—"}</td><td className={td}>{o.providerMode}</td></tr>)}
        </tbody></table>
        {unmatched.length > 0 && <div className="card mt-3 !p-4"><div className="font-bold text-white">Verified provider events nothing was applied to</div><ul className="ml-4 list-disc">{unmatched.map((e) => <li key={e.id}>{e.createdAt.toISOString().slice(0, 10)} · {e.type} — {e.note}</li>)}</ul></div>}
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">Wallets</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Workspace</th><th className={th}>Available</th><th className={th}>Held</th><th className={th}>Purchased</th><th className={th}>Included / promo</th><th className={th}>Deficit</th><th className={th}>Ledger check</th></tr></thead><tbody>
          {summaries.length === 0 && <tr><td className={td} colSpan={7}>No wallet has been used yet.</td></tr>}
          {summaries.map(({ w, s, inv }) => <tr key={w.orgId} className="border-t border-[var(--color-line)]"><td className={td}><Link className="text-[var(--color-brand-soft)]" href={`/admin/os/${w.orgId}`}>{w.org.name}</Link>{w.org.demo ? " · demo" : ""}</td><td className={td}>{s.available}</td><td className={td}>{s.reserved}</td><td className={td}>{s.byKind.purchased}</td><td className={td}>{s.byKind.included + s.byKind.promotional + s.byKind.adjustment}</td><td className={td}>{s.deficit || "—"}</td><td className={td}>{inv.ok ? "balanced" : <span className="text-red-400">BROKEN</span>}</td></tr>)}
        </tbody></table>
        <div className="mt-3 max-w-[640px]"><AdminForm action={walletGrant} submit="Record" title="Grant or adjust" hidden={{ ref: randomUUID() }}>
          <label className={label}>Workspace id<input name="orgId" required className={input} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Type<select name="kind" className={input}><option value="included" className="text-black">Included (part of the engagement)</option><option value="promotional" className="text-black">Promotional</option><option value="adjustment" className="text-black">Adjustment (may be negative)</option></select></label>
            <label className={label}>Credits<input name="amount" required inputMode="numeric" className={input} /></label>
            <label className={label}>Expires on (included / promotional)<input name="expiresAt" type="date" className={input} /></label>
            <label className="flex items-center gap-2 pt-5 text-[12.5px]"><input type="checkbox" name="noExpiry" /> does not expire</label>
          </div>
          <label className={label}>Reason (shown in the client&apos;s transactions)<input name="reason" required maxLength={300} className={input} /></label>
        </AdminForm></div>
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">Rate cards</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Version</th><th className={th}>Status</th><th className={th}>Note</th><th className={th}>Tools priced</th><th className={th}></th></tr></thead><tbody>
          {cards.length === 0 && <tr><td className={td} colSpan={5}>No rate card. Until one is active, clients see “pricing not configured” and nothing can be charged.</td></tr>}
          {cards.map((c) => <tr key={c.id} className="border-t border-[var(--color-line)]"><td className={td}>v{c.version}{c.synthetic ? " · SYNTHETIC (test values)" : ""}</td><td className={td}>{c.status}</td><td className={td}>{c.note}</td><td className={td}>{Object.keys(JSON.parse(c.rates) as object).length} / {TOOLS.length}</td><td className={td}>{c.status === "draft" && <AdminForm action={rateCardActivate} submit="Activate" hidden={{ id: c.id }} confirm="New quotes will use these prices immediately. Continue?" />}</td></tr>)}
        </tbody></table>
        <div className="mt-3 max-w-[640px]"><AdminForm action={rateCardCreate} submit="Save draft" title="New rate card (draft)">
          <label className={label}>Rates — credits per run (`base`) plus credits per 1,000 output tokens. Pre-filled with the reviewed proposal; remove a tool to leave it unavailable. Activation is refused below the margin floor.<textarea name="rates" rows={10} defaultValue={template} className={`${input} font-mono text-[12px]`} /></label>
          <label className={label}>Note<input name="note" maxLength={300} className={input} /></label>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="synthetic" /> Synthetic test values (never usable in production)</label>
        </AdminForm></div>
      </section>

      <section><h2 className="mb-2 text-lg font-bold text-white">Credit packs</h2>
        <table className="card block w-full overflow-x-auto !p-0"><thead><tr><th className={th}>Pack</th><th className={th}>Credits</th><th className={th}>Price</th><th className={th}>Market</th><th className={th}>State</th><th className={th}></th></tr></thead><tbody>
          {packs.length === 0 && <tr><td className={td} colSpan={6}>No packs. Clients cannot buy credits until one is published.</td></tr>}
          {packs.map((p) => <tr key={p.id} className="border-t border-[var(--color-line)]"><td className={td}>{p.label}{p.synthetic ? " · SYNTHETIC" : ""}</td><td className={td}>{p.credits}</td><td className={td}>{formatMinor(p.amountMinor, p.currency)}</td><td className={td}>{p.market ?? "any"}</td><td className={td}>{p.active ? "on sale" : "retired"}</td><td className={td}>{p.active && <AdminForm action={packRetire} submit="Retire" hidden={{ id: p.id }} />}</td></tr>)}
        </tbody></table>
        <div className="mt-3 max-w-[640px]"><AdminForm action={packCreate} submit="Publish pack" title="New pack">
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Label<input name="label" required className={input} /></label>
            <label className={label}>Credits<input name="credits" required inputMode="numeric" className={input} /></label>
            <label className={label}>Currency (ISO)<input name="currency" required maxLength={3} className={input} /></label>
            <label className={label}>Price in MINOR units (paise / cents)<input name="amountMinor" required inputMode="numeric" className={input} /></label>
            <label className={label}>Market (IN, US or blank)<input name="market" maxLength={2} className={input} /></label>
            <label className="flex items-center gap-2 pt-5 text-[12.5px]"><input type="checkbox" name="synthetic" /> Synthetic test pack</label>
          </div>
        </AdminForm></div>
      </section>
    </div>
  );
}
