import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { sha256 } from "@/lib/leados/crypto";
import { emitEvent } from "@/lib/os/automation/engine";

export const maxDuration = 60;
const MAX_BODY = 64 * 1024;

// Inbound webhook trigger. The unguessable token in the path IS the credential
// (stored hashed). The workspace comes from the workflow row — never the payload.
// A repeated delivery (same Idempotency-Key, or same body within a minute) runs once.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const wf = await db.cosWorkflow.findUnique({ where: { hookTokenHash: sha256(token) }, select: { id: true, orgId: true, status: true } });
  // same answer whether the token is wrong or the workflow is off — nothing to probe
  if (!wf || wf.status !== "active") return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const since = new Date(Date.now() - 60_000);
  if ((await db.cosWorkflowRun.count({ where: { workflowId: wf.id, createdAt: { gt: since } } })) >= 60) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  let body: unknown = raw;
  try { body = JSON.parse(raw); } catch { /* keep as text */ }
  const key = req.headers.get("idempotency-key") ?? createHash("sha256").update(`${raw}:${Math.floor(Date.now() / 60_000)}`).digest("hex");
  const runs = await emitEvent(wf.orgId, "trigger.webhook", { body, query: Object.fromEntries(req.nextUrl.searchParams) }, { eventKey: `hook:${key}`.slice(0, 120), onlyWorkflowId: wf.id });
  return NextResponse.json({ ok: true, accepted: runs.length > 0 }, { status: 202 });
}
