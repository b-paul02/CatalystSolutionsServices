import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/audit/db";
import { PARTNER_COOKIE, createPartnerSession, verifyPassword } from "@/lib/partner/auth";
import { writeAudit } from "@/lib/partner/audit";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const bad = NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  if (typeof email !== "string" || typeof password !== "string") return bad;

  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { partner: true },
  });
  if (!user || user.disabledAt || !verifyPassword(password, user.passwordHash)) return bad;

  await writeAudit({
    actor: { userId: user.id, email: user.email, role: user.role as never, partnerId: user.partner?.id ?? null },
    entity: "user", entityId: user.id, action: "login",
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARTNER_COOKIE, createPartnerSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARTNER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
