import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { visitorPost, visitorRead } from "@/lib/os/chat";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-chat-token", "Access-Control-Allow-Methods": "POST, GET" };
// WP-44 · visitor side: read (poll) and post, identified by the token header only.
export async function GET(req: NextRequest) {
  const tok = req.headers.get("x-chat-token") ?? "";
  if (!tok || !rateLimit(`chat:read:${tok}`, 30, 60_000)) return NextResponse.json({ messages: [] }, { status: tok ? 429 : 401, headers: cors });
  const r = await visitorRead(tok, req.nextUrl.searchParams.get("after") || undefined);
  return NextResponse.json(r ?? { status: "closed", messages: [] }, { headers: cors });
}
export async function POST(req: NextRequest) {
  const tok = req.headers.get("x-chat-token") ?? "";
  if (!tok || !rateLimit(`chat:post:${tok}`, 20, 60_000)) return NextResponse.json({ error: "Slow down." }, { status: tok ? 429 : 401, headers: cors });
  let body: { text?: string }; try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400, headers: cors }); }
  const id = await visitorPost(tok, body.text ?? "");
  return NextResponse.json({ ok: !!id }, { status: id ? 200 : 404, headers: cors });
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
