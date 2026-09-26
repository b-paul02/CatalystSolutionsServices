import { NextRequest, NextResponse } from "next/server";
import { publicSiteContent } from "@/lib/os/siteContent";

// WP-40 · the client's site reads its copy here (values only, cached by tag, revalidated on save).
export async function GET(req: NextRequest, ctx: { params: Promise<{ workItemId: string }> }) {
  const { workItemId } = await ctx.params;
  const locale = req.nextUrl.searchParams.get("locale") ?? "en";
  const values = await publicSiteContent(workItemId, /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : "en");
  return NextResponse.json(values, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
