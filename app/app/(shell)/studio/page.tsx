import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { isStaffRole } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { activeRateCard, walletSummary } from "@/lib/os/credits";
import { canSeeAllUsage, researchMode, toolAvailability, toolByKey, TOOLS } from "@/lib/os/studio";
import { formatInZone } from "@/lib/os/time";
import { Card } from "@/components/leados/ui";
import { PageHeader, StateBadge } from "@/components/os/bits";
import { Notice } from "@/components/os/v2";

export const metadata = { title: "AI Studio" };

export default async function StudioPage() {
  const actor = await requireOrgPage("ai.use");
  const staff = isStaffRole(actor.role);
  const [ent, card, wallet, recent] = await Promise.all([
    entitlements(actor.orgId), activeRateCard(), walletSummary(actor.orgId),
    db.cosAiOperation.findMany({ where: { orgId: actor.orgId, ...(canSeeAllUsage(actor.role) ? {} : { userId: actor.userId }) }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const groups = [...new Set(TOOLS.map((t) => t.group))];
  return (
    <div className="max-w-[1100px]">
      <PageHeader title="AI Studio" sub="Draft with AI yourself. Every result is a draft: it goes through review and your approval before anything is published.">
        {!staff && <Link href="/app/settings/ai-credits" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold">{wallet.available} credits{wallet.reserved ? ` · ${wallet.reserved} held` : ""}</Link>}
      </PageHeader>
      {wallet.restricted && !staff && <Notice kind="blocked" title="AI tools are paused on this workspace" href="/app/settings/ai-credits" action="See why">A refunded or disputed credit purchase is being settled. Your content, reports and assets are unaffected, and you can keep editing by hand.</Notice>}
      <p className="mb-4 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px] text-[var(--los-muted)]"><b>{researchMode().label}.</b> {researchMode().note}</p>
      {groups.map((g) => (
        <section key={g} className="mb-6" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[var(--los-faint)]">{g}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.filter((t) => t.group === g).map((t) => {
              const a = toolAvailability(t, ent, { staffInternal: staff, priced: Boolean(card?.rates[t.key]) });
              const body = <><span className="block text-[14.5px] font-bold">{t.label}</span><span className="mt-1 block text-[12.5px] text-[var(--los-muted)]">{t.purpose}</span>{!a.ok && <span className="mt-2 block text-[12px] font-semibold text-[var(--los-faint)]">Unavailable — {a.reason}</span>}</>;
              return <li key={t.key}>{a.ok ? <Link href={`/app/studio/${t.key}`} className="block h-full rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-4 hover:border-[var(--los-brand)] focus-visible:outline focus-visible:outline-2">{body}</Link> : <div aria-disabled className="h-full rounded-xl border border-dashed border-[var(--los-line)] p-4 opacity-70">{body}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">{canSeeAllUsage(actor.role) ? "Recent runs in this workspace" : "Your recent runs"}</div>
        {recent.length === 0 ? <Notice title="Nothing yet">Pick a tool above. You will see a price before anything runs.</Notice> : (
          <ul className="divide-y divide-[var(--los-line)]">
            {recent.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2 text-[13px]">
              <Link href={`/app/studio/history/${o.id}`} className="min-w-0 truncate font-medium text-[var(--los-brand)] hover:underline">{toolByKey(o.toolKey)?.label ?? o.toolKey}</Link>
              <span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--los-faint)]"><StateBadge state={o.status} />{o.payer === "client_wallet" ? `${o.chargedCredits} credits` : "Catalyst"} · {formatInZone(o.createdAt, ent.timezone)}</span>
            </li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
