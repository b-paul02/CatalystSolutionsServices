import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { canSeeAllUsage } from "@/lib/os/studio";
import { entitlements } from "@/lib/os/entitlements";
import { Card } from "@/components/leados/ui";
import { PageHeader } from "@/components/os/bits";

export const metadata = { title: "AI usage" };

const usd = (micros: number | null) => (micros === null ? "unknown" : `$${(micros / 1_000_000).toFixed(4)}`);

// WP-04 · Studio "Usage" tab: calls, tokens and provider cost per feature and model for one month. Cost is a real
// total only when every call in the group was priced; one unpriced call makes the group "unknown" — never zero.
export default async function StudioUsagePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireOrgPage("ai.use", "org.billing");
  const sp = await searchParams;
  const ent = await entitlements(actor.orgId);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).toISOString().slice(0, 7), next = end.toISOString().slice(0, 7);
  const all = canSeeAllUsage(actor.role);
  const rows = await db.cosAiUsage.groupBy({ by: ["feature", "model", "payer"], where: { orgId: actor.orgId, createdAt: { gte: start, lt: end }, ...(all ? {} : { userId: actor.userId }), ...(ent.demo ? {} : { demo: false }) }, _count: { _all: true, costMicros: true }, _sum: { inputTokens: true, outputTokens: true, costMicros: true }, orderBy: { feature: "asc" } });
  const cost = (r: (typeof rows)[number]) => (r._count._all > 0 && r._count.costMicros === r._count._all ? r._sum.costMicros ?? 0 : null);
  const total = rows.every((r) => cost(r) !== null) ? rows.reduce((a, r) => a + (cost(r) ?? 0), 0) : null;
  return (
    <div className="max-w-[900px]">
      <PageHeader title="AI usage" sub={`${month}${all ? " · whole workspace" : " · your runs"}`}>
        <div className="flex gap-1 text-[13px]"><Link href={`/app/studio/usage?month=${prev}`} className="rounded-lg border border-[var(--los-line)] px-3 py-1.5">← {prev}</Link><Link href={`/app/studio/usage?month=${next}`} className="rounded-lg border border-[var(--los-line)] px-3 py-1.5">{next} →</Link><Link href="/app/studio" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5">Studio</Link></div>
      </PageHeader>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead><tr className="border-b border-[var(--los-line)] text-[12px] text-[var(--los-muted)]"><th className="px-4 py-2">Feature</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Paid by</th><th className="px-3 py-2">Calls</th><th className="px-3 py-2">Tokens in / out</th><th className="px-3 py-2">Provider cost</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.feature}${r.model}${r.payer}`} className="border-b border-[var(--los-line)]">
                <td className="px-4 py-2 font-medium">{r.feature}</td><td className="px-3 py-2">{r.model}</td><td className="px-3 py-2">{r.payer === "client_wallet" ? "your credits" : "Catalyst"}</td>
                <td className="px-3 py-2">{r._count._all}</td><td className="px-3 py-2">{r._sum.inputTokens?.toLocaleString("en") ?? "—"} / {r._sum.outputTokens?.toLocaleString("en") ?? "—"}</td><td className="px-3 py-2">{usd(cost(r))}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-[var(--los-faint)]" colSpan={6}>No AI usage in {month}.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="text-[12.5px] font-semibold"><td className="px-4 py-2" colSpan={5}>Total provider cost</td><td className="px-3 py-2">{usd(total)}</td></tr></tfoot>}
        </table>
        <p className="px-4 py-2 text-[12px] text-[var(--los-faint)]">“unknown” means at least one call in that row ran on a model without a configured price. Credits charged to your wallet are on <Link className="underline" href="/app/settings/ai-credits">AI credits</Link>; this page is what the provider billed, which is not the same thing.</p>
      </Card>
    </div>
  );
}
