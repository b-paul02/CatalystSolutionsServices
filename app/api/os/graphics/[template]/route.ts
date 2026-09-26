import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { TEMPLATES, templateElement, verifyGraphicParams, type TemplateKey } from "@/lib/os/graphics";

export const runtime = "nodejs";

// WP-22 · templated graphics rendered by next/og, server-side only. Every request is signed (HMAC over the fields), so
// the route cannot be used as a free image generator with arbitrary text.
export async function GET(req: NextRequest, ctx: { params: Promise<{ template: string }> }) {
  const { template } = await ctx.params;
  if (!(template in TEMPLATES)) return new NextResponse("Not found", { status: 404 });
  const fields = verifyGraphicParams(req.nextUrl.searchParams);
  if (!fields) return new NextResponse("Bad signature", { status: 403 });
  const t = TEMPLATES[template as TemplateKey];
  return new ImageResponse(templateElement(template as TemplateKey, fields), { width: t.width, height: t.height, headers: { "Cache-Control": "public, max-age=86400" } });
}
