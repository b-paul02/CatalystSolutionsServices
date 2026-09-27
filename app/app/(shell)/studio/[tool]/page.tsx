import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { isStaffRole } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { activeRateCard, priceMax } from "@/lib/os/credits";
import { RESEARCH_KEY, researchMode, toolAvailability, toolByKey } from "@/lib/os/studio";
import { Card } from "@/components/leados/ui";
import { PageHeader } from "@/components/os/bits";
import StudioForm from "@/components/os/StudioForm";

export default async function StudioToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const actor = await requireOrgPage("ai.use");
  const tool = toolByKey((await params).tool);
  if (!tool) notFound();
  const staff = isStaffRole(actor.role);
  const [ent, card, campaigns, auth, sources] = await Promise.all([
    entitlements(actor.orgId), activeRateCard(),
    db.cosCampaign.findMany({ where: { orgId: actor.orgId, status: { not: "archived" } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    staff ? db.cosAiBillingAuth.findFirst({ where: { orgId: actor.orgId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }) : null,
    tool.kind === "text" || tool.kind === "calendar" ? db.cosSource.findMany({ where: { orgId: actor.orgId, archivedAt: null }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
  ]);
  const rate = card?.rates[tool.key];
  // direct URL to a tool that is not available: back to the catalogue, which says why — never an error page
  if (!toolAvailability(tool, ent, { staffInternal: staff, priced: Boolean(rate) }).ok) redirect("/app/studio");
  return (
    <div className="max-w-[760px]">
      <PageHeader title={tool.label} sub={tool.purpose}><Link href="/app/studio" className="text-[13px] font-semibold text-[var(--los-brand)] hover:underline">All tools</Link></PageHeader>
      <Card className="p-5">
        <p className="mb-4 text-[12.5px] text-[var(--los-muted)]"><b>{researchMode().label}.</b> {researchMode().note}</p>
        {tool.handoff && <p className="mb-4 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px]"><b>What you get:</b> {tool.handoff}</p>}
        {rate && !staff && <p className="mb-4 text-[12.5px] text-[var(--los-muted)]">Typical maximum: {priceMax(rate, tool.limits.short)}–{priceMax(rate, tool.limits.long)} credits depending on the output limit. You will see the exact maximum before it runs.</p>}
        <StudioForm toolKey={tool.key} fields={tool.fields} campaigns={ent.modules.has("content") ? campaigns : []} sources={sources} research={tool.research && researchMode().available && (staff || card?.rates[RESEARCH_KEY]) ? { credits: staff ? 0 : card!.rates[RESEARCH_KEY].base } : null} staffBilling={staff ? { clientAuthorised: Boolean(auth) } : null} />
      </Card>
    </div>
  );
}
