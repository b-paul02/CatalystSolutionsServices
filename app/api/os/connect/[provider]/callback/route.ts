import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { completeConnection, isProvider, providerEnabled } from "@/lib/os/connectors";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/app/settings/workspace?connect=${q}`, req.nextUrl.origin));
    res.cookies.delete({ name: "cos_oauth", path: "/api/os/connect" });
    return res;
  };
  if (!isProvider(provider) || !providerEnabled(provider)) return back("failed");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let pinned: { state?: string; provider?: string; orgId?: string; verifier?: string | null } = {};
  try { pinned = JSON.parse(req.cookies.get("cos_oauth")?.value ?? "{}"); } catch { /* treated as mismatch */ }
  if (!code || !state || state !== pinned.state || pinned.provider !== provider) return back("failed");
  let actor;
  try { actor = await requireOrg("os.settings"); } catch { return back("failed"); }
  // tenant comes from the membership row; the cookie only has to AGREE with it
  if (actor.orgId !== pinned.orgId) return back("failed");
  try {
    const conn = await completeConnection({ provider, orgId: actor.orgId, userId: actor.userId, code, origin: req.nextUrl.origin, verifier: pinned.verifier ?? null });
    return back(conn.status === "verified" ? "ok" : "unverified");
  } catch {
    return back("failed");
  }
}
