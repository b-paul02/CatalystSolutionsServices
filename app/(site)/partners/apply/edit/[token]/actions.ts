"use server";

import { db } from "@/lib/audit/db";
import { writeAudit } from "@/lib/partner/audit";
import { REQUESTABLE_FIELDS } from "@/lib/partner/application-fields";
import { scoreApplication } from "@/lib/partner/scoring";

/**
 * The applicant may write ONLY the fields the admin named, and only while the
 * application is waiting on them. The allow-list is re-derived here from the
 * stored request — nothing the browser sends widens it.
 */
export async function submitRequestedInfo(token: string, values: Record<string, string>) {
  const app = await db.partnerApplication.findUnique({ where: { statusToken: token } });
  if (!app || app.deletedAt) throw new Error("Application not found.");
  if (app.status !== "waiting_on_applicant") throw new Error("There is no open request on this application.");

  const requested: string[] = app.requestedFields ? JSON.parse(app.requestedFields) : [];
  const allowed = REQUESTABLE_FIELDS.filter((f) => requested.includes(f.key));
  if (allowed.length === 0) throw new Error("There is no open request on this application.");

  const data: Record<string, unknown> = {};
  for (const f of allowed) {
    const raw = values[f.key];
    if (raw === undefined) continue;
    if (f.kind === "number") {
      data[f.key] = raw === "" ? null : Math.max(0, Math.min(9999, Math.round(Number(raw) || 0)));
    } else {
      data[f.key] = raw.trim().slice(0, 4000);
    }
  }

  const before = Object.fromEntries(allowed.map((f) => [f.key, (app as unknown as Record<string, unknown>)[f.key]]));
  const updated = await db.partnerApplication.update({
    where: { id: app.id },
    data: { ...data, status: "screening", requestedFields: null },
  });

  // Rescore — the answers that feed the score may just have changed.
  const list = (v: string | null) => { try { return JSON.parse(v ?? "[]") as string[]; } catch { return []; } };
  const { total, breakdown } = scoreApplication({
    ...updated,
    industries: list(updated.industries),
    leadSources: list(updated.leadSources),
    markets: list(updated.markets),
    targetFamilies: list(updated.targetFamilies),
  });
  await db.partnerApplication.update({
    where: { id: app.id },
    data: { score: total, scoreBreakdown: JSON.stringify(breakdown) },
  });

  await writeAudit({
    actor: null, entity: "partner_application", entityId: app.id, action: "applicant_updated",
    before, after: { ...data, score: total }, reason: "Applicant answered an information request",
  });
}
