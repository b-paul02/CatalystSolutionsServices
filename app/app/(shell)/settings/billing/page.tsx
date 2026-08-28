import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { tokenBalance } from "@/lib/leados/tokens";
import { Badge, Card } from "@/components/leados/ui";

export const metadata = { title: "Tokens & billing" };

export default async function BillingPage() {
  const actor = await requireOrg("org.billing");
  const [balance, ledger, org] = await Promise.all([
    tokenBalance(actor.orgId),
    db.losTokenLedger.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.losOrg.findUnique({ where: { id: actor.orgId }, select: { market: true } }),
  ]);
  // 30-day burn rate for the "runs out in" estimate.
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const burn = ledger.filter((l) => l.delta < 0 && l.createdAt > cutoff).reduce((s, l) => s - l.delta, 0);
  const daysLeft = burn > 0 ? Math.floor(balance / (burn / 30)) : null;

  return (
    <div className="space-y-6">
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
      <Card className="p-4 text-[13.5px] text-[var(--los-muted)]">
        Tokens pay for lead deliveries — each delivered lead costs tokens based on lead type, industry, exclusivity, and verification.
        Top-ups are handled by the Catalyst team{org?.market === "IN" ? " (billed in ₹)" : " (billed in $)"}; self-serve purchase is coming soon.
      </Card>
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
