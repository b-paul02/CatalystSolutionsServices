import Link from "next/link";
import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { tokenBalance } from "@/lib/leados/tokens";
import { Badge, Card } from "@/components/leados/ui";
import ReplacementButton from "./ReplacementButton";

export const metadata = { title: "Deliveries" };

export default async function DeliveriesPage() {
  const actor = await requireOrg("leads.view");
  const [plans, allocations, balance] = await Promise.all([
    db.losLeadPlan.findMany({
      where: { orgId: actor.orgId, status: { in: ["active", "paused"] } },
      include: { runs: { orderBy: { runDate: "desc" }, take: 14 } },
      orderBy: { createdAt: "desc" },
    }),
    db.losAllocation.findMany({
      where: { orgId: actor.orgId },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { plan: { select: { name: true } } },
    }),
    tokenBalance(actor.orgId),
  ]);
  const leadIds = allocations.map((a) => a.leadId).filter(Boolean) as string[];
  const leads = await db.losLead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true },
  });
  const leadOf = (id: string | null) => leads.find((l) => l.id === id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight">Deliveries</h1>
        <Badge tone="brand">{balance.toLocaleString()} tokens</Badge>
      </div>

      {plans.length === 0 ? (
        <Card className="p-8 text-center text-[14px] text-[var(--los-muted)]">
          No lead plan yet. Managed lead delivery is set up by the Catalyst team —
          contact us to configure your daily quota.
        </Card>
      ) : (
        <div className="mb-6 space-y-4">
          {plans.map((p) => {
            const delivered = p.runs.reduce((s, r) => s + r.allocated, 0);
            const due = p.runs.reduce((s, r) => s + r.due, 0);
            return (
              <Card key={p.id} className="p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold">{p.name}</span>
                  <Badge>{p.leadType.toUpperCase()}</Badge>
                  <Badge tone={p.status === "active" ? "success" : "warn"}>{p.status}</Badge>
                  <span className="text-[13px] text-[var(--los-muted)]">{p.dailyQuota} leads / working day · {p.exclusivity}</span>
                </div>
                <div className="mb-2 text-[13px] text-[var(--los-muted)]">
                  Last {p.runs.length} runs: {delivered}/{due} delivered
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...p.runs].reverse().map((r) => (
                    <div
                      key={r.runDate}
                      title={`${r.runDate}: ${r.allocated}/${r.due}`}
                      className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${
                        r.shortage === 0
                          ? "bg-[var(--los-success-soft)] text-[var(--los-success)]"
                          : r.allocated > 0
                            ? "bg-[var(--los-warn-soft)] text-[var(--los-warn)]"
                            : "bg-[var(--los-danger-soft)] text-[var(--los-danger)]"
                      }`}
                    >
                      {r.runDate.slice(5)} · {r.allocated}/{r.due}
                    </div>
                  ))}
                  {p.runs.length === 0 && <span className="text-[12.5px] text-[var(--los-faint)]">No deliveries yet.</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Delivered leads</div>
        <ul className="divide-y divide-[var(--los-line)]">
          {allocations.map((a) => {
            const lead = leadOf(a.leadId);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                <div className="min-w-0">
                  {lead ? (
                    <Link href={`/app/leads/${lead.id}`} className="font-medium text-[var(--los-brand)] hover:underline">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || lead.phone}
                    </Link>
                  ) : (
                    <span className="text-[var(--los-faint)]">Lead unavailable</span>
                  )}
                  <span className="ml-2 text-[12.5px] text-[var(--los-faint)]">
                    {a.plan.name} · {a.createdAt.toISOString().slice(0, 10)} · {a.tokensCharged} tokens
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {lead && <Badge>{lead.status}</Badge>}
                  <Badge tone={a.state === "delivered" ? "neutral" : a.state === "replaced" ? "success" : a.state === "rejected" ? "danger" : "warn"}>
                    {a.state.replace(/_/g, " ")}
                  </Badge>
                  {a.state === "delivered" && <ReplacementButton allocationId={a.id} />}
                </div>
              </li>
            );
          })}
          {allocations.length === 0 && (
            <li className="px-5 py-8 text-center text-[13.5px] text-[var(--los-faint)]">No deliveries yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
