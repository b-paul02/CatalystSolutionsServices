import { NextRequest, NextResponse } from "next/server";
import { ForbiddenError, requireFinance } from "@/lib/partner/auth";
import { ledgerRows, minorToDecimalString, toCsv } from "@/lib/partner/ledger";

// This route sits OUTSIDE the /admin middleware matcher, so it guards itself.
// That is the point: authorization belongs in the handler, not in a route rule
// that a future refactor could quietly stop matching.

export async function GET(req: NextRequest) {
  try {
    await requireFinance();
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }

  const q = req.nextUrl.searchParams;
  const rows = await ledgerRows(
    {
      partnerId: q.get("partnerId") ?? undefined,
      state: q.get("state") ?? undefined,
      market: q.get("market") ?? undefined,
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
    },
    5000,
  );

  const csv = toCsv([
    ["Commission ID", "Partner", "Client", "Deal ID", "Market", "Base", "Rate applied", "Amount", "Currency",
     "State", "Created", "Accrued", "Payable", "Paid", "Payout ref", "Adjustment of", "Adjustment reason"],
    ...rows.map((r) => [
      r.id,
      r.partner.legalName,
      r.deal.client.legalName,
      r.deal.id,
      r.deal.market,
      minorToDecimalString(r.baseAmount),
      `${r.rateBp / 100}%`,
      minorToDecimalString(r.amount),
      r.currency,
      r.state,
      r.createdAt.toISOString(),
      r.accruedAt?.toISOString() ?? "",
      r.payableAt?.toISOString() ?? "",
      r.paidAt?.toISOString() ?? "",
      r.payoutRef ?? "",
      r.adjustmentOfId ?? "",
      r.adjustmentReasonCode ? `${r.adjustmentReasonCode}: ${r.adjustmentReason ?? ""}` : "",
    ]),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="catalyst-commissions-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
