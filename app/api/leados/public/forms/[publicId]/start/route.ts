import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { rateLimit } from "@/lib/partner/ratelimit";
import { recordScorecardStart } from "@/lib/os/scorecardResults";

// WP-10d · "started" ping from the public scorecard (first answer). Rate-limited; no body, no personal data.
export async function POST(req: NextRequest, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`sc-start:${ip}`, 20, 60_000) || !rateLimit(`sc-start:${publicId}`, 600, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });
  const campaign = await db.losCampaign.findUnique({ where: { publicId }, select: { id: true, orgId: true, name: true, demo: true, marketingCampaignId: true, type: true, status: true } });
  if (!campaign || campaign.type !== "scorecard" || campaign.status !== "active") return NextResponse.json({ ok: false }, { status: 404 });
  await recordScorecardStart(campaign).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
