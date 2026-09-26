import { NextRequest, NextResponse } from "next/server";
import { handleResendEvent, verifyResendWebhook } from "@/lib/os/emailDomain";

// WP-31 · Resend bounce / complaint events → suppression. Signature verified against the raw body.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyResendWebhook(raw, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") })) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  let event; try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }
  return NextResponse.json({ received: true, ...(await handleResendEvent(event)) });
}
