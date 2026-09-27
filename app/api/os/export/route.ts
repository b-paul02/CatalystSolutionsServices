import { NextResponse } from "next/server";
import { LosAuthError, requireOrg } from "@/lib/leados/auth";
import { buildExport } from "@/lib/os/exporter";
import { WorkError } from "@/lib/os/work";

// Handover / portability: everything the client owns in one JSON file + the asset manifest.
// Available in read-only (handed-over) workspaces too.
export async function GET() {
  let actor;
  try { actor = await requireOrg("org.export"); } catch (e) {
    if (e instanceof LosAuthError && (e as { status?: number }).status !== 401) return new NextResponse("Forbidden.", { status: 403 });
    return new NextResponse("Sign in first.", { status: 401 });
  }
  try {
    const data = await buildExport(actor);
    return new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="growthos-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof WorkError) return new NextResponse(e.message, { status: 403 });
    throw e;
  }
}
