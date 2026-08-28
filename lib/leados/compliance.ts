// Purpose-compatibility engine (blueprint §6.3) + prohibited-use rules.
// Pure and heavily unit-tested: the allocation engine and every outreach send
// call decideUse() before touching a B2C record.

export type UseContext = {
  // the record's permissions
  permittedPurposes: string[];
  permittedChannels: string[];
  retentionExpiresAt?: Date | null;
  withdrawnAt?: Date | null;
  suppressed?: boolean;
  // the intended use
  purpose: string;
  channel?: string; // omit for allocation-only checks (no contact yet)
  now?: Date;
};

export type UseDecision =
  | { decision: "allow" }
  | { decision: "reject"; reason: string }
  | { decision: "review"; reason: string };

// Purposes that never auto-allow: anything not an exact permitted match but
// arguably compatible goes to human review rather than silently through.
export function decideUse(ctx: UseContext): UseDecision {
  const now = ctx.now ?? new Date();
  if (ctx.suppressed) return { decision: "reject", reason: "suppressed" };
  if (ctx.withdrawnAt) return { decision: "reject", reason: "consent_withdrawn" };
  if (ctx.retentionExpiresAt && ctx.retentionExpiresAt <= now) {
    return { decision: "reject", reason: "retention_expired" };
  }
  if (PROHIBITED_PURPOSES.has(ctx.purpose)) {
    return { decision: "reject", reason: "prohibited_purpose" };
  }
  if (ctx.permittedPurposes.length === 0) {
    return { decision: "reject", reason: "no_permitted_purposes" };
  }
  if (!ctx.permittedPurposes.includes(ctx.purpose)) {
    // Compatible-purpose escalation: related but not identical → human review.
    if (COMPATIBLE.some(([a, b]) => (a === ctx.purpose && ctx.permittedPurposes.includes(b)))) {
      return { decision: "review", reason: "compatible_purpose_needs_review" };
    }
    return { decision: "reject", reason: "purpose_not_permitted" };
  }
  if (ctx.channel !== undefined) {
    if (!ctx.permittedChannels.includes(ctx.channel)) {
      return { decision: "reject", reason: "channel_not_permitted" };
    }
  }
  return { decision: "allow" };
}

/** [intended, permitted] pairs where the intended purpose MAY be compatible. */
const COMPATIBLE: [string, string][] = [
  ["service_updates", "sales_contact"],
  ["sales_contact", "marketing"],
];

// Blueprint §6.5 — uses the platform refuses outright.
export const PROHIBITED_PURPOSES = new Set([
  "discrimination",
  "harassment",
  "political_profiling",
  "eligibility_decision", // employment, housing, credit, insurance
  "child_targeting",
  "sensitive_targeting", // health, religion, caste, sexuality, precise location
  "identity_fraud",
]);

// Standard purpose codes used across campaigns and imports.
export const PURPOSE_CODES = ["sales_contact", "service_updates", "marketing", "survey"] as const;
export const CHANNEL_CODES = ["call", "whatsapp", "sms", "email"] as const;

// ── prohibited form fields (used by import mapping + form builder) ───────────
const SENSITIVE_FIELD_PATTERNS = [
  /religion/i, /caste/i, /aadhaar/i, /\bpan\b/i, /passport/i, /health/i, /medical/i,
  /disability/i, /sexual/i, /political/i, /salary.?slip/i, /bank.?account/i, /card.?number/i, /cvv/i, /\bssn\b/i,
];

export function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((p) => p.test(name));
}
