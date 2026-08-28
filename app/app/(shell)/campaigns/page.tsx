import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import { Badge, Card } from "@/components/leados/ui";
import NewCampaignButton from "./NewCampaignButton";

export const metadata = { title: "Campaigns" };

const TONE: Record<string, "neutral" | "brand" | "success" | "warn" | "danger"> = {
  draft: "neutral", in_review: "warn", approved: "brand", active: "success",
  paused: "warn", completed: "neutral", rejected: "danger",
};

export default async function CampaignsPage() {
  const actor = await requireOrg("campaigns.view");
  const campaigns = await db.losCampaign.findMany({
    where: { orgId: actor.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight">Campaigns</h1>
        {can(actor.role, "campaigns.manage") && <NewCampaignButton />}
      </div>
      {campaigns.length === 0 ? (
        <Card className="p-10 text-center text-[14px] text-[var(--los-muted)]">
          No campaigns yet. Create one to start generating your own B2C leads —
          hosted landing pages, WhatsApp links, QR codes, and ad integrations.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/app/campaigns/${c.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-[var(--los-brand)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-bold">{c.name}</span>
                  <Badge tone={TONE[c.status] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="text-[12.5px] text-[var(--los-muted)]">
                  {c.type.replace(/_/g, " ")} · {c.objective.replace(/_/g, " ")}
                </div>
                <div className="mt-3 text-[13px]">
                  <span className="text-[22px] font-extrabold">{c._count.submissions}</span>
                  <span className="ml-1 text-[var(--los-faint)]">submissions</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
