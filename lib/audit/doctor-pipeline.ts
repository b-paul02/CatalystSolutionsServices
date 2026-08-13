// Doctor Digital Audit pipeline. Simpler than the business graph: optional site scan →
// Synthesis → Critic loop (max 2 rewrites) → human review queue. Same LLM client,
// same jargon lint, same under-commit discipline.
import { callClaudeJSON } from "./anthropic";
import { db, logEvent } from "./db";
import { fetchPageSpeed } from "./pagespeed";
import { buildScorecard } from "./scorecard";
import { scanDoctorPresenceWithRetry } from "./doctor-presence";
import { scrapeSite } from "./scrape";
import type { DoctorReportJSON } from "./doctor-report-types";

const DOCTOR_SYSTEM = `You are the analysis engine behind Catalyst Solutions' Doctor Digital Audit.
This audit is about the INDIVIDUAL doctor's digital presence — how a prospective patient who
searches for this doctor by name actually finds and perceives them — not about their hospital's
or employer's website. Standard: the Catalyst "Doctor Digital Audit Report" — professional,
calm, specific, never salesy.
VOICE
Plain, direct, respectful of a medical professional's time. Short sentences. British-neutral
English. Address the reader as "you". No hype words, no exclamation marks, no superlatives
about Catalyst.
EVIDENCE DISCIPLINE — absolute rules:
- Every claim traces to the questionnaire answers or the presence-search / website-scan results
  provided. The presence search is the core evidence: what appeared when we searched for this
  doctor the way a patient would.
- Phrasing for absence: assets that did not appear in the presence search are described as
  "did not appear in the searches we ran on <date>" — never as flatly non-existent. Where the
  questionnaire is silent AND no search ran, say the item "should be verified during the
  complimentary review". Never assume absence without either source.
- Never invent patient numbers, search volumes, rankings, review counts, or statistics.
- No guaranteed outcomes anywhere: no promised rankings, patient volumes, or "AI placement".
  The honest framing: clear, consistent, well-structured professional information that modern
  search systems can interpret.
- Recommend a focused solution, not a generic package. Every component names the specific gap
  it addresses (from the presence search or their answers) and maps to a Catalyst service:
  professional doctor website/landing page, Google Business Profile setup & optimisation,
  review generation system, healthcare directory profile consistency, professional branding,
  educational content, AI-ready information structure, WhatsApp/booking journey, ongoing care.
  Where a gap is unverified, the component is conditional ("if the review confirms...").
- Exactly one next-step line at the end (a 20–30 minute consultation). No pricing anywhere.
OUTPUT
Return strict JSON matching the provided schema. Write "key_findings" as area / what we know
(from their answers or our searches, in their words where possible) / Catalyst interpretation.`;

const DOCTOR_CRITIC = `1. Every "what_we_know" and every "online_presence" item traces to a questionnaire answer, the presence-search results, or the website scan — nothing invented.
2. Absence discipline: items the presence search did not surface are phrased "did not appear in the searches we ran" (with date); items with no search and no answer are "to verify". Flat claims of non-existence are violations. Exception: a website the doctor claimed but gave no link for, which also did not appear in the search, is correctly treated as a primary gap ("no verified website") — that phrasing is compliant.
3. Zero outcome guarantees: no promised rankings, patient volumes, enquiry counts, or AI placement.
4. No pricing, no package hard-sell, no superlatives about Catalyst; exactly one consultation next-step at the end.
5. Every recommended component names the specific gap it addresses; unverified gaps are phrased conditionally.
6. Specific to THIS doctor: name, specialty, location, and their stated priorities appear; the focus is the individual doctor's presence, not the employer institution's website.
7. No internal system language (field ids like hasGbp/websiteUrl, section keys, "questionnaire export", "scan signals") — plain consultant language only.`;

const JARGON = /\bhas[A-Z]\w+\b|\bwebsiteUrl\b|\bdecisionMaker\b|\bvaluedOutcome\b|questionnaire export|scan signals?|section key/;

export async function runDoctorPipeline(leadId: string, rejectionReason?: string): Promise<void> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { evidencePack: true } });
  const pack = lead.evidencePack!;
  const answers = pack.intake ? JSON.parse(pack.intake) : {};
  const scraped = JSON.parse(pack.scraped);

  await db.lead.update({ where: { id: leadId }, data: { status: "generating" } });
  await logEvent(leadId, "pipeline_started", { kind: "doctor" });

  // A manually-performed presence scan (stored by an admin in the evidence pack) takes
  // precedence over the automated one — e.g. research done by hand when quota is exhausted.
  const manualPresence: import("./doctor-presence").PresenceScan | null = (() => {
    try { return JSON.parse(pack.competitors ?? "null")?.presenceScan ?? null; } catch { return null; }
  })();

  // Individual presence scan (core evidence, retried) + optional scan of a site the doctor shared, in parallel.
  let [presence, scorecard] = await Promise.all([
    manualPresence ? Promise.resolve(manualPresence) : scanDoctorPresenceWithRetry({
      name: String(answers.name ?? ""),
      specialty: String(answers.specialty ?? ""),
      city: String(answers.location ?? ""),
      clinic: String(answers.clinic ?? ""),
    }).catch(() => null),
    scraped?.ok
      ? fetchPageSpeed(scraped.url).catch(() => null).then((psi) => buildScorecard(scraped, psi))
      : Promise.resolve(null),
  ]);
  await logEvent(leadId, "node_done", { node: "presence_scan", found: presence?.found.length ?? -1 });

  // If the search discovered the doctor's own website and none was provided, scan it too.
  const foundSite = presence?.found.find((f) => f.type === "own_website")?.url;
  let scannedUrl: string = scraped?.ok ? scraped.url : "";
  if (!scorecard && foundSite) {
    const foundScrape = await scrapeSite(foundSite).catch(() => null);
    if (foundScrape?.ok) {
      scorecard = buildScorecard(foundScrape, await fetchPageSpeed(foundScrape.url).catch(() => null));
      scannedUrl = foundScrape.url;
      await logEvent(leadId, "node_done", { node: "found_site_scan", url: foundSite });
    }
  }
  if (scorecard) await logEvent(leadId, "node_done", { node: "scorecard", overall: scorecard.overall });

  // Website-claim rule: a claimed website with no URL and none found in the search = no verified website.
  const claimedNoUrl = /^Yes/.test(String(answers.hasWebsite ?? "")) && !scraped?.ok && !foundSite;

  const scanSummary = scorecard
    ? {
        overall: scorecard.overall,
        subscores: scorecard.subscores.map((s) => `${s.label}: ${s.score}`),
        passed: scorecard.checks.filter((c) => c.pass).map((c) => c.label),
        failed: scorecard.checks.filter((c) => !c.pass).map((c) => c.label + (c.detail ? ` (${c.detail})` : "")),
        checkedAt: scorecard.checkedAt,
      }
    : null;

  const user = (violations?: string[]) =>
    `QUESTIONNAIRE ANSWERS (unanswered questions are simply absent — never assume absence of an asset):\n${JSON.stringify(answers, null, 1)}\n` +
    (presence
      ? `\nPRESENCE SEARCH RESULTS (we searched for this doctor as a patient would, on ${presence.searchedAt}, using: ${presence.queries.join(" · ")}):\n${JSON.stringify({ found: presence.found, not_found: presence.notFound }, null, 1)}\n`
      : "\nNO PRESENCE SEARCH COULD BE RUN — presence claims must be phrased as items to verify during the review; omit the online_presence field entirely.\n") +
    (scanSummary ? `\nWEBSITE SCAN RESULTS (real automated checks on ${scannedUrl}${scraped?.ok ? ", which the doctor shared" : ", which our search discovered"}):\n${JSON.stringify(scanSummary, null, 1)}\n` : "") +
    (claimedNoUrl ? `\nWEBSITE-CLAIM RULE (apply it): the doctor said they have a website but provided no link${presence ? ", and none appeared in our searches" : ""}. Treat this as NO VERIFIED WEBSITE — if a patient cannot find it, it does not function as one. Frame the professional website as a primary gap, phrased honestly: "you mentioned a website, but no link was provided${presence ? " and none appeared in the searches we ran" : ""}".\n` : "") +
    (violations?.length ? `\nA reviewer rejected the previous draft. Fix every violation:\n- ${violations.join("\n- ")}\n` : "") +
    `\nReturn JSON: {"doctor_name","specialty","institution","location","executive_summary" (2-3 short paragraphs separated by \\n\\n: thank them, name their stated top priorities/concern, frame the opportunity around their INDIVIDUAL presence),${presence ? `"online_presence":{"intro" (one sentence: we searched for you as a patient would on ${presence.searchedAt}),"found":[{"where","what","status":"strength|gap|neutral"}] (from the search results only),"not_found":[strings phrased as "did not appear in the searches we ran"]},` : ""}"check_first":[5-6 bullets],"key_findings":[{"area","what_we_know","interpretation"}] (4-6 rows),"recommended_solution":{"name","components":[{"component","delivery" (each names the gap it addresses)}] (5-7)},"why_relevant" (one short paragraph),"roadmap":[{"stage","action","output"}] (5 stages: Audit, Strategy, Build/Optimize, QA & Launch, Monitor),"next_step" (one sentence: 20-30 minute consultation)}`;

  let report: DoctorReportJSON | null = null;
  let verdict = { pass: false, violations: rejectionReason ? [`Human reviewer rejected the previous version: ${rejectionReason}`] : [] as string[] };
  const criticLog: typeof verdict[] = [];

  for (let attempt = 0; attempt <= 2; attempt++) {
    report = await callClaudeJSON<DoctorReportJSON>(DOCTOR_SYSTEM, user(verdict.violations), 8192);
    await logEvent(leadId, "node_done", { node: "doctor_synthesis", attempt });

    const jargon = JSON.stringify(report).match(new RegExp(JARGON, "g"))?.map((m) => `Internal system language "${m}" in user-facing text — rewrite in plain consultant language.`) ?? [];
    const critic = await callClaudeJSON<{ pass: boolean; violations: string[] }>(
      `You are a strict compliance critic for doctor digital-audit reports. Validate the draft against the checklist. Be adversarial. Return JSON {"pass":boolean,"violations":[specific strings]}.`,
      `CHECKLIST:\n${DOCTOR_CRITIC}\n\nQUESTIONNAIRE ANSWERS:\n${JSON.stringify(answers, null, 1)}\n\nPRESENCE SEARCH RESULTS:\n${JSON.stringify(presence)}\n\nWEBSITE SCAN RESULTS:\n${JSON.stringify(scanSummary)}\n\nDRAFT:\n${JSON.stringify(report, null, 1)}`
    );
    verdict = { pass: critic.pass && jargon.length === 0, violations: [...critic.violations, ...new Set(jargon)] };
    criticLog.push(verdict);
    await logEvent(leadId, "critic_verdict", verdict);
    if (verdict.pass) break;
  }

  if (report) {
    report.scorecard = scorecard;
    report.presence_scan = presence; // raw evidence for the reviewer
    if (!presence) report.online_presence = null; // never keep narrative without its evidence
  }
  // The research is mandatory: without a presence scan the audit must not be approvable as-is.
  // needs_attention parks it for a human; reject-and-regenerate reruns the scan.
  const reportStatus = verdict.pass && presence ? "pending" : "needs_attention";
  if (!presence) await logEvent(leadId, "presence_scan_unavailable", { note: "grounded search failed/quota — rerun via reject-regenerate before approving" });
  await db.report.upsert({
    where: { leadId },
    create: { leadId, json: JSON.stringify(report), status: reportStatus, criticLog: JSON.stringify(criticLog) },
    update: { json: JSON.stringify(report), status: reportStatus, criticLog: JSON.stringify(criticLog), version: { increment: 1 } },
  });
  await db.lead.update({ where: { id: leadId }, data: { status: verdict.pass && presence ? "in_review" : "needs_attention" } });
  await logEvent(leadId, "pipeline_finished", { pass: verdict.pass, presence: !!presence, kind: "doctor" });
}

export const regenerateDoctorWithReason = (leadId: string, reason: string) => runDoctorPipeline(leadId, reason);
