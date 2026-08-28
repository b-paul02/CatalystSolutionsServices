import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { processSubmission } from "@/lib/leados/submission";

// Google Ads lead form webhook. Configure the webhook URL in the lead form
// asset as .../api/leados/webhooks/google and set google_key to
// LEADOS_GOOGLE_LEADS_KEY. Campaigns link via LosExternalCampaign
// (provider "google", externalId = form/campaign id sent by Google).

export async function POST(req: NextRequest) {
  const key = process.env.LEADOS_GOOGLE_LEADS_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let body: {
    google_key?: string;
    form_id?: number | string;
    campaign_id?: number | string;
    user_column_data?: { column_id: string; string_value: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.google_key !== key) return NextResponse.json({ error: "bad key" }, { status: 403 });

  const externalId = String(body.form_id ?? body.campaign_id ?? "");
  const link = await db.losExternalCampaign.findUnique({
    where: { provider_externalId: { provider: "google", externalId } },
  });
  if (!link) return NextResponse.json({ ok: true, note: "unmapped form" });

  const values: Record<string, string> = {};
  for (const col of body.user_column_data ?? []) {
    const id = col.column_id.toUpperCase();
    const keyName =
      id.includes("PHONE") ? "phone" :
      id.includes("EMAIL") ? "email" :
      id.includes("FIRST") ? "firstName" :
      id.includes("LAST") ? "lastName" :
      id.includes("CITY") ? "city" : col.column_id;
    values[keyName] = col.string_value ?? "";
  }
  await processSubmission({
    campaignId: link.campaignId, values, consentChecked: true,
    utm: { utm_source: "google_lead_form" }, trackingCode: null, ip: null,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
