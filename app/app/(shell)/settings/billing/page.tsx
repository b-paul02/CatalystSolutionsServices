import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { tokenBalance } from "@/lib/leados/tokens";
import { currentPackage, PACKAGES, settleCheckoutSession, syncSubscription, TOKEN_PACKS } from "@/lib/leados/billing";
import { Badge, Card } from "@/components/leados/ui";
import { PackageGrid, TokenPackGrid } from "./BuyButtons";

export const metadata = { title: "Tokens & billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const actor = await requireOrg("org.billing");
  const { session_id } = await searchParams;

  // Returning from Stripe checkout: settle idempotently before rendering.
  let settleMessage: { ok: boolean; message: string } | null = null;
  if (session_id) {
    try {
      settleMessage = await settleCheckoutSession(actor.orgId, session_id);
    } catch (e) {
      settleMessage = { ok: false, message: e instanceof Error ? e.message : "Couldn't verify the payment." };
    }
  }
  await syncSubscription(actor.orgId);

  const [balance, ledger, org, pkg] = await Promise.all([
    tokenBalance(actor.orgId),
    db.losTokenLedger.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true } }),
    currentPackage(actor.orgId),
  ]);
  const market = org?.market === "US" ? "US" : "IN";
  const currency = market === "US" ? "$" : "₹";
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const burn = ledger.filter((l) => l.delta < 0 && l.createdAt > cutoff).reduce((s, l) => s - l.delta, 0);
  const daysLeft = burn > 0 ? Math.floor(balance / (burn / 30)) : null;

  return (
    <div className="space-y-6">
      {settleMessage && (
        <div className={`rounded-lg px-4 py-2.5 text-[13.5px] ${settleMessage.ok ? "bg-[var(--los-success-soft)] text-[var(--los-success)]" : "bg-[var(--los-danger-soft)] text-[var(--los-danger)]"}`}>
          {settleMessage.message}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-[var(--los-muted)]">Token balance</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight">{balance.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-[var(--los-muted)]">Used (last 30 days)</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight">{burn.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-[var(--los-muted)]">Runs out in</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight">{daysLeft === null ? "—" : `~${daysLeft}d`}</div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-[16px] font-bold">Buy tokens</h2>
        <TokenPackGrid packs={TOKEN_PACKS[market]} currency={currency} />
        <p className="mt-2 text-[12.5px] text-[var(--los-faint)]">
          Tokens pay for lead deliveries and B2B reveals — priced by lead type, industry, exclusivity, and verification. Purchased tokens never expire.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-[16px] font-bold">Your plan</h2>
        <PackageGrid
          current={pkg}
          currency={currency}
          packages={PACKAGES.map((p) => ({ id: p.id, label: p.label, monthly: p.monthlyMinor ? p.monthlyMinor[market] : null, blurb: p.blurb, selfServe: p.selfServe }))}
        />
      </div>

      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Ledger</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {ledger.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]">
              <div>
                <span className={l.delta > 0 ? "font-semibold text-[var(--los-success)]" : "font-semibold text-[var(--los-danger)]"}>
                  {l.delta > 0 ? "+" : ""}{l.delta.toLocaleString()}
                </span>
                <span className="ml-2 text-[var(--los-muted)]">{l.note ?? l.kind.replace(/_/g, " ")}</span>
              </div>
              <div className="flex items-center gap-2 text-[12.5px] text-[var(--los-faint)]">
                <Badge>{l.kind.replace(/_/g, " ")}</Badge>
                {l.createdAt.toISOString().slice(0, 10)}
              </div>
            </li>
          ))}
          {ledger.length === 0 && <li className="px-5 py-8 text-center text-[var(--los-faint)]">No token activity yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
