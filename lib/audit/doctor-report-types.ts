import type { Scorecard } from "./scorecard";
import type { PresenceScan } from "./doctor-presence";

export type DoctorReportJSON = {
  doctor_name: string;
  specialty: string;
  institution: string;
  location: string;
  executive_summary: string; // 2-3 short paragraphs, \n\n separated
  // written by synthesis STRICTLY from the presence scan; omitted when no scan ran
  online_presence?: {
    intro: string; // one sentence: what we did (searched as a patient would, date)
    found: { where: string; what: string; status: "strength" | "gap" | "neutral" }[];
    not_found: string[]; // phrased "did not appear in our searches"
  } | null;
  check_first: string[]; // "what we recommend checking first" bullets
  key_findings: { area: string; what_we_know: string; interpretation: string }[];
  recommended_solution: {
    name: string; // e.g. "Catalyst Doctor Digital Authority & AI-Readiness"
    components: { component: string; delivery: string }[];
  };
  why_relevant: string;
  roadmap: { stage: string; action: string; output: string }[];
  next_step: string; // one closing line — the single CTA
  // injected by code; never written by the model
  scorecard?: Scorecard | null; // only when the doctor shared their own website URL
  presence_scan?: PresenceScan | null; // raw scan evidence, shown to the reviewer
};
