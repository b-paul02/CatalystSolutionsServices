import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { WorkError } from "@/lib/os/work";
import { readAsset } from "@/lib/os/assets";

// Bytes are only ever served here, after the membership + client-visibility check. Storage
// addresses never reach a browser. Inline preview only for media types that cannot run script.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try { actor = await requireOrg(); } catch { return new NextResponse("Sign in first.", { status: 401 }); }
  const { id } = await ctx.params;
  const v = req.nextUrl.searchParams.get("v");
  try {
    const { asset, version, bytes } = await readAsset(actor, id, v && /^\d+$/.test(v) ? Number(v) : undefined);
    const inline = /^(image\/(png|jpeg|webp|gif)|video\/|audio\/|application\/pdf)/.test(version.mime) && !req.nextUrl.searchParams.has("download");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": version.mime, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.name.replace(/[^\w.\- ]+/g, "_")}"`,
      },
    });
  } catch (e) {
    if (e instanceof WorkError) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
