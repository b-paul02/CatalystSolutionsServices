import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { recordClick, resolveShortCode } from "@/lib/os/links";

// WP-05 · /l/:code → 302 to the tagged destination. Records the click (referrer host + UA class; no IP, no UA string).
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`l:${ip}`, 120, 60_000)) return new NextResponse("Too many requests", { status: 429 });
  const r = await resolveShortCode(code);
  if (!r) return new NextResponse("Link not found", { status: 404 });
  await recordClick(r.linkId, { referer: req.headers.get("referer"), userAgent: req.headers.get("user-agent") }).catch(() => undefined);
  return NextResponse.redirect(r.to, { status: 302, headers: { "Cache-Control": "no-store" } });
}
