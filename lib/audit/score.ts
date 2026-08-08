// Gate 1 qualification scoring per Context/qualification-checklist.md. User never sees this.
import type { ScrapeResult } from "./scrape";

export type Intake = {
  goal: string;
  businessModel: string;
  services: string[];
  budget: string; // band label
  timeline: string;
  decision: string;
  teamSize?: string;
  competitors?: string; // optional free-text competitor names (Phase 2 discovery seed)
  stage?: string; // no-website flow: Idea | Trading offline | Recently launched
  presenceLinks?: string; // no-website flow: GBP / social links, free text
};

const THRESHOLDS = { priority: 65, standard: 40 }; // configurable

export function scoreG1(intake: Intake, scrape: ScrapeResult & { noWebsite?: boolean }, email: string) {
  const c: Record<string, number> = {};

  // Service fit — 25
  const real = intake.services.filter((s) => s !== "not-sure");
  c.fit = real.length > 0 ? 25 : intake.services.includes("not-sure") && scrape.ok ? 15 : 5;

  // Budget context — 25
  c.budget =
    { "Under $1k / month": 15, "$1k–$3k / month": 15, "$3k–$10k / month": 25, "Over $10k / month": 25, "Prefer not to say": 12 }[intake.budget] ?? 8;

  // Timeline urgency — 20
  c.timeline = { "ASAP": 20, "Within 1 month": 16, "1–3 months": 12, "Just exploring": 6 }[intake.timeline] ?? 6;

  // Decision authority — 15
  c.decision = { "Just me": 15, "Me + a partner": 15, "A team": 10 }[intake.decision] ?? 7;

  // Business maturity — 15, 3 pts each capped.
  // No-website leads earn maturity from answers instead of scrape signals (greenfield ≠ dead).
  const s = scrape.signals;
  const maturity = scrape.noWebsite
    ? (["Trading offline", "Recently launched"].includes(intake.stage ?? "") ? 6 : 0) +
      ((intake.presenceLinks ?? "").trim() ? 3 : 0) +
      (["11–50", "51–200", "200+"].includes(intake.teamSize ?? "") ? 3 : 0)
    : (scrape.ok && scrape.pages.length > 1 ? 3 : 0) +
      (scrape.pages.some((p) => /client|customer|review|testimonial|case stud/i.test(p.text)) ? 3 : 0) +
      (s.hasAnalytics ? 3 : 0) +
      (s.hasBlog ? 3 : 0) +
      (["11–50", "51–200", "200+"].includes(intake.teamSize ?? "") ? 3 : 0);
  c.maturity = Math.min(15, maturity);

  const score = c.fit + c.budget + c.timeline + c.decision + c.maturity;
  const tag = score >= THRESHOLDS.priority ? "priority" : score >= THRESHOLDS.standard ? "standard" : "nurture";

  // Red flags — reviewer alert, never auto-reject
  const flags: string[] = [];
  if (/@(mailinator|guerrillamail|10minutemail|tempmail|yopmail)\./i.test(email)) flags.push("Disposable email domain");
  if (!scrape.ok && !scrape.noWebsite) flags.push("Site could not be scraped (parked/dead?)");
  if (real.length === 0 && !intake.services.includes("not-sure")) flags.push("No service selected");

  return { score, components: c, tag, flags };
}
