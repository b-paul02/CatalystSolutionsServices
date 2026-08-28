// Rule-based dual scoring (blueprint §5.9): quality (record trustworthiness)
// and intent (buying signals). Client-editable weights, explanations included.
// Predictive/AI scoring waits for labeled outcomes — rule-based first, by design.

export type ScoringWeights = {
  quality: {
    hasName: number;
    hasEmail: number;
    hasPhone: number;
    emailVerified: number;
    phoneVerified: number;
    hasLocation: number;
    freshWithin7d: number;
    sourceForm: number; // self-submitted beats imported
    sourceAllocation: number;
  };
  intent: {
    base: number;
    qualifyingAnswer: number; // per answered qualifying field / b2c extras
    hasBudget: number;
    hasTimeline: number;
    engagedStatus: number; // reached engaged/qualified
    recentActivity7d: number;
  };
  hotThreshold: number;
  warmThreshold: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  quality: {
    hasName: 10, hasEmail: 15, hasPhone: 20, emailVerified: 15, phoneVerified: 10,
    hasLocation: 10, freshWithin7d: 10, sourceForm: 10, sourceAllocation: 5,
  },
  intent: {
    base: 20, qualifyingAnswer: 10, hasBudget: 15, hasTimeline: 15,
    engagedStatus: 20, recentActivity7d: 15,
  },
  hotThreshold: 70,
  warmThreshold: 40,
};

export type LeadForScoring = {
  firstName: string | null;
  email: string | null;
  phone: string | null;
  emailStatus: string;
  phoneStatus: string;
  city: string | null;
  country: string | null;
  source: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  b2c?: { productInterest: string | null; budgetBand: string | null; purchaseTimeline: string | null } | null;
};

export type ScoreResult = {
  quality: number;
  intent: number;
  label: "hot" | "warm" | "cold";
  explanation: { component: string; points: number }[];
};

const cap = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreLead(lead: LeadForScoring, weights: ScoringWeights = DEFAULT_WEIGHTS, now = new Date()): ScoreResult {
  const explanation: { component: string; points: number }[] = [];
  const add = (component: string, points: number) => {
    if (points !== 0) explanation.push({ component, points });
    return points;
  };
  const w = weights;

  let quality = 0;
  if (lead.firstName) quality += add("Has a name", w.quality.hasName);
  if (lead.email) quality += add("Has an email", w.quality.hasEmail);
  if (lead.phone) quality += add("Has a phone", w.quality.hasPhone);
  if (lead.emailStatus === "valid") quality += add("Email verified", w.quality.emailVerified);
  if (lead.phoneStatus === "valid") quality += add("Phone verified", w.quality.phoneVerified);
  if (lead.city || lead.country) quality += add("Location known", w.quality.hasLocation);
  if (now.getTime() - lead.createdAt.getTime() < 7 * 86_400_000) quality += add("Fresh (under 7 days)", w.quality.freshWithin7d);
  if (lead.source === "form") quality += add("Self-submitted", w.quality.sourceForm);
  if (lead.source === "allocation") quality += add("Verified inventory", w.quality.sourceAllocation);

  let intent = add("Base", w.intent.base);
  const extras = [lead.b2c?.productInterest, lead.b2c?.budgetBand, lead.b2c?.purchaseTimeline].filter(Boolean).length;
  if (extras > 0) intent += add(`Answered ${extras} profile question${extras > 1 ? "s" : ""}`, extras * w.intent.qualifyingAnswer);
  if (lead.b2c?.budgetBand) intent += add("Declared a budget", w.intent.hasBudget);
  if (lead.b2c?.purchaseTimeline) intent += add("Declared a timeline", w.intent.hasTimeline);
  if (["engaged", "qualified", "converted"].includes(lead.status)) intent += add("Actively engaged", w.intent.engagedStatus);
  if (now.getTime() - lead.updatedAt.getTime() < 7 * 86_400_000) intent += add("Recent activity", w.intent.recentActivity7d);

  const q = cap(quality);
  const i = cap(intent);
  const label = i >= weights.hotThreshold ? "hot" : i >= weights.warmThreshold ? "warm" : "cold";
  return { quality: q, intent: i, label, explanation };
}

export function parseWeights(json: string | null | undefined): ScoringWeights {
  if (!json) return DEFAULT_WEIGHTS;
  try {
    const parsed = JSON.parse(json) as Partial<ScoringWeights>;
    return {
      quality: { ...DEFAULT_WEIGHTS.quality, ...(parsed.quality ?? {}) },
      intent: { ...DEFAULT_WEIGHTS.intent, ...(parsed.intent ?? {}) },
      hotThreshold: parsed.hotThreshold ?? DEFAULT_WEIGHTS.hotThreshold,
      warmThreshold: parsed.warmThreshold ?? DEFAULT_WEIGHTS.warmThreshold,
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}
