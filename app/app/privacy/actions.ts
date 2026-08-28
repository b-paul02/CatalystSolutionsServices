"use server";

// Public data-subject request intake (blueprint §6.4). No auth — rate-limited,
// identity verified by possession of the contact point (emailed link).
import { headers } from "next/headers";
import { db } from "@/lib/audit/db";
import { rateLimit } from "@/lib/partner/ratelimit";
import { randomToken, sha256 } from "@/lib/leados/crypto";
import { contactHashes } from "@/lib/leados/suppression";
import { normalizeEmail, normalizePhone } from "@/lib/leados/leads";
import { APP_URL, sendLosMail } from "@/lib/leados/email";
import type { FormState } from "../(auth)/actions";

const KINDS = ["access", "correction", "deletion", "objection"];

export async function submitPrivacyRequest(_prev: FormState, form: FormData): Promise<FormState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`los-privacy:${ip}`, 5, 60 * 60_000)) {
    return { error: "Too many requests. Try again later." };
  }
  const kind = String(form.get("kind") ?? "");
  if (!KINDS.includes(kind)) return { error: "Pick a request type." };
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!email && !phone) return { error: "Enter the email address or phone number your request is about." };
  const details = String(form.get("details") ?? "").trim().slice(0, 2000) || null;

  const token = randomToken();
  await db.losPrivacyRequest.create({
    data: {
      kind,
      email,
      phone,
      contactHashes: JSON.stringify(contactHashes(email, phone)),
      details,
      status: email ? "identity_verification" : "received",
      verifyTokenHash: email ? sha256(token) : null,
      dueAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  if (email) {
    const link = `${APP_URL}/privacy/verify/${token}`;
    const mail = await sendLosMail({
      to: email,
      subject: "Confirm your privacy request",
      text: `We received a ${kind} request about this email address.\n\nConfirm it was you:\n${link}\n\nIf you didn't make this request, ignore this email.`,
      link,
    });
    return {
      ok: "Request received. Check your email to confirm your identity — we can only proceed after confirmation.",
      devLink: mail.devLink,
    };
  }
  return { ok: "Request received. Our team will contact you to verify your identity before proceeding." };
}

export async function verifyPrivacyRequest(token: string): Promise<boolean> {
  const row = await db.losPrivacyRequest.findUnique({ where: { verifyTokenHash: sha256(token) } });
  if (!row || row.identityVerifiedAt) return Boolean(row?.identityVerifiedAt);
  await db.losPrivacyRequest.update({
    where: { id: row.id },
    data: { identityVerifiedAt: new Date(), status: "in_progress" },
  });
  return true;
}
