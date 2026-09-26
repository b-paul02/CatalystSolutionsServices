import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { timeLogExport } from "@/lib/os/exports";
import { WorkError } from "@/lib/os/work";

// WP-51 · /api/os/export/timelogs?month=YYYY-MM (staff with work.manage)
export async function GET(req: NextRequest) {
  try {
    const actor = await requireOrg();
    const r = await timeLogExport(actor, req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7));
    return new NextResponse(r.body, { headers: { "Content-Type": `${r.type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${r.name}"` } });
  } catch (e) { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
}
