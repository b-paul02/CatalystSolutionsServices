import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/partner/ratelimit";
import { parseBeacon, recordBeacon } from "@/lib/os/beacon";

// WP-43 · beacon ingest (sendBeacon, text/plain JSON). Rate limited per IP; no cookies read or set.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`beacon:${ip}`, 120, 60_000)) return new NextResponse(null, { status: 429 });
  let raw: unknown; try { raw = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 400 }); }
  const b = parseBeacon(raw);
  if (!b) return new NextResponse(null, { status: 400 });
  await recordBeacon(b).catch(() => undefined);
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST" } }); }
