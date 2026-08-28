import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { rateLimit } from "@/lib/partner/ratelimit";
import { processSubmission } from "@/lib/leados/submission";

// Public form submission endpoint (§5.8 steps 1-2 live here; the rest in
// processSubmission). Sub-second ack: verification/enrichment stay async.
export async function POST(req: NextRequest, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`form:${ip}`, 10, 60_000) || !rateLimit(`form:${publicId}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many submissions. Please try again in a minute." }, { status: 429 });
  }
  let body: {
    values?: Record<string, string>;
    consentChecked?: boolean;
    utm?: Record<string, string>;
    trackingCode?: string | null;
    website?: string;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Honeypot: bots fill everything.
  if (body.website) {
    return NextResponse.json({ message: "Thank you!" }); // silently drop
  }
  // Cloudflare Turnstile when configured (TURNSTILE_SECRET_KEY).
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: body.turnstileToken ?? "", remoteip: ip }),
    }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!check.success) return NextResponse.json({ error: "Bot check failed — reload and try again." }, { status: 400 });
  }

  const campaign = await db.losCampaign.findUnique({ where: { publicId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const result = await processSubmission({
    campaignId: campaign.id,
    values: body.values ?? {},
    consentChecked: Boolean(body.consentChecked),
    utm: body.utm ?? {},
    trackingCode: body.trackingCode ?? null,
    ip,
  });
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.problem }, { status: 422 });
  }
  return NextResponse.json({ message: result.message });
}
