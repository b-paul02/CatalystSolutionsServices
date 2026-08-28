import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import OutreachManager from "./OutreachManager";

export const metadata = { title: "Outreach" };

export default async function OutreachPage() {
  const actor = await requireOrg("leads.view");
  const [templates, sequences, recentMessages] = await Promise.all([
    db.losMessageTemplate.findMany({ where: { orgId: actor.orgId }, orderBy: { name: "asc" } }),
    db.losSequence.findMany({
      where: { orgId: actor.orgId },
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.losOutboundMessage.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "?";
  return (
    <OutreachManager
      canManageTemplates={can(actor.role, "leads.contact")}
      canManageSequences={can(actor.role, "pipeline.manage")}
      templates={templates.map((t) => ({ id: t.id, name: t.name, channel: t.channel, subject: t.subject, body: t.body }))}
      sequences={sequences.map((s) => ({
        id: s.id, name: s.name, status: s.status, enrollments: s._count.enrollments,
        steps: s.steps.map((st) => ({ label: `${st.channel} · ${templateName(st.templateId)} · +${st.delayHours}h` })),
      }))}
      messages={recentMessages.map((m) => ({
        id: m.id, channel: m.channel, status: m.status,
        blockReason: m.blockReason, at: m.createdAt.toISOString().slice(0, 16).replace("T", " "),
      }))}
    />
  );
}
