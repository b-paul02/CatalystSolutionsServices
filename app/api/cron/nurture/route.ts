import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { sendDay3Email, sendDay14Email } from "@/lib/audit/email";

// Hit daily by a cron (Vercel cron or any scheduler): GET /api/cron/nurture with Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const delivered = await db.report.findMany({
    where: { deliveredAt: { not: null } },
    include: { lead: { include: { events: true } } },
  });

  let sent = 0;
  for (const r of delivered) {
    const age = now - r.deliveredAt!.getTime();
    const has = (t: string) => r.lead.events.some((e) => e.type === `email_sent:${t}` || e.type === `email_skipped:${t}`);
    if (age >= 3 * day && !has("day3")) { await sendDay3Email(r.leadId, r.lead.email, r.token); sent++; }
    if (age >= 14 * day && !has("day14")) { await sendDay14Email(r.leadId, r.lead.email, r.token); sent++; }
  }
  return NextResponse.json({ ok: true, sent });
}
