// The agent graph. Plain TypeScript: Promise.all fan-out → Synthesis → Critic loop → ReviewerArtifact.
// Every node = one claude-sonnet-4-6 call with its own small system prompt and only the context it needs.
import { callClaudeJSON } from "./anthropic";
import { contextFile } from "./context";
import { db, logEvent } from "./db";
import { pickModules } from "./modules";
import { fetchPageSpeed } from "./pagespeed";
import { buildScorecard } from "./scorecard";
import { discoverAndMeasureCompetitors, type CompetitorsResult } from "./competitors";
import type { ReportJSON } from "./report-types";

// Report-generation system prompt (embedded verbatim per spec).
const REPORT_SYSTEM = `You are the analysis engine behind Catalyst Solution Services' business audit tool.
You produce audit reports that a senior growth consultant would stand behind.
VOICE
Write like an experienced human consultant: plain, direct, specific. Short
sentences. No marketing adjectives, no hype, no "unlock/elevate/empower/
seamless/game-changing". British-neutral English. Address the reader as "you".
EVIDENCE DISCIPLINE
Every finding must trace to something in the evidence pack (scraped content,
user answers). If evidence is missing for a claim, do not make the claim —
add it to the internal "missing information" list instead. Never invent
metrics, competitor names, or statistics.
UNDER-COMMIT, OVER-DELIVER — these rules are absolute:
- Milestones are deliverable-based, never outcome-guaranteed. "Landing page
  live and tracking installed by week 3" is valid. "40% more leads by week 3"
  is banned.
- All timelines are ranges, and you must use conservative estimates: take
  your realistic estimate and extend it ~30% before writing it down. It is
  always better that the business is surprised by speed than by delay.
- Outcomes are phrased as directional with conditions: "typically improves
  X, provided Y" — never promised. Never promise rankings, revenue figures,
  follower counts, or lead volumes.
- SEO and organic routes must state honestly that meaningful results take
  3–6+ months. Paid routes must state that the first 2–4 weeks are learning/
  calibration, not performance.
- Quick wins must be genuinely completable within 30 days by a small team.
  If in doubt, it is not a quick win.
- Scope each route with slightly fewer promised elements than you believe
  possible. Leave room to over-deliver.
- State assumptions explicitly wherever you relied on one.
REALISM CHECKS BEFORE OUTPUT
- Would a skeptical business owner find every finding specific to THEIR
  business? If any sentence could appear in anyone's report, rewrite or cut.
- Is every milestone achievable by a 2–5 person business with limited time?
- Does any sentence sell Catalyst? Remove it. The report's only persuasion
  is its quality.
OUTPUT
Return strict JSON matching the provided report schema. The internal_review
object (qualification snapshot, recommended Catalyst workstreams mapped to
the 13 families, missing information, recommended commercial model per the
decision tree, assumptions and risks, suggested discovery agenda) is for
the Catalyst reviewer only and must never leak into user-facing sections.`;

type ModuleFindings = {
  module: string;
  findings: { text: string; evidence: string }[];
  quick_win_candidates: string[];
  route_elements: { element: string; effort: string; public_timeline: string; notes?: string }[];
};

type ICPOutput = { icps: { name: string; body: string }[] };

type CriticVerdict = { pass: boolean; violations: string[] };

const CRITIC_CHECKLIST = `1. Every finding cites evidence traceable to the evidence pack — no invented metrics, competitors, or statistics.
2. Zero outcome promises: no ranking, revenue, lead-volume, or follower guarantees anywhere.
3. Every milestone is deliverable-based and achievable by a 2–5 person business; timelines are ranges.
4. SEO/organic routes state 3–6+ month horizons; paid routes state a 2–4 week calibration period.
5. Every quick win is genuinely completable inside 30 days.
6. No sentence sells Catalyst, no superlatives, no prices, exactly one CTA at the end (the cta field only).
7. No generic filler — every finding is specific to THIS business.
8. Every finding's "text" contains at least one number OR a direct quote/named element from the evidence pack (a page, a phrase from the site, a measured value).
9. Every "stat" attached to a finding appears verbatim (or near-verbatim) in the BENCHMARK LIBRARY provided — any statistic not in that library or the evidence pack is a violation. Stats from sources marked "(directional)" must be phrased as "industry studies suggest", not as fact.
10. No internal system language anywhere user-facing: field names (hasBlog, formCount), question codes (LG-1, SEO-2), or words like "scraped signals", "module answers", "evidence pack". Evidence must read as plain consultant citations (where seen, what was observed, when).
11. If a "comparison" section exists: every lag/lead claim must trace to the VERIFIED COMPETITOR MEASUREMENTS provided; competitors may only be characterised by what was measured on their sites.
12. Zero claims about competitor traffic, search rankings, revenue, student/customer numbers, or popularity — none of these were measured. If no competitor measurements were provided, any mention of a named competitor is a violation.`;

export async function runPipeline(leadId: string, rejectionReason?: string): Promise<void> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { evidencePack: true } });
  const pack = lead.evidencePack!;
  const scraped = JSON.parse(pack.scraped);
  const profile = pack.profile ? JSON.parse(pack.profile) : {};
  const intake = pack.intake ? JSON.parse(pack.intake) : {};
  const moduleAnswers = pack.moduleAnswers ? JSON.parse(pack.moduleAnswers) : {};

  await db.lead.update({ where: { id: leadId }, data: { status: "generating" } });
  await logEvent(leadId, "pipeline_started");

  const rubrics = contextFile("estimate-rubrics.md");
  const benchmarks = contextFile("benchmarks.md");
  const modules = pickModules(intake.services ?? [], intake.goal ?? "");
  const noWebsite = !!scraped.noWebsite;

  // PageSpeed runs concurrently with the fan-out (PSI takes 15–45s); null on failure/no site.
  const pageSpeedPromise = scraped.ok && lead.url ? fetchPageSpeed(lead.url) : Promise.resolve(null);

  // Competitor discovery + verification + measurement, in parallel with the analysts.
  // Website-having leads only — there is nothing symmetric to compare otherwise.
  const profileText = `${profile.business_name ?? ""} — ${profile.sells ?? ""} Serves: ${profile.serves ?? ""} Industry: ${profile.industry ?? ""}`;
  const competitorsPromise: Promise<CompetitorsResult | null> = scraped.ok && lead.url
    ? discoverAndMeasureCompetitors({ profileText, clientUrl: lead.url, clientProvided: intake.competitors })
        .catch((e) => { console.error("competitor discovery failed", e); return null; })
    : Promise.resolve(null);

  const evidencePack = JSON.stringify({ scraped, confirmed_profile: profile, intake, module_answers: moduleAnswers }, null, 1);

  // ---- Layer 1: parallel fan-out ----
  const analystCalls = modules.map((m) =>
    callClaudeJSON<ModuleFindings>(
      `You are the ${m.title} analyst inside a business audit pipeline. You know nothing about other service areas.
Analyse ONLY your domain. Ground every finding in the evidence pack and quote its source in the "evidence" field.
Use the estimate rubric below for every effort level and timeline — use the PUBLIC (padded) timelines only, never internal figures or prices.
Where evidence is missing for a multiplier, assume it applies and note the assumption — never assume the cheap case.
${REPORT_SYSTEM}`,
      `EVIDENCE PACK:\n${evidencePack}\n\nESTIMATE RUBRICS (use the "${m.rubric}" module section):\n${rubrics}\n\nReturn JSON: {"module": "${m.key}", "findings": [{"text","evidence"}] (2-4 items), "quick_win_candidates": [strings], "route_elements": [{"element","effort","public_timeline","notes"}]}`
    ).then(async (r) => { await logEvent(leadId, "node_done", { node: `analyst:${m.key}` }); return r; })
  );

  const icpCall = callClaudeJSON<ICPOutput>(
    `You build Ideal Customer Profiles for a business audit. Follow the quality bar and rules in the examples file exactly: concrete trigger events, buyer-voiced objections, behaviour-connected channels. Mark low-confidence fields "to validate in discovery". 2–3 segments, each 150–250 words, formatted as short markdown paragraphs with bold field labels.
${REPORT_SYSTEM}`,
    `EVIDENCE PACK:\n${evidencePack}\n\nICP QUALITY BAR:\n${contextFile("icp-examples.md")}\n\nBusiness model: ${intake.businessModel ?? "unknown"}. If "Both", lead with the higher-revenue-potential side.\n\nReturn JSON: {"icps":[{"name","body"}]}`
  ).then(async (r) => { await logEvent(leadId, "node_done", { node: "icp" }); return r; });

  const [icp, pagespeed, competitors, ...analystResults] = await Promise.all([icpCall, pageSpeedPromise, competitorsPromise, ...analystCalls]);
  const scorecard = buildScorecard(scraped, pagespeed, intake, moduleAnswers);
  if (pagespeed) await logEvent(leadId, "node_done", { node: "pagespeed", score: pagespeed.performanceScore });
  const comparableCompetitors = competitors && competitors.competitors.length >= 2 ? competitors : null;
  await logEvent(leadId, "node_done", { node: "competitors", source: competitors?.source ?? "none", found: competitors?.competitors.length ?? 0 });
  await db.evidencePack.update({ where: { leadId }, data: { competitors: JSON.stringify(competitors) } }).catch(() => {});
  // compact view for the LLM nodes: subscores + failed checks only, keeps context small
  const competitorSummary = comparableCompetitors
    ? comparableCompetitors.competitors.map((c) => ({
        name: c.name, url: c.url, type: c.type, why: c.why,
        overall: c.scorecard?.overall,
        subscores: c.scorecard?.subscores.map((s) => `${s.label}: ${s.score}`),
        notable_passes: c.scorecard?.checks.filter((x) => x.pass).slice(0, 8).map((x) => x.label),
        failed_checks: c.scorecard?.checks.filter((x) => !x.pass).map((x) => x.label),
      }))
    : null;

  // ---- Layer 2: Synthesis (+ Layer 3 Critic loop, max 2 retries) ----
  const synthSystem = `You are the Synthesis node. You write the single user-facing audit report from the analysts' findings and ICP segments. Dedupe findings, sequence route elements into 2–3 coherent routes (chain dependent elements sequentially), and write prose at the quality bar of the sample report. At least one route must be partially DIY-able.
SPECIFICITY RULES (hard requirements):
- Every finding's "text" must contain at least one concrete number OR a direct quote/named element from the evidence pack (a page path, a phrase from the site, a measured value). If neither exists, the finding is too generic — cut it.
EVIDENCE LANGUAGE (hard requirements):
- Evidence citations are written for the business owner, never in system language. BANNED in any user-facing field: internal field names (hasBlog, hasAnalytics, formCount, scraped signals, module_answers), question codes (LG-1, SEO-2, WEB-3), and the words "intake", "module", "evidence pack", "scrape/scraped".
- Write evidence as a plain citation a consultant would give: WHERE it was seen (page or answer), WHAT was observed, WHEN. Example: "Your homepage and course pages, checked ${new Date().toISOString().slice(0, 10)} — no blog or article section exists." or "Your answer during intake: cost per lead is not tracked today."
- You may attach a supporting "stat" to a finding ONLY from the BENCHMARK LIBRARY below, quoted with its source. If no benchmark fits, omit the stat. Stats marked "(directional)" must be phrased as "industry studies suggest". Never invent, round, or extrapolate a statistic.
- The SCORECARD numbers provided (computed by code, shown to the user above your prose) are trusted evidence — reference them in findings where relevant.
${noWebsite ? "- This business has NO WEBSITE yet. Do not invent site findings. Findings come from their answers and any online-presence links. Routes must lean foundation-first: online foundation (site + tracking) before traffic or visibility spend." : ""}
${competitorSummary ? `COMPETITOR COMPARISON RULES:
- Verified competitor measurements are provided. Write the "comparison" object: "where_you_lag" and "where_you_lead" (2-4 items each, when supported by the data).
- Every comparison claim must trace to a listed check or score — e.g. "Two of three competitors publish a blog; you don't." Never claim anything about competitor traffic, rankings, revenue, or student numbers — those were not measured.
- Include where the client LEADS as honestly as where they lag. This is a comparison, not a fear pitch.
- You may reference competitors by name in findings or routes where the measurements support it.` : `- No verified competitor data is available for this business. Do not name or characterise any competitor. Omit the "comparison" field entirely.`}
${REPORT_SYSTEM}\n\nBENCHMARK LIBRARY:\n${benchmarks}\n\nBRAND VOICE RULES:\n${contextFile("brand-voice.md")}\n\nSAMPLE REPORT (quality bar):\n${contextFile("sample-report.md")}`;

  const synthUser = (violations?: string[]) =>
    `EVIDENCE PACK:\n${evidencePack}\n\nSCORECARD (deterministic, already shown to user):\n${JSON.stringify(scorecard, null, 1)}\n${competitorSummary ? `\nVERIFIED COMPETITOR MEASUREMENTS (same check battery as the client):\n${JSON.stringify(competitorSummary, null, 1)}\n` : ""}\nANALYST OUTPUTS:\n${JSON.stringify(analystResults, null, 1)}\n\nICP SEGMENTS:\n${JSON.stringify(icp.icps, null, 1)}\n` +
    (violations?.length ? `\nA reviewer rejected your previous draft for these violations. Fix every one:\n- ${violations.join("\n- ")}\n` : "") +
    `\nReturn JSON: {"business_name","snapshot" (2-3 sentences),"key_points" (exactly 3 short bullets — the "if you only read one thing" summary),"findings":[{"text","evidence","severity":"high|medium","stat":{"text","source"} (optional, benchmark library only)}] (4-7),"icps":[{"name","body"}],"routes":[{"name","involves","effort":"Low|Medium|High","milestones","if_nothing","tradeoffs","diyable":bool,"best_if" (one sentence: when this route is the right pick),"timeline_weeks":{"min":int,"max":int} (padded public range to first full delivery)}] (2-3),"quick_wins":[strings] (3-5),"assumptions":[strings],${competitorSummary ? `"comparison":{"where_you_lag":[strings],"where_you_lead":[strings]},` : ""}"cta" (one sentence offering a free 30-minute session)}`;

  let report: ReportJSON | null = null;
  let verdict: CriticVerdict = { pass: false, violations: rejectionReason ? [`Human reviewer rejected the previous version: ${rejectionReason}`] : [] };
  const criticLog: CriticVerdict[] = [];

  // Deterministic lint: internal system language must never reach the user. The LLM critic
  // is told the same rule, but code doesn't miss.
  const JARGON = /\bhas[A-Z]\w+\b|\bformCount\b|\bhomepageH1Count\b|\bimagesMissingAlt\b|module_answers|evidence pack|scraped signals?|\b(LG|SEO|WEB|STR|ADS|SOC|CON|BRD|AIA|APP|ECOM|DATA|LOC|RET)-\d\b/;
  const lintJargon = (r: ReportJSON): string[] =>
    JSON.stringify([r.snapshot, r.key_points, r.findings, r.routes, r.quick_wins, r.assumptions, r.icps, r.cta, r.comparison])
      .match(new RegExp(JARGON, "g"))
      ?.map((m) => `Internal system language "${m}" appears in user-facing text — rewrite as a plain consultant citation (where seen, what was observed, when).`) ?? [];

  for (let attempt = 0; attempt <= 2; attempt++) {
    report = await callClaudeJSON<ReportJSON>(synthSystem, synthUser(verdict.violations), 8192);
    await logEvent(leadId, "node_done", { node: "synthesis", attempt });

    const jargonViolations = [...new Set(lintJargon(report))];

    // Critic: fresh context — sees ONLY the draft + checklist + evidence pack for traceability.
    verdict = await callClaudeJSON<CriticVerdict>(
      `You are a strict compliance critic for business audit reports. You validate a draft report against a checklist. You have no stake in the report passing. Be adversarial: if a milestone promises an outcome, a timeline is a single number instead of a range, a quick win cannot realistically be done in 30 days, or a finding is generic filler, fail it. Return JSON {"pass": boolean, "violations": [specific strings naming the offending section and sentence]}.`,
      `CHECKLIST:\n${CRITIC_CHECKLIST}\n\nBENCHMARK LIBRARY (the only permitted stats):\n${benchmarks}\n${competitorSummary ? `\nVERIFIED COMPETITOR MEASUREMENTS:\n${JSON.stringify(competitorSummary, null, 1)}\n` : "\nNO COMPETITOR MEASUREMENTS WERE PROVIDED.\n"}\nEVIDENCE PACK (for traceability checks):\n${evidencePack}\n\nDRAFT REPORT:\n${JSON.stringify(report, null, 1)}`
    );
    verdict = { pass: verdict.pass && jargonViolations.length === 0, violations: [...verdict.violations, ...jargonViolations] };
    criticLog.push(verdict);
    await logEvent(leadId, "critic_verdict", verdict);
    if (verdict.pass) break;
  }

  const reportStatus = verdict.pass ? "pending" : "needs_attention";

  // ---- Layer 4: ReviewerArtifact ----
  const artifact = await callClaudeJSON<Record<string, unknown>>(
    `You generate the INTERNAL reviewer artifact (never user-facing) for a business audit, following the Part 4 post-interview summary schema below. The "missing_information" list doubles as the suggested discovery-call agenda. Apply the commercial-model decision tree from the operating model and record the Q1–Q3 logic.
PART 4 SCHEMA + QUESTIONNAIRE CONTEXT:\n${contextFile("questionnaire.md").slice(contextFile("questionnaire.md").indexOf("## Part 4"))}\n\nOPERATING MODEL:\n${contextFile("operating-model.md")}`,
    `EVIDENCE PACK:\n${evidencePack}\n\nFINAL REPORT:\n${JSON.stringify(report, null, 1)}\n\nReturn JSON with keys: qualification_summary, recommended_workstreams (each with evidence + tag quick_win|core_build|optimize_scale), missing_information (each with owner + suggested discovery question), commercial_model_recommendation (with q1/q2/q3 answers + logic), required_roles, assumptions_dependencies_risks, blueprint_inputs.`,
    8192
  );
  await logEvent(leadId, "node_done", { node: "artifact" });

  // ---- persist (scorecard + competitor data injected by code — the model never writes them) ----
  if (report) {
    report.scorecard = scorecard;
    report.competitor_data = comparableCompetitors;
    if (!comparableCompetitors) report.comparison = null; // never keep narrative without its data
  }
  await db.report.upsert({
    where: { leadId },
    create: { leadId, json: JSON.stringify(report), status: reportStatus, criticLog: JSON.stringify(criticLog) },
    update: { json: JSON.stringify(report), status: reportStatus, criticLog: JSON.stringify(criticLog), version: { increment: 1 } },
  });
  await db.internalArtifact.upsert({
    where: { leadId },
    create: { leadId, json: JSON.stringify(artifact) },
    update: { json: JSON.stringify(artifact) },
  });
  await db.lead.update({ where: { id: leadId }, data: { status: verdict.pass ? "in_review" : "needs_attention" } });
  await logEvent(leadId, "pipeline_finished", { pass: verdict.pass });
}

/** Rejection path: regenerate with the reviewer's reason injected as a first-round violation. */
export const regenerateWithReason = (leadId: string, reason: string) => runPipeline(leadId, reason);
