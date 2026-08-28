// Saved-search alerts: daily job compares result counts and emails the search
// owner when new matches appear.
import { db } from "@/lib/audit/db";
import { enqueueJob, registerJobHandler } from "./jobs";
import { searchPeople, type B2bSearchFilters } from "./b2bDiscovery";
import { sendLosMail, APP_URL } from "./email";

export const ALERT_JOB = "leados:search-alerts";

registerJobHandler(ALERT_JOB, async () => {
  const searches = await db.losSavedSearch.findMany({ where: { alert: true } });
  for (const s of searches) {
    const hits = await searchPeople(s.orgId, JSON.parse(s.filters) as B2bSearchFilters, 100);
    const count = hits.length;
    if (s.lastCount !== null && count > s.lastCount) {
      const owner = await db.losUser.findUnique({ where: { id: s.createdById } });
      if (owner) {
        await sendLosMail({
          to: owner.email,
          subject: `New B2B matches for "${s.name}"`,
          text: `Your saved search "${s.name}" now has ${count} matches (${count - s.lastCount} new).\n\nView them: ${APP_URL}/discover`,
        }).catch(() => {});
      }
      await db.losSavedSearch.update({ where: { id: s.id }, data: { lastCount: count, lastAlertAt: new Date() } });
    } else if (s.lastCount === null || count !== s.lastCount) {
      await db.losSavedSearch.update({ where: { id: s.id }, data: { lastCount: count } });
    }
  }
});

export async function enqueueSearchAlerts(now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await enqueueJob({ type: ALERT_JOB, idempotencyKey: `search-alerts-${day}` });
}
