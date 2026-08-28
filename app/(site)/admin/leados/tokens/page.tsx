import { requirePlatform } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import TokenAdmin from "./TokenAdmin";

export const metadata = { title: "Tokens" };

export default async function TokensPage() {
  await requirePlatform("super_admin", "auditor");
  const [orgs, balances, rates, recent] = await Promise.all([
    db.losOrg.findMany({ where: { status: "active" }, select: { id: true, name: true, market: true }, orderBy: { name: "asc" } }),
    db.losTokenLedger.groupBy({ by: ["orgId"], _sum: { delta: true } }),
    db.losTokenRate.findMany({ orderBy: { effectiveFrom: "desc" }, take: 30 }),
    db.losTokenLedger.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const balance = (orgId: string) => balances.find((b) => b.orgId === orgId)?._sum.delta ?? 0;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);
  return (
    <TokenAdmin
      orgs={orgs.map((o) => ({ ...o, balance: balance(o.id) }))}
      rates={rates.map((r) => ({
        id: r.id, leadType: r.leadType, industry: r.industry,
        exclusiveTokens: r.exclusiveTokens, sharedTokens: r.sharedTokens,
        verifiedBonusPct: r.verifiedBonusPct, effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      }))}
      ledger={recent.map((l) => ({
        id: l.id, orgName: orgName(l.orgId), delta: l.delta, kind: l.kind,
        note: l.note, at: l.createdAt.toISOString().slice(0, 16).replace("T", " "),
      }))}
    />
  );
}
