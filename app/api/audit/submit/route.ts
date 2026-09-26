import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db, logEvent } from "@/lib/audit/db";
import { scoreG1, type Intake } from "@/lib/audit/score";
import { runPipeline } from "@/lib/audit/pipeline";
import { rateLimit } from "@/lib/partner/ratelimit";

export const maxDuration = 300; // pipeline runs after the response via after()

export async function POST(req: NextRequest) {
  // WP-13: public submit gets a rate limit, a honeypot and Turnstile (when configured) — the crawl behind it is expensive
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`audit-submit:${ip}`, 5, 60_000)) return NextResponse.json({ error: "Too many submissions. Please try again in a minute." }, { status: 429 });
  const { leadId, profile, intake, moduleAnswers, website, turnstileToken } = await req.json().catch(() => ({}));
  if (website) return NextResponse.json({ ok: true }); // honeypot: silently drop
  if (process.env.TURNSTILE_SECRET_KEY) {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(turnstileToken ?? ""), remoteip: ip }) }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!check.success) return NextResponse.json({ error: "Bot check failed — reload and try again." }, { status: 400 });
  }
  if (!leadId || !intake) return NextResponse.json({ error: "Missing intake." }, { status: 400 });

  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { evidencePack: true } });
  if (!lead || !lead.evidencePack) return NextResponse.json({ error: "Unknown lead." }, { status: 404 });
  if (lead.status !== "intake") return NextResponse.json({ error: "Already submitted." }, { status: 409 });

  const scraped = JSON.parse(lead.evidencePack.scraped);
  const g1 = scoreG1(intake as Intake, scraped, lead.email);

  await db.evidencePack.update({
    where: { leadId },
    data: {
      profile: JSON.stringify(profile ?? {}),
      intake: JSON.stringify(intake),
      moduleAnswers: JSON.stringify(moduleAnswers ?? {}),
    },
  });
  await db.lead.update({
    where: { id: leadId },
    data: { g1Score: g1.score, g1Components: JSON.stringify(g1.components), tag: g1.tag, redFlags: JSON.stringify(g1.flags) },
  });
  await logEvent(leadId, "intake_submitted", { g1: g1.score, tag: g1.tag });

  // Placeholder report row so the user gets their permanent link immediately;
  // the page shows "in review" until a human approves. No email delivery.
  const placeholder = await db.report.upsert({
    where: { leadId },
    create: { leadId, json: "{}", status: "generating" },
    update: {},
  });

  after(async () => {
    try {
      await runPipeline(leadId);
    } catch (e) {
      console.error("pipeline failed", e);
      await db.lead.update({ where: { id: leadId }, data: { status: "needs_attention" } }).catch(() => {});
      await logEvent(leadId, "pipeline_error", { message: (e as Error).message }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true, token: placeholder.token });
}
