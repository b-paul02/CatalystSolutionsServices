import { NextRequest, NextResponse } from "next/server";
import { LosAuthError, requireOrg } from "@/lib/leados/auth";
import { entitlements } from "@/lib/os/entitlements";
import { scorecardSummary } from "@/lib/os/scorecardResults";
import { periodBounds } from "@/lib/os/time";

// WP-10d · CSV of the scorecard funnel per campaign for the period. Counts only; demo rows excluded for real workspaces.
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireOrg("reports.view", "work.view"); } catch (e) {
    if (e instanceof LosAuthError && e.status !== 401) return new NextResponse("Forbidden.", { status: 403 });
    return new NextResponse("Sign in first.", { status: 401 });
  }
  const ent = await entitlements(actor.orgId);
  const p = req.nextUrl.searchParams.get("period");
  const period = (["week", "month", "last30"].includes(p ?? "") ? p : "last30") as "week" | "month" | "last30";
  const rows = await scorecardSummary(actor.orgId, periodBounds(period, ent.timezone), ent.demo);
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const bands = [...new Set(rows.flatMap((r) => Object.keys(r.bands)))].sort();
  const csv = [["campaign", "starts", "completions", "leads", "average_score", ...bands.map((b) => `band_${b}`)].map(esc).join(","), ...rows.map((r) => [r.name, r.starts, r.completions, r.leads, r.averageScore, ...bands.map((b) => r.bands[b] ?? 0)].map(esc).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="scorecard-${period}.csv"`, "Cache-Control": "private, no-store" } });
}
