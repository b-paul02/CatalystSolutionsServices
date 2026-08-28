import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/audit/db";
import { processSubmission } from "@/lib/leados/submission";

// Meta Lead Ads webhook. Env: LEADOS_META_VERIFY_TOKEN (subscription verify),
// LEADOS_META_APP_SECRET (signature), LEADOS_META_ACCESS_TOKEN (lead fetch).
// Campaigns link via LosExternalCampaign (provider "meta", externalId = form id).

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === process.env.LEADOS_META_VERIFY_TOKEN) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.LEADOS_META_APP_SECRET;
  const raw = await req.text();
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return NextResponse.json({ error: "bad signature" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const payload = JSON.parse(raw) as {
    entry?: { changes?: { field: string; value: { form_id: string; leadgen_id: string } }[] }[];
  };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const link = await db.losExternalCampaign.findUnique({
        where: { provider_externalId: { provider: "meta", externalId: change.value.form_id } },
      });
      if (!link) continue;
      // Fetch full lead data from the Graph API.
      const token = process.env.LEADOS_META_ACCESS_TOKEN;
      if (!token) continue;
      const lead = (await fetch(
        `https://graph.facebook.com/v21.0/${change.value.leadgen_id}?access_token=${token}`,
      ).then((r) => r.json()).catch(() => null)) as { field_data?: { name: string; values: string[] }[] } | null;
      if (!lead?.field_data) continue;
      const values: Record<string, string> = {};
      for (const f of lead.field_data) {
        const key = f.name.toLowerCase().includes("phone") ? "phone"
          : f.name.toLowerCase().includes("mail") ? "email"
          : f.name.toLowerCase().includes("first") ? "firstName"
          : f.name.toLowerCase().includes("last") ? "lastName"
          : f.name;
        values[key] = f.values[0] ?? "";
      }
      // Meta lead forms carry platform consent — treated as consentChecked.
      await processSubmission({
        campaignId: link.campaignId, values, consentChecked: true,
        utm: { utm_source: "meta_lead_ad" }, trackingCode: null, ip: null,
      }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
