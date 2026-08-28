import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { apiActor, apiError } from "@/lib/leados/apiAuth";
import { serializeLead } from "@/lib/leados/leadSerialize";
import { LEAD_STATUSES } from "@/lib/leados/leads";
import { logLosAudit } from "@/lib/leados/audit";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await apiActor(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await ctx.params;
  const lead = await db.losLead.findFirst({
    where: { id, orgId: actor.orgId, deletedAt: null },
    include: { b2b: true, b2c: true, company: true },
  });
  if (!lead) return apiError(404, "not_found", "Lead not found.");
  return NextResponse.json({ data: serializeLead(lead) });
}

// PATCH /api/v1/leads/:id — status and basic fields only.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await apiActor(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await ctx.params;
  const lead = await db.losLead.findFirst({ where: { id, orgId: actor.orgId, deletedAt: null } });
  if (!lead) return apiError(404, "not_found", "Lead not found.");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_json", "Body must be JSON.");
  }
  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!(LEAD_STATUSES as readonly string[]).includes(body.status)) {
      return apiError(422, "invalid_status", `status must be one of ${LEAD_STATUSES.join(", ")}.`);
    }
    data.status = body.status;
  }
  for (const k of ["firstName", "lastName", "city", "state", "country", "language"]) {
    if (typeof body[k] === "string") data[k] = (body[k] as string).slice(0, 200) || null;
  }
  if (Object.keys(data).length === 0) return apiError(422, "no_fields", "Nothing to update.");
  const updated = await db.losLead.update({
    where: { id },
    data,
    include: { b2b: true, b2c: true, company: true },
  });
  await logLosAudit({ orgId: actor.orgId, actorType: "api_key", action: "leads.update", entity: "LosLead", entityId: id, data: { apiKeyId: actor.apiKeyId, fields: Object.keys(data) } });
  return NextResponse.json({ data: serializeLead(updated) });
}
