import { DEAL_SIZE_BANDS, EXPECTED_DEALS_BANDS, PROSPECT_BANDS } from "./application-fields";

// Auto-score out of 100. This is a SORT ORDER for the admin queue and never an
// automatic decision — nothing in the codebase may approve or reject on it.

export type ScoreInput = {
  yearsExperience?: number | null;
  industries?: string[] | null;
  dealExamples?: string | null;
  typicalDealSizeBand?: string | null;
  prospects90dBand?: string | null;
  leadSources?: string[] | null;
  markets?: string[] | null;
  targetFamilies?: string[] | null;
  hoursPerWeek?: number | null;
  expectedDealsBand?: string | null;
  linkedinUrl?: string | null;
};

export type ScoreBreakdown = {
  industry_experience: number; // max 25
  verified_closed_deals: number; // max 25
  prospect_volume: number; // max 20
  market_fit: number; // max 15
  commitment_realism: number; // max 10
  references: number; // max 5
};

export const SCORE_MAX: ScoreBreakdown = {
  industry_experience: 25,
  verified_closed_deals: 25,
  prospect_volume: 20,
  market_fit: 15,
  commitment_realism: 10,
  references: 5,
};

export type Band = "fast_track" | "standard" | "low_priority";

export function bandOf(total: number): Band {
  if (total >= 70) return "fast_track";
  if (total >= 45) return "standard";
  return "low_priority";
}

export const BAND_LABEL: Record<Band, string> = {
  fast_track: "Fast-track",
  standard: "Standard",
  low_priority: "Low priority",
};

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
const indexScore = (bands: readonly string[], value: string | null | undefined, max: number) => {
  const i = bands.indexOf(value ?? "");
  return i < 0 ? 0 : Math.round((i / (bands.length - 1)) * max);
};

export function scoreApplication(a: ScoreInput): { total: number; breakdown: ScoreBreakdown; band: Band } {
  const years = a.yearsExperience ?? 0;
  const industries = a.industries?.length ?? 0;
  const breakdown: ScoreBreakdown = {
    // years of selling (up to 15) plus breadth of industries sold into (up to 10)
    industry_experience: clamp(Math.min(years, 10) * 1.5, 15) + clamp(industries * 3.5, 10),
    // a substantive written account of real closed deals (up to 15) plus the
    // size band they habitually close (up to 10)
    verified_closed_deals:
      clamp(Math.floor((a.dealExamples?.trim().length ?? 0) / 80) * 5, 15) +
      indexScore(DEAL_SIZE_BANDS, a.typicalDealSizeBand, 10),
    // live prospects (up to 12) plus how many ways they can reach them (up to 8)
    prospect_volume: indexScore(PROSPECT_BANDS, a.prospects90dBand, 12) + clamp((a.leadSources?.length ?? 0) * 2, 8),
    // markets they can actually sell in (up to 7) and programme families they fit (up to 8)
    market_fit: clamp((a.markets?.length ?? 0) * 4, 7) + clamp((a.targetFamilies?.length ?? 0) * 2.5, 8),
    // time committed vs deals promised — promising a lot on very few hours scores low
    commitment_realism: commitmentRealism(a.hoursPerWeek ?? 0, a.expectedDealsBand),
    // Partners are individuals: LinkedIn is the whole of this signal.
    references: a.linkedinUrl?.trim() ? 5 : 0,
  };
  for (const k of Object.keys(breakdown) as (keyof ScoreBreakdown)[]) {
    breakdown[k] = clamp(Math.round(breakdown[k]), SCORE_MAX[k]);
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total, breakdown, band: bandOf(total) };
}

/**
 * Hours committed against deals promised. The point is realism, not ambition:
 * "5+ a month" on two hours a week scores worse than "1–2 a month" on twenty.
 */
function commitmentRealism(hours: number, expectedBand: string | null | undefined): number {
  const ambition = EXPECTED_DEALS_BANDS.indexOf(expectedBand ?? "");
  if (hours <= 0 || ambition < 0) return 0;
  const hoursScore = clamp(hours / 2, 10); // 20h/week tops out
  const hoursNeeded = [4, 8, 16, 24][ambition];
  return hours >= hoursNeeded ? hoursScore : clamp(hoursScore * (hours / hoursNeeded), 10);
}
