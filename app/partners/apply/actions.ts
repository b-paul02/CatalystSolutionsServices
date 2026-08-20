"use server";

import { headers } from "next/headers";
import { db } from "@/lib/audit/db";
import { writeAudit } from "@/lib/partner/audit";
import { rateLimit } from "@/lib/partner/ratelimit";
import { scoreApplication } from "@/lib/partner/scoring";

// A draft is addressed by its unguessable statusToken, never by row id, and is
// only writable while submittedAt is null. That is the whole access model for
// this form — there is no account yet.

export type DraftFields = {
  fullName?: string; email?: string; phone?: string; country?: string; city?: string; linkedinUrl?: string;
  companyName?: string; companyWebsite?: string; entityType?: string; teamSize?: number | null;
  hasOwnDelivery?: boolean; yearsExperience?: number | null; industries?: string[];
  typicalDealSizeBand?: string; dealExamples?: string; prospects90dBand?: string; leadSources?: string[];
  expectedDealsBand?: string; markets?: string[]; targetFamilies?: string[]; hoursPerWeek?: number | null;
  whyCatalyst?: string;
};

const TEXT: (keyof DraftFields)[] = [
  "fullName", "email", "phone", "country", "city", "linkedinUrl", "companyName", "companyWebsite",
  "entityType", "typicalDealSizeBand", "dealExamples", "prospects90dBand", "expectedDealsBand", "whyCatalyst",
];
const LISTS: (keyof DraftFields)[] = ["industries", "leadSources", "markets", "targetFamilies"];
const NUMBERS: (keyof DraftFields)[] = ["teamSize", "yearsExperience", "hoursPerWeek"];

function clean(fields: DraftFields) {
  const data: Record<string, unknown> = {};
  for (const k of TEXT) if (typeof fields[k] === "string") data[k] = (fields[k] as string).trim().slice(0, 4000);
  for (const k of LISTS) if (Array.isArray(fields[k])) data[k] = JSON.stringify((fields[k] as string[]).slice(0, 40));
  for (const k of NUMBERS) {
    const v = fields[k];
    if (v === null || v === undefined || v === ("" as unknown)) data[k] = null;
    else if (Number.isFinite(Number(v))) data[k] = Math.max(0, Math.min(9999, Math.round(Number(v))));
  }
  if (typeof fields.hasOwnDelivery === "boolean") data.hasOwnDelivery = fields.hasOwnDelivery;
  return data;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** Step 1 creates the draft; later steps update it. Returns the draft token. */
export async function saveStep(token: string | null, fields: DraftFields): Promise<{ token: string }> {
  const data = clean(fields);

  if (!token) {
    const ip = await clientIp();
    if (!rateLimit(`apply:${ip}`, 5, 60 * 60 * 1000)) throw new Error("Too many applications from this network. Try again later.");
    const email = String(data.email ?? "").toLowerCase();
    if (!email.includes("@")) throw new Error("A valid email is required.");
    if (!String(data.fullName ?? "").trim()) throw new Error("Your name is required.");
    const created = await db.partnerApplication.create({
      data: { ...data, email, fullName: String(data.fullName) } as never,
    });
    return { token: created.statusToken };
  }

  const existing = await db.partnerApplication.findUnique({ where: { statusToken: token } });
  if (!existing || existing.deletedAt) throw new Error("Application not found.");
  if (existing.submittedAt) throw new Error("This application has already been submitted.");
  await db.partnerApplication.update({ where: { statusToken: token }, data: data as never });
  return { token };
}

/**
 * Final submit: honeypot, score, duplicate flags, confirmation email.
 * Duplicates are flagged for the reviewer, never blocked.
 */
export async function submitApplication(token: string, honeypot: string): Promise<{ token: string }> {
  const app = await db.partnerApplication.findUnique({ where: { statusToken: token } });
  if (!app || app.deletedAt) throw new Error("Application not found.");
  if (app.submittedAt) return { token };

  // Enforced here as well as in the form: the browser check is a convenience,
  // this is the one that actually holds.
  const missing = ([
    ["fullName", "your name"],
    ["email", "your email"],
    ["phone", "a phone number"],
    ["country", "your country"],
    ["city", "your city"],
  ] as const).filter(([field]) => !String(app[field] ?? "").trim());
  if (missing.length) throw new Error(`Please complete ${missing.map(([, label]) => label).join(", ")}.`);
  // Bots fill hidden fields; humans never see this one. Accept silently so the
  // bot cannot tell it was caught, but keep the row unsubmitted.
  if (honeypot.trim()) return { token };

  const ip = await clientIp();
  if (!rateLimit(`submit:${ip}`, 5, 60 * 60 * 1000)) throw new Error("Too many submissions from this network. Try again later.");

  const list = (v: string | null) => { try { return JSON.parse(v ?? "[]") as string[]; } catch { return []; } };
  const { total, breakdown } = scoreApplication({
    ...app,
    industries: list(app.industries),
    leadSources: list(app.leadSources),
    markets: list(app.markets),
    targetFamilies: list(app.targetFamilies),
  });

  const dupes = await db.partnerApplication.findMany({
    where: {
      id: { not: app.id },
      deletedAt: null,
      OR: [
        { email: app.email },
        ...(app.phone ? [{ phone: app.phone }] : []),
        ...(app.linkedinUrl ? [{ linkedinUrl: app.linkedinUrl }] : []),
      ],
    },
    select: { id: true, email: true, phone: true, linkedinUrl: true, createdAt: true },
  });
  const duplicateFlags = dupes.map((d) => ({
    applicationId: d.id,
    on: [d.email === app.email && "email", d.phone && d.phone === app.phone && "phone",
         d.linkedinUrl && d.linkedinUrl === app.linkedinUrl && "linkedin"].filter(Boolean),
    at: d.createdAt,
  }));

  const updated = await db.partnerApplication.update({
    where: { id: app.id },
    data: {
      status: "applied",
      score: total,
      scoreBreakdown: JSON.stringify(breakdown),
      duplicateFlags: duplicateFlags.length ? JSON.stringify(duplicateFlags) : null,
      submittedAt: new Date(),
    },
  });

  await writeAudit({
    actor: null, entity: "partner_application", entityId: app.id, action: "submitted",
    after: { status: updated.status, score: total }, reason: "Applicant submitted the form", ip,
  });

  // No email is sent. The applicant lands on their status page, which is the
  // link itself, and the admin sends an acknowledgement by hand.

  return { token: app.statusToken };
}
