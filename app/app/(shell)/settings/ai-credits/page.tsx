import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { walletSummary } from "@/lib/os/credits";
import { availablePacks, checkoutConfigured, orderStatus } from "@/lib/os/creditPurchase";
import { toolByKey, usageBreakdown } from "@/lib/os/studio";
import { formatInZone, periodBounds } from "@/lib/os/time";
import { formatMinor } from "@/lib/os/commercial";
import { Card } from "@/components/leados/ui";
import { field, StateBadge } from "@/components/os/bits";
import { Figure, Notice } from "@/components/os/v2";
import ActionForm from "@/components/os/ActionForm";
import { AutoRefresh } from "@/components/os/StudioForm";
import { creditsBuy, creditsMemberLimit, creditsSettings, creditsStaffAuth } from "../../_os/studio";

export const metadata = { title: "AI credits" };

const LEDGER_LABEL: Record<string, string> = { grant: "Credits added", debit: "AI run", expire: "Expired", reversal: "Refund / dispute", adjustment: "Adjustment by Catalyst" };

// AI credits are their own thing: NOT lead tokens (Settings → Tokens & billing), not part of an engagement invoice,
// and buying them adds no tools or services. This page READS payment status — it never grants anything.
export default async function AiCreditsPage({ searchParams }: { searchParams: Promise<{ order?: string; cancelled?: string }> }) {
  const actor = await requireOrgPage("ai.use", "org.billing");
  const sp = await searchParams;
  const staff = isStaffRole(actor.role), billing = can(actor.role, "org.billing") && !staff, team = can(actor.role, "team.manage");
  const ent = await entitlements(actor.orgId);
  const month = periodBounds("month", ent.timezone);
  const lowEmail = (await db.cosCreditWallet.findUnique({ where: { orgId: actor.orgId }, select: { lowBalanceEmail: true } }))?.lowBalanceEmail ?? true;
  const [wallet, org, returned, orders, ledger, usage, members, limits, auths, myOps] = await Promise.all([
    walletSummary(actor.orgId),
    db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true } }),
    sp.order ? orderStatus(actor.orgId, sp.order) : null,
    billing ? db.cosCreditOrder.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    billing ? db.cosCreditLedger.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 60 }) : [],
    billing ? usageBreakdown(actor.orgId, month) : [],
    billing || team ? db.losMembership.findMany({ where: { orgId: actor.orgId }, include: { user: { select: { id: true, name: true, email: true } } } }) : [],
    db.cosCreditMemberLimit.findMany({ where: { orgId: actor.orgId } }),
    billing ? db.cosAiBillingAuth.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
    db.cosAiOperation.findMany({ where: { orgId: actor.orgId, userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const packs = billing ? await availablePacks(org?.market === "US" ? "US" : "IN") : [];
  const name = (id: string | null) => { const m = members.find((x) => x.userId === id); return m ? m.user.name ?? m.user.email : "A member"; };
  const myCap = limits.find((l) => l.userId === actor.userId);
  const byTool = new Map<string, number>(), byMember = new Map<string, number>();
  for (const u of usage.filter((x) => x.payer === "client_wallet")) { byTool.set(u.toolKey, (byTool.get(u.toolKey) ?? 0) + u.credits); byMember.set(u.userId, (byMember.get(u.userId) ?? 0) + u.credits); }

  return (
    <div className="space-y-6">
      {returned?.status === "pending" && <AutoRefresh everyMs={4000} />}
      {returned && <div role="status" className="rounded-lg bg-[var(--los-surface-2)] px-4 py-2.5 text-[13.5px]">
        {returned.status === "pending" && <>Payment is being confirmed by the card provider. Credits appear here as soon as it is — you can close this page.</>}
        {returned.status === "paid" && <><b>Payment confirmed.</b> {returned.credits} credits were added.</>}
        {["failed", "expired"].includes(returned.status) && <><b>The payment did not go through.</b> You have not been charged and no credits were added.</>}
        {["refunded", "part_refunded", "disputed"].includes(returned.status) && <>This purchase is {returned.status.replace("_", " ")}.</>}
      </div>}
      {sp.cancelled && <div role="status" className="rounded-lg bg-[var(--los-surface-2)] px-4 py-2.5 text-[13.5px]">Checkout was cancelled. You have not been charged.</div>}
      {wallet.restricted && <Notice kind="blocked" title="AI tools are paused">A credit purchase was refunded or disputed after {wallet.deficit} of its credits had been used. Nothing is charged automatically; new credits cover that first. Your content, reports and assets are unaffected.</Notice>}
      {wallet.low && !wallet.restricted && <Notice kind="setup" title="Credits are running low">You have {wallet.available} left. Manual editing, approvals and reports never need credits.</Notice>}

      <section aria-labelledby="bal">
        <h2 id="bal" className="mb-2 text-[15px] font-bold">Balance</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Figure label="Available" value={wallet.available} unit="credits" />
          <Figure label="Held by running AI" value={wallet.reserved} unit="credits" note="Returned if not used" />
          <Figure label="Purchased" value={wallet.byKind.purchased} unit="credits" note="Do not expire" />
          <Figure label="Included / promotional" value={wallet.byKind.included + wallet.byKind.promotional + wallet.byKind.adjustment} unit="credits" />
        </div>
        {wallet.expiring.length > 0 && <ul className="mt-2 text-[12.5px] text-[var(--los-muted)]">{wallet.expiring.map((g, i) => <li key={i}>{g.remaining} {g.kind} credits expire {formatInZone(g.expiresAt, ent.timezone, { dateStyle: "medium" })}. Expiring credits are used first.</li>)}</ul>}
        {myCap && <p className="mt-2 text-[12.5px] text-[var(--los-muted)]">Your personal limit is {myCap.monthlyCredits} credits a month (shared wallet — a limit does not add credits).</p>}
        <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">AI credits are separate from lead tokens and from your engagement invoices. Buying credits does not add tools or services, and automatic top-up is off.</p>
      </section>

      {billing && <section aria-labelledby="buy">
        <h2 id="buy" className="mb-2 text-[15px] font-bold">Add credits</h2>
        {!checkoutConfigured() || packs.length === 0
          ? <Notice kind="setup" title="Card purchases are not open yet">{packs.length === 0 ? "No credit packs have been published." : "Card payments are not set up."} Ask your account lead to add credits to this workspace.</Notice>
          : <ul className="grid gap-3 sm:grid-cols-3">{packs.map((p) => <li key={p.id}><Card className="p-4"><div className="text-[18px] font-extrabold">{p.credits} credits</div><div className="mb-3 text-[13px] text-[var(--los-muted)]">{formatMinor(p.amountMinor, p.currency)}{p.synthetic && " · TEST PACK"}</div><ActionForm action={creditsBuy} submit="Buy" hidden={{ packId: p.id }} /></Card></li>)}</ul>}
      </section>}

      {billing && orders.length > 0 && <Card><div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Purchases</div><ul className="divide-y divide-[var(--los-line)]">{orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px]"><span>{o.credits} credits · {formatMinor(o.amountMinor, o.currency)}</span><span className="flex items-center gap-2 text-[12px] text-[var(--los-faint)]"><StateBadge state={o.status} />{formatInZone(o.createdAt, ent.timezone)}</span></li>)}</ul></Card>}

      {billing && <section aria-labelledby="use"><h2 id="use" className="mb-2 text-[15px] font-bold">Usage this month ({month.label})</h2>
        {byTool.size === 0 ? <p className="text-[13px] text-[var(--los-muted)]">No credits used yet this month.</p> : <div className="grid gap-4 sm:grid-cols-2">
          <table className="w-full text-[13px]"><caption className="mb-1 text-left text-[12px] font-bold uppercase text-[var(--los-faint)]">By tool</caption><tbody>{[...byTool].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><th scope="row" className="py-0.5 text-left font-normal">{toolByKey(k)?.label ?? k}</th><td className="text-right font-semibold">{v}</td></tr>)}</tbody></table>
          <table className="w-full text-[13px]"><caption className="mb-1 text-left text-[12px] font-bold uppercase text-[var(--los-faint)]">By member</caption><tbody>{[...byMember].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><th scope="row" className="py-0.5 text-left font-normal">{name(k)}{members.find((m) => m.userId === k && isStaffRole(m.role)) ? " (Catalyst, authorised by you)" : ""}</th><td className="text-right font-semibold">{v}</td></tr>)}</tbody></table>
        </div>}
      </section>}

      <Card><div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Your AI runs</div>
        {myOps.length === 0 ? <Notice title="No runs yet" href="/app/studio" action="Open AI Studio" /> : <ul className="divide-y divide-[var(--los-line)]">{myOps.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px]"><Link className="min-w-0 truncate font-medium text-[var(--los-brand)] hover:underline" href={`/app/studio/history/${o.id}`}>{toolByKey(o.toolKey)?.label ?? o.toolKey}</Link><span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--los-faint)]"><StateBadge state={o.status} />{o.payer === "client_wallet" ? `${o.chargedCredits} credits` : "Catalyst paid"} · {formatInZone(o.createdAt, ent.timezone)}</span></li>)}</ul>}
      </Card>

      {billing && <Card><div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Transactions</div>
        {ledger.length === 0 ? <Notice title="No transactions yet" /> : <table className="w-full text-[13px]"><thead className="text-left text-[12px] text-[var(--los-faint)]"><tr><th className="px-5 py-2">When</th><th>What</th><th className="px-5 text-right">Credits</th></tr></thead><tbody className="divide-y divide-[var(--los-line)]">{ledger.map((l) => <tr key={l.id}><td className="px-5 py-1.5 whitespace-nowrap">{formatInZone(l.createdAt, ent.timezone)}</td><td>{LEDGER_LABEL[l.kind] ?? l.kind} — {l.operationId ? <Link className="text-[var(--los-brand)] underline" href={`/app/studio/history/${l.operationId}`}>{l.reason}</Link> : l.reason}</td><td className={`px-5 text-right font-semibold ${l.delta < 0 ? "" : "text-[var(--los-success)]"}`}>{l.delta > 0 ? "+" : ""}{l.delta}</td></tr>)}</tbody></table>}
      </Card>}

      {billing && <section aria-labelledby="set"><h2 id="set" className="mb-2 text-[15px] font-bold">Low-balance notice</h2>
        <ActionForm action={creditsSettings} submit="Save" className="flex items-end gap-2"><div><label htmlFor="low" className="mb-1 block text-[13px] font-semibold">Tell us when credits fall to</label><input id="low" name="lowBalanceAt" inputMode="numeric" defaultValue={wallet.lowBalanceAt ?? ""} placeholder="no notice" className={field} /></div><label className="flex items-center gap-1.5 pb-2 text-[13px]"><input type="checkbox" name="lowBalanceEmail" defaultChecked={lowEmail} />Also email the people who manage billing here</label></ActionForm>
      </section>}

      {team && !staff && <section aria-labelledby="caps"><h2 id="caps" className="mb-1 text-[15px] font-bold">Member limits</h2>
        <p className="mb-2 text-[12.5px] text-[var(--los-muted)]">Optional monthly ceiling per person on the shared wallet. Blank means no personal limit. Only members whose role includes AI tools can run them.</p>
        <ul className="space-y-2">{members.filter((m) => can(m.role, "ai.use") && !isStaffRole(m.role)).map((m) => <li key={m.userId}><ActionForm action={creditsMemberLimit} submit="Save" tone="ghost" hidden={{ userId: m.userId }} className="flex items-end gap-2"><div className="min-w-0 flex-1"><label htmlFor={`cap-${m.userId}`} className="mb-1 block truncate text-[13px] font-semibold">{m.user.name ?? m.user.email} <span className="font-normal text-[var(--los-faint)]">· {m.role.replace("_", " ")}</span></label><input id={`cap-${m.userId}`} name="monthlyCredits" inputMode="numeric" defaultValue={limits.find((l) => l.userId === m.userId)?.monthlyCredits ?? ""} placeholder="no limit" className={field} /></div></ActionForm></li>)}</ul>
      </section>}

      {billing && <section aria-labelledby="auth"><h2 id="auth" className="mb-1 text-[15px] font-bold">Catalyst staff using your credits</h2>
        <p className="mb-2 text-[12.5px] text-[var(--los-muted)]">By default, AI that Catalyst uses to deliver your engagement is paid for by Catalyst and never touches this wallet. If you want our team to run AI Studio tools <em>on your credits</em> (for example extra drafts outside the engagement), authorise a ceiling here. You can end it at any time.</p>
        {auths.filter((a) => !a.revokedAt && a.expiresAt > new Date()).map((a) => <div key={a.id} className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--los-line)] px-3 py-2 text-[13px]"><span>Up to {a.maxCredits} credits ({a.usedCredits} used) until {formatInZone(a.expiresAt, ent.timezone, { dateStyle: "medium" })} — {a.note}</span><ActionForm action={creditsStaffAuth} submit="End now" tone="danger" hidden={{ revokeId: a.id }} /></div>)}
        <ActionForm action={creditsStaffAuth} submit="Authorise" tone="ghost" className="grid gap-2 sm:grid-cols-3">
          <div><label htmlFor="a-max" className="mb-1 block text-[13px] font-semibold">Most credits</label><input id="a-max" name="maxCredits" inputMode="numeric" required className={field} /></div>
          <div><label htmlFor="a-exp" className="mb-1 block text-[13px] font-semibold">Until</label><input id="a-exp" name="expiresAt" type="date" required className={field} /></div>
          <div><label htmlFor="a-note" className="mb-1 block text-[13px] font-semibold">What for</label><input id="a-note" name="note" maxLength={300} required className={field} /></div>
        </ActionForm>
      </section>}
    </div>
  );
}
