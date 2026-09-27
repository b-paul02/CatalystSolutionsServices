import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { storageByName, verifyMediaLink } from "@/lib/os/storage";

// Time-limited media delivery for providers that must FETCH a file (Instagram, Facebook photos). There is no session
// here by design: the HMAC signature + expiry IS the authorisation, minted by the publisher for one asset version on
// an approved variant. A bad or expired link gets a bare 404 — it never confirms that an asset exists.
export async function GET(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const q = req.nextUrl.searchParams;
  if (!verifyMediaLink(versionId, q.get("exp"), q.get("sig"))) return new NextResponse(null, { status: 404 });
  const v = await db.cosAssetVersion.findUnique({ where: { id: versionId }, select: { storage: true, storageKey: true, mime: true, asset: { select: { status: true } } } });
  if (!v || v.asset.status === "archived") return new NextResponse(null, { status: 404 });
  const bytes = await storageByName(v.storage).get(v.storageKey);
  return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": v.mime, "content-length": String(bytes.length), "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
}
