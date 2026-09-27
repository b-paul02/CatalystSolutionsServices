// API-key authentication for /api/v1. Bearer los_… keys, hashed at rest.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { sha256 } from "./crypto";
import { rateLimit } from "@/lib/partner/ratelimit";

export type ApiActor = { orgId: string; apiKeyId: string };

export async function apiActor(req: NextRequest): Promise<ApiActor | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token || !token.startsWith("los_")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Provide an API key: Authorization: Bearer los_…" } }, { status: 401 });
  }
  const key = await db.losApiKey.findUnique({ where: { keyHash: sha256(token) }, include: { org: true } });
  if (!key || key.revokedAt || key.org.status !== "active") {
    return NextResponse.json({ error: { code: "unauthorized", message: "Invalid or revoked API key." } }, { status: 401 });
  }
  if (!rateLimit(`api:${key.id}`, 120, 60_000)) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Too many requests." } }, { status: 429, headers: { "Retry-After": "60" } });
  }
  // Touch lastUsedAt at most once a minute.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    db.losApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  // same purchased-scope rule as the app: the leads API belongs to the CRM module
  const { entitlements } = await import("@/lib/os/entitlements");
  const ent = await entitlements(key.orgId);
  if (ent.accessMode === "revoked" || (!ent.modules.has("crm") && !ent.modules.has("lead_supply"))) {
    return NextResponse.json({ error: { code: "forbidden", message: "The leads API is not part of this workspace's scope." } }, { status: 403 });
  }
  return { orgId: key.orgId, apiKeyId: key.id };
}

export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
