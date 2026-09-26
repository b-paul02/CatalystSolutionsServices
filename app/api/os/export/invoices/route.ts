import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { invoicesExport } from "@/lib/os/exports";
import { WorkError } from "@/lib/os/work";

// WP-50 · /api/os/export/invoices?month=YYYY-MM&format=csv|json
export async function GET(req: NextRequest) {
  try {
    const actor = await requireOrg();
    const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const r = await invoicesExport(actor, month, req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv");
    return new NextResponse(r.body, { headers: { "Content-Type": `${r.type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${r.name}"` } });
  } catch (e) { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
}
