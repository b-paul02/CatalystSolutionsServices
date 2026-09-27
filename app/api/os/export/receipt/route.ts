import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/leados/auth";
import { signatureReceipt } from "@/lib/os/exports";
import { WorkError } from "@/lib/os/work";

// WP-51 · /api/os/export/receipt?contractId= — signed HTML receipt of the client's signature
export async function GET(req: NextRequest) {
  try {
    const actor = await requireOrg();
    const r = await signatureReceipt(actor, req.nextUrl.searchParams.get("contractId") ?? "");
    return new NextResponse(r.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="signature-receipt-${r.facts.contractId}.html"`, "X-Content-Type-Options": "nosniff" } });
  } catch (e) { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
}
