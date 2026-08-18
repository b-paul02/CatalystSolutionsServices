// Custom-only low-level service presets + CustomPlan helpers.
// These NEVER appear on public pricing pages — only the admin plan builder
// imports them, to seed tiers on customer-specific plans (/plans/[token]).
// Prices are starting points; the admin edits them per customer.
import type { Program, Tier } from "@/lib/programs";

export const customPresets: Tier[] = [
  {
    label: "Fixed Project",
    name: "WordPress Website",
    positioning: "A professional WordPress site, built and launched fast.",
    whoFor: "Businesses that want a solid, editable website at an entry price.",
    deliverables: ["WordPress site (up to 6 pages)", "Mobile-responsive theme", "Contact / enquiry form", "Basic on-page SEO", "1 revision round", "Launch + handover"],
    guardrails: ["Up to 6 pages", "Stock theme, customized", "Hosting & domain client-paid"],
    setup: { in: "₹50,000", us: "$1,800" },
    setupLabel: "Project price",
  },
  {
    label: "Fixed Project",
    name: "Landing Page",
    positioning: "One high-converting page for a campaign or launch.",
    whoFor: "Businesses running ads or a launch that need a single focused page.",
    deliverables: ["1 custom landing page", "Enquiry / lead form", "Analytics wired in", "1 revision round"],
    guardrails: ["Single page", "Copy supplied by client"],
    setup: { in: "₹25,000", us: "$900" },
    setupLabel: "Project price",
  },
  {
    label: "Fixed Project",
    name: "Local SEO Setup",
    positioning: "Get found on Google in your area.",
    whoFor: "Local businesses that need their Google presence set up right.",
    deliverables: ["Google Business Profile setup / cleanup", "Local citations", "On-page local SEO", "Review link + workflow"],
    guardrails: ["1 location"],
    setup: { in: "₹30,000", us: "$1,200" },
    setupLabel: "Project price",
  },
];

// A CustomPlan's json parses into this — the Program shape, so /plans/[token]
// renders with the exact components /bundles/[slug] uses.
export function parsePlanProgram(json: string): Program | null {
  try {
    const p = JSON.parse(json);
    return p && typeof p.name === "string" && Array.isArray(p.tiers) ? (p as Program) : null;
  } catch {
    return null;
  }
}

export const planExpired = (plan: { status: string; expiresAt: Date | null }): boolean =>
  plan.status === "expired" || (!!plan.expiresAt && plan.expiresAt.getTime() < Date.now());
