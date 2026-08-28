// Contact-point verification behind a provider interface (blueprint §5.4).
// Built-in: "basic-mx" email check (syntax + DNS MX). Paid providers slot in
// by adding to the registries; the waterfall tries providers in order.
import { promises as dns } from "node:dns";
import { normalizeEmail, normalizePhone } from "./leads";

export type VerifyResult = {
  result: "valid" | "risky" | "invalid" | "unknown";
  provider: string;
  detail?: Record<string, unknown>;
};

export type EmailVerifier = (email: string) => Promise<VerifyResult>;
export type PhoneVerifier = (phone: string) => Promise<VerifyResult>;

const mxCache = new Map<string, boolean>();

async function domainHasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

export const basicMxVerifier: EmailVerifier = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return { result: "invalid", provider: "basic-mx", detail: { reason: "syntax" } };
  const domain = normalized.split("@")[1];
  const hasMx = await domainHasMx(domain);
  return hasMx
    ? { result: "valid", provider: "basic-mx", detail: { mx: true } }
    : { result: "invalid", provider: "basic-mx", detail: { reason: "no-mx", domain } };
};

/** Format-only phone check for IN/US. A carrier-lookup provider can replace it. */
export const basicPhoneVerifier: PhoneVerifier = async (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return { result: "invalid", provider: "basic-format", detail: { reason: "format" } };
  return { result: "unknown", provider: "basic-format", detail: { normalized } };
};

// Waterfall registries — order matters; first non-"unknown" result wins.
const emailVerifiers: EmailVerifier[] = [basicMxVerifier];
const phoneVerifiers: PhoneVerifier[] = [basicPhoneVerifier];

export async function verifyEmail(email: string): Promise<VerifyResult> {
  for (const v of emailVerifiers) {
    const r = await v(email);
    if (r.result !== "unknown") return r;
  }
  return { result: "unknown", provider: "none" };
}

export async function verifyPhone(phone: string): Promise<VerifyResult> {
  for (const v of phoneVerifiers) {
    const r = await v(phone);
    if (r.result !== "unknown") return r;
  }
  return { result: "unknown", provider: "none" };
}
