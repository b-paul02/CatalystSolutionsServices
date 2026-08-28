import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { apiActor, apiError } from "@/lib/leados/apiAuth";
import { leadWhere } from "@/lib/leados/leadQuery";
import { createLead, type LawfulUse, type LeadInput } from "@/lib/leados/leadWrite";
import { sha256 } from "@/lib/leados/crypto";
import { logLosAudit } from "@/lib/leados/audit";
import { serializeLead } from "@/lib/leados/leadSerialize";

// GET /api/v1/leads — cursor pagination (?cursor=<id>&limit=50&type=&status=&q=)
export async function GET(req: NextRequest) {
  const actor = await apiActor(req);
  if (actor instanceof NextResponse) return actor;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const cursor = sp.get("cursor");
  const leads = await db.losLead.findMany({
    where: leadWhere(actor.orgId, { leadType: sp.get("type") ?? undefined, status: sp.get("status") ?? undefined, q: sp.get("q") ?? undefined }),
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { b2b: true, b2c: true, company: true },
  });
  const page = leads.slice(0, limit);
  return NextResponse.json({
    data: page.map(serializeLead),
    nextCursor: leads.length > limit ? page[page.length - 1].id : null,
  });
}

// POST /api/v1/leads — create (webhook input). Idempotency-Key honored.
export async function POST(req: NextRequest) {
  const actor = await apiActor(req);
  if (actor instanceof NextResponse) return actor;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_json", "Body must be JSON.");
  }
  const leadType = body.leadType === "b2b" ? "b2b" : body.leadType === "b2c" ? "b2c" : null;
  if (!leadType) return apiError(422, "invalid_lead_type", 'leadType must be "b2b" or "b2c".');

  // Idempotency: same key → return the previously created lead.
  const idemKey = req.headers.get("idempotency-key");
  if (idemKey) {
    const prior = await db.losLeadSourceRecord.findFirst({
      where: { orgId: actor.orgId, kind: "api", ref: `idem:${sha256(idemKey)}` },
    });
    if (prior?.leadId) {
      return NextResponse.json({ data: { id: prior.leadId }, idempotent: true }, { status: 200 });
    }
  }

  const lawfulUse = body.lawfulUse as LawfulUse | undefined;
  const result = await createLead({
    orgId: actor.orgId,
    leadType,
    input: body as LeadInput,
    source: "api",
    sourceRef: idemKey ? `idem:${sha256(idemKey)}` : `key:${actor.apiKeyId}`,
    lawfulUse,
    rawForProvenance: body,
  });
  if (result.outcome === "invalid") return apiError(422, "invalid_lead", result.problem);
  if (result.outcome === "duplicate") {
    return NextResponse.json({ data: { id: result.leadId }, duplicate: true }, { status: 200 });
  }
  await logLosAudit({ orgId: actor.orgId, actorType: "api_key", action: "leads.create", entity: "LosLead", entityId: result.leadId, data: { apiKeyId: actor.apiKeyId } });
  return NextResponse.json({ data: { id: result.leadId } }, { status: 201 });
}

