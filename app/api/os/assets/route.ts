import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { WorkError } from "@/lib/os/work";
import { addAssetVersion, uploadAsset } from "@/lib/os/assets";
import { entitlements } from "@/lib/os/entitlements";

export const maxDuration = 300;

// Multipart upload (new asset, or a new version when assetId is given). Tenant from the membership
// row; type, size and content are checked in lib/os/assets.ts before a single byte is stored.
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireOrg(); } catch { return NextResponse.json({ error: "Sign in first." }, { status: 401 }); }
  if (!(await entitlements(actor.orgId)).modules.has("assets")) return NextResponse.json({ error: "Assets are not available in this workspace." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const s = (k: string) => String(form.get(k) ?? "").trim();
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const duration = /^\d+$/.test(s("durationSec")) ? Number(s("durationSec")) : null;
    if (s("assetId")) {
      const version = await addAssetVersion(actor, s("assetId"), { name: file.name, mime: file.type, bytes, note: s("note"), durationSec: duration });
      return NextResponse.json({ ok: true, assetId: s("assetId"), version });
    }
    const asset = await uploadAsset(actor, { name: s("name") || file.name, mime: file.type, bytes, category: s("category"), tags: s("tags").split(","), rightsNote: s("rightsNote"), sourceNote: s("sourceNote"), clientVisible: s("clientVisible") !== "off", durationSec: duration, workItemId: s("workItemId") || null });
    return NextResponse.json({ ok: true, assetId: asset.id, version: 1 });
  } catch (e) {
    if (e instanceof WorkError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
