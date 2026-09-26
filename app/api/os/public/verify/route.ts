import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { verifySubmission } from "@/lib/os/scorecardVerify";
import { WorkError } from "@/lib/os/work";

export const maxDuration = 60;

// WP-10e · public "verify with a site audit": rate limit + honeypot + Turnstile (when configured); idempotent per submission.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`verify:${ip}`, 3, 60 * 60_000)) return NextResponse.json({ error: "Too many checks from this connection — try again in an hour." }, { status: 429 });
  let body: { publicId?: string; submissionId?: string; url?: string; website?: string; turnstileToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body.website) return NextResponse.json({ ok: true }); // honeypot
  if (process.env.TURNSTILE_SECRET_KEY) {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: body.turnstileToken ?? "", remoteip: ip }) }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!check.success) return NextResponse.json({ error: "Bot check failed — reload and try again." }, { status: 400 });
  }
  try {
    const verified = await verifySubmission(String(body.publicId ?? ""), String(body.submissionId ?? ""), String(body.url ?? ""));
    return NextResponse.json({ ok: true, overall: verified.overall, checkedAt: verified.checkedAt });
  } catch (e) {
    if (e instanceof WorkError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
