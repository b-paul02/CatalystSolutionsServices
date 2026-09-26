import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { createBooking, rescheduleBooking } from "@/lib/os/booking";

// WP-16 · public booking submit: rate limit + honeypot + Turnstile (when configured) + client idempotency key.
export async function POST(req: NextRequest, ctx: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`book:${ip}`, 10, 60_000) || !rateLimit(`book:${typeId}`, 120, 60_000)) return NextResponse.json({ error: "Too many requests. Please try again in a minute." }, { status: 429 });
  let body: { startAt?: string; visitorTz?: string; name?: string; email?: string; phone?: string; answers?: Record<string, string>; consent?: boolean; requestId?: string; website?: string; turnstileToken?: string; manageToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body.website) return NextResponse.json({ ok: true }); // honeypot
  if (process.env.TURNSTILE_SECRET_KEY) {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: body.turnstileToken ?? "", remoteip: ip }) }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!check.success) return NextResponse.json({ error: "Bot check failed — reload and try again." }, { status: 400 });
  }
  const r = body.manageToken
    ? await rescheduleBooking(typeId, body.manageToken, String(body.startAt ?? ""), String(body.visitorTz ?? ""), String(body.requestId ?? ""))
    : await createBooking({ typeId, startAt: String(body.startAt ?? ""), visitorTz: String(body.visitorTz ?? ""), name: String(body.name ?? ""), email: String(body.email ?? ""), phone: body.phone ? String(body.phone) : undefined, answers: body.answers ?? {}, consent: Boolean(body.consent), requestId: String(body.requestId ?? "") });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, bookingId: r.booking.id, startAt: r.booking.startAt.toISOString(), endAt: r.booking.endAt.toISOString(), manageUrl: r.booking.manageUrl, duplicate: r.duplicate });
}
