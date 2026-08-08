import type { Scorecard } from "./scorecard";
import type { CompetitorsResult } from "./competitors";

export type Finding = {
  text: string;
  evidence: string;
  severity: "high" | "medium";
  // only from Context/benchmarks.md — never invented
  stat?: { text: string; source: string };
};
export type Route = {
  name: string;
  involves: string;
  effort: "Low" | "Medium" | "High";
  milestones: string;
  if_nothing: string;
  tradeoffs: string;
  diyable: boolean;
  best_if: string;
  timeline_weeks: { min: number; max: number };
};
export type ReportJSON = {
  business_name: string;
  snapshot: string;
  key_points: string[]; // "if you only read one thing" — 3 bullets
  findings: Finding[];
  icps: { name: string; body: string }[];
  routes: Route[];
  quick_wins: string[];
  assumptions: string[];
  cta: string;
  // written by Synthesis only when competitor data exists; claims must trace to the scorecards
  comparison?: {
    where_you_lag: string[];
    where_you_lead: string[];
  } | null;
  // injected by code after synthesis (deterministic), never by the model
  scorecard?: Scorecard | null;
  competitor_data?: CompetitorsResult | null;
};
