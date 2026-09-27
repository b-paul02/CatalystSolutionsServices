import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { startConversation } from "@/lib/os/chat";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-chat-token", "Access-Control-Allow-Methods": "POST, GET" };
// WP-44 · first message: rate limit + Turnstile (when configured); the widget keeps the token, so a retry never starts a second conversation.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`chat:start:${ip}`, 5, 60_000)) return NextResponse.json({ error: "Too many chats started. Try again in a minute." }, { status: 429, headers: cors });
  let body: { w?: string; text?: string; email?: string; page?: string; turnstileToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400, headers: cors }); }
  if (process.env.TURNSTILE_SECRET_KEY) {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: body.turnstileToken ?? "", remoteip: ip }) }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!check.success) return NextResponse.json({ error: "Please complete the check and send again." }, { status: 400, headers: cors });
  }
  if (!body.w || !body.text) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: cors });
  const r = await startConversation(body.w, { text: body.text, email: body.email, page: body.page });
  if (!r) return NextResponse.json({ error: "Chat is not available." }, { status: 404, headers: cors });
  return NextResponse.json(r, { headers: cors });
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
