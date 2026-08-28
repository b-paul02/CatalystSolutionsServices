import { requireOrg } from "@/lib/leados/auth";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import IntegrationsManager from "./IntegrationsManager";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const actor = await requireOrg();
  const [webhooks, config] = await Promise.all([
    db.losWebhook.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" } }),
    db.losIntegrationConfig.findUnique({ where: { orgId: actor.orgId } }),
  ]);
  const slackUrl = config ? (JSON.parse(config.config) as { slackWebhookUrl?: string }).slackWebhookUrl ?? "" : "";
  // Platform-level provider status (env-configured by Catalyst).
  const providers = [
    { name: "WhatsApp & SMS (Twilio)", on: Boolean(process.env.TWILIO_ACCOUNT_SID) },
    { name: "Transactional email (Resend)", on: Boolean(process.env.RESEND_API_KEY) },
    { name: "Meta lead ads", on: Boolean(process.env.LEADOS_META_APP_SECRET) },
    { name: "Google lead forms", on: Boolean(process.env.LEADOS_GOOGLE_LEADS_KEY) },
    { name: "Bot protection (Turnstile)", on: Boolean(process.env.TURNSTILE_SECRET_KEY) },
  ];
  return (
    <IntegrationsManager
      canManage={can(actor.role, "org.manage")}
      slackUrl={slackUrl}
      providers={providers}
      webhooks={webhooks.map((w) => ({
        id: w.id, url: w.url, events: JSON.parse(w.events) as string[],
        active: w.active, failCount: w.failCount, lastStatus: w.lastStatus,
        lastFiredAt: w.lastFiredAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
      }))}
    />
  );
}
