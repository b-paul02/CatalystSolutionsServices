import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const message = String(data.message ?? "").trim();

  // Validate at the trust boundary.
  if (!name || name.length > 200) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

  // ponytail: leads are logged server-side. Wire to email/CRM (e.g. Resend, RESEND_API_KEY) when credentials exist.
  console.log("New consultation request:", {
    name,
    email,
    company: String(data.company ?? ""),
    website: String(data.website ?? ""),
    service: String(data.service ?? ""),
    timeline: String(data.timeline ?? ""),
    message,
  });

  return NextResponse.json({ ok: true });
}
