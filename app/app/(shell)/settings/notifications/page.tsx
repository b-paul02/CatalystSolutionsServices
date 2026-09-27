import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { NOTIFICATION_KINDS } from "@/lib/os/notify";
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { savePrefs } from "./actions";

export const metadata = { title: "Notifications" };

// WP-07 · per-person delivery per kind. In-app is always on; email and Slack are opt-in. Slack uses the workspace's
// incoming-webhook address (Settings → Connections).
export default async function NotificationsSettingsPage() {
  const actor = await requireOrgPage();
  const [prefs, config] = await Promise.all([
    db.cosNotificationPref.findMany({ where: { orgId: actor.orgId, userId: actor.userId } }),
    db.losIntegrationConfig.findUnique({ where: { orgId: actor.orgId } }),
  ]);
  const slackReady = Boolean(config && (JSON.parse(config.config) as { slackWebhookUrl?: string }).slackWebhookUrl);
  const pref = (k: string) => prefs.find((p) => p.kind === k);
  return (
    <Card className="p-5 text-[13.5px]">
      <div className="mb-1 text-[15px] font-bold">How you want to be told</div>
      <p className="mb-3 text-[13px] text-[var(--los-muted)]">Everything always appears in the app. Tick email or Slack for the kinds you want pushed to you. {slackReady ? "" : "Slack needs the workspace webhook on Settings → Connections first."}</p>
      <ActionForm action={savePrefs} submit="Save">
        <table className="mb-3 w-full text-left">
          <thead><tr className="text-[12px] text-[var(--los-muted)]"><th className="py-1">Notification</th><th className="py-1 text-center">Email</th><th className="py-1 text-center">Slack</th></tr></thead>
          <tbody>
            {NOTIFICATION_KINDS.map((k) => (
              <tr key={k.kind} className="border-t border-[var(--los-line)]">
                <td className="py-1.5">{k.label}</td>
                <td className="py-1.5 text-center"><input type="checkbox" name={`email:${k.kind}`} defaultChecked={pref(k.kind)?.email ?? false} aria-label={`Email for ${k.label}`} /></td>
                <td className="py-1.5 text-center"><input type="checkbox" name={`slack:${k.kind}`} defaultChecked={pref(k.kind)?.slack ?? false} disabled={!slackReady} aria-label={`Slack for ${k.label}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ActionForm>
    </Card>
  );
}
