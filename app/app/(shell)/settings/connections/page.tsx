import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { listConnectionCards, type ConnectionCard } from "@/lib/os/connections";
import { Badge, Card, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { day, field, PageHeader } from "@/components/os/bits";
import IntegrationsManager from "../integrations/IntegrationsManager";
import { connectKeyConn, disconnectConn, syncConn, testConn } from "./actions";

export const metadata = { title: "Connections" };

const TONE: Record<ConnectionCard["status"], "success" | "danger" | "warn" | "neutral" | "brand"> = { verified: "success", failed: "danger", pending: "warn", disconnected: "neutral", not_connected: "neutral", not_configured: "neutral", awaiting_approval: "warn" };
const WORDS: Record<ConnectionCard["status"], string> = { verified: "verified", failed: "failed", pending: "pending", disconnected: "disconnected", not_connected: "not connected", not_configured: "not configured", awaiting_approval: "Awaiting approval" };
const GROUPS: { source: ConnectionCard["source"]; title: string; sub: string }[] = [
  { source: "oauth", title: "Accounts", sub: "Sign-in connections. “Verified” means a live access test passed — never just a stored token." },
  { source: "key", title: "Workflow tools", sub: "Keys your workflow steps post with. Encrypted at rest, shown once, verified by a live test." },
  { source: "ads", title: "Lead intake", sub: "Ad platforms that send leads straight into your CRM." },
  { source: "config", title: "Notifications", sub: "Where the workspace posts what happens." },
];
const METRIC_FOR: Record<string, [string, string]> = { gsc: ["clicks", "Search clicks"], youtube: ["views", "Views"], linkedin: ["impressions", "Impressions"], x: ["impressions", "Impressions"], meta: ["reach", "Reach"] };

// One page for every connection (WP-01). Old pages (Settings → Integrations, Workflows → Connections) redirect here.
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireOrgPage();
  const [cards, webhooks, config] = await Promise.all([
    listConnectionCards(actor.orgId),
    db.losWebhook.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" } }),
    db.losIntegrationConfig.findUnique({ where: { orgId: actor.orgId } }),
  ]);
  const settings = can(actor.role, "os.settings"), automations = can(actor.role, "automations.manage");
  const just = sp.connect === "ok" ? cards.find((c) => c.source === "oauth" && c.status === "verified" && c.lastCheckedAt && Date.now() - c.lastCheckedAt.getTime() < 10 * 60_000) : null;
  const slackUrl = config ? (JSON.parse(config.config) as { slackWebhookUrl?: string }).slackWebhookUrl ?? "" : "";
  return (
    <div className="space-y-6">
      <PageHeader title="Connections" sub="Everything this workspace is connected to, in one place." />
      {sp.connect === "failed" && <div role="alert" className="rounded-lg border border-[var(--los-danger)] px-4 py-2.5 text-[13px] text-[var(--los-danger)]">The sign-in did not complete. Try again; if it keeps failing, the provider app may not be approved for this account yet.</div>}
      {sp.connect === "unverified" && <div role="alert" className="rounded-lg border border-[var(--los-warn)] px-4 py-2.5 text-[13px]">Signed in, but the live access test failed — see the card for the reason and press Test after fixing it.</div>}
      {just && <GrowthStep done={`${just.label} verified${just.accountLabel ? ` — ${just.accountLabel}` : ""}.`} step={{ pillar: "digital_visibility", metric: METRIC_FOR[just.provider]?.[0] ?? "impressions", metricLabel: METRIC_FOR[just.provider]?.[1] ?? "Impressions", action: { kind: "goal", label: "Set a visibility goal", title: `Grow ${METRIC_FOR[just.provider]?.[1] ?? "impressions"} from ${just.label}`, unit: "per month", horizon: "90 days" } }} />}
      {GROUPS.map((g) => {
        const rows = cards.filter((c) => c.source === g.source);
        if (rows.length === 0) return null;
        return (
          <section key={g.source}>
            <h2 className="text-[15px] font-bold">{g.title}</h2>
            <p className="mb-3 text-[13px] text-[var(--los-muted)]">{g.sub}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((c) => (
                <Card key={c.key} className="p-4 text-[13.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{c.label}</div>
                    <Badge tone={TONE[c.status]}>{WORDS[c.status]}</Badge>
                  </div>
                  <div className="mt-1 text-[12.5px] text-[var(--los-muted)]">{c.accountLabel ? `${c.accountLabel} · ` : ""}{c.capability}</div>
                  {(c.lastCheckedAt || c.lastError) && <div className="mt-1 text-[12px] text-[var(--los-faint)]">{c.lastCheckedAt ? `last verified ${day(c.lastCheckedAt)}` : ""}{c.lastError ? <span className="text-[var(--los-danger)]"> · {c.lastError}</span> : null}</div>}
                  {c.setupNote && <p className="mt-1 text-[12px] text-[var(--los-faint)]">{c.setupNote}</p>}
                  {c.source === "oauth" && settings && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.connectHref && (c.status === "not_connected" || c.status === "disconnected" || c.status === "failed") && <a href={c.connectHref} className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white">{c.status === "not_connected" ? "Connect" : "Reconnect"}</a>}
                      {c.id && c.status !== "disconnected" && <ActionForm action={testConn} submit="Test" tone="ghost" hidden={{ id: c.id }} />}
                      {c.id && c.provider === "gsc" && c.status === "verified" && <ActionForm action={syncConn} submit="Sync now" tone="ghost" />}
                      {c.id && c.status !== "disconnected" && <ActionForm action={disconnectConn} submit="Disconnect" tone="danger" hidden={{ id: c.id }} confirm={`Disconnect ${c.label}? Stored tokens are destroyed.`} />}
                    </div>
                  )}
                  {c.source === "key" && automations && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <ActionForm action={connectKeyConn} submit={c.id && c.status !== "disconnected" ? "Replace" : "Connect"} tone={c.id && c.status !== "disconnected" ? "ghost" : "brand"} hidden={{ provider: c.provider }} className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1"><Label>{c.keyInput!.secretLabel}</Label><input name="secret" type="password" autoComplete="off" required className={field} /></div>
                      </ActionForm>
                      {c.id && c.status !== "disconnected" && <ActionForm action={testConn} submit="Test" tone="ghost" hidden={{ id: c.id }} />}
                      {c.id && c.status !== "disconnected" && <ActionForm action={disconnectConn} submit="Disconnect" tone="danger" hidden={{ id: c.id }} confirm={`Disconnect ${c.label}? Workflows using it will fail until it is reconnected.`} />}
                      <p className="w-full text-[12px] text-[var(--los-faint)]">{c.keyInput!.help}</p>
                    </div>
                  )}
                  {c.source === "ads" && c.connectHref && settings && <a href={c.connectHref} className="mt-3 inline-block text-[13px] font-semibold text-[var(--los-brand)] hover:underline">Set up in Lead capture →</a>}
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      <IntegrationsManager
        canManage={can(actor.role, "org.manage")}
        slackUrl={slackUrl}
        providers={[
          { name: "WhatsApp & SMS (Twilio)", on: Boolean(process.env.TWILIO_ACCOUNT_SID) },
          { name: "Transactional email (Resend)", on: Boolean(process.env.RESEND_API_KEY) },
          { name: "Bot protection (Turnstile)", on: Boolean(process.env.TURNSTILE_SECRET_KEY) },
        ]}
        webhooks={webhooks.map((w) => ({ id: w.id, url: w.url, events: JSON.parse(w.events) as string[], active: w.active, failCount: w.failCount, lastStatus: w.lastStatus, lastFiredAt: w.lastFiredAt?.toISOString().slice(0, 16).replace("T", " ") ?? null }))}
      />
    </div>
  );
}
