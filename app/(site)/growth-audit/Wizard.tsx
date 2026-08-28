"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { MODULES, FAMILIES, pickModules, type Module } from "@/lib/audit/modules";

type Inferred = {
  business_name: string;
  sells: string;
  serves: string;
  industry: string;
  business_model: string;
  maturity_notes: string;
} | null;

const GOALS = ["More leads", "More sales", "Brand visibility", "Operational efficiency", "Launching something new", "Other"];
const BUDGETS = ["Under $1k / month", "$1k–$3k / month", "$3k–$10k / month", "Over $10k / month", "Prefer not to say"];
const TIMELINES = ["ASAP", "Within 1 month", "1–3 months", "Just exploring"];
const DECISIONS = ["Just me", "Me + a partner", "A team"];
const TEAM_SIZES = ["1–10", "11–50", "51–200", "200+"];

function Choice({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="grid gap-2.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(o)}
          className={`rounded-xl border px-4 py-3.5 text-left text-[14.5px] font-medium transition-colors ${
            value === o
              ? "border-[rgba(168,85,247,0.6)] bg-[rgba(124,58,237,0.18)] text-white"
              : "border-[var(--color-line)] bg-[rgba(255,255,255,0.03)] text-[var(--color-fg)] hover:border-[rgba(168,85,247,0.35)]"
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export default function Wizard() {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // stage 0
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [noWebsite, setNoWebsite] = useState(false);

  // prefill from the homepage hero form (?url= / ?name= / ?email= / ?noWebsite=1)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const no = q.get("noWebsite") === "1";
    if (no) setNoWebsite(true);
    const u = q.get(no ? "name" : "url");
    if (u) setUrl(u);
    const e = q.get("email");
    if (e) setEmail(e);
  }, []);
  const [inferred, setInferred] = useState<Inferred>(null);
  const [scrapeOk, setScrapeOk] = useState(true);

  // profile (confirm-or-correct; stage/links only asked in the no-website flow)
  const [profile, setProfile] = useState({ business_name: "", sells: "", serves: "", industry: "", teamSize: "", stage: "", presenceLinks: "" });

  // core intake
  const [goal, setGoal] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [decision, setDecision] = useState("");
  const [competitors, setCompetitors] = useState("");

  // modules
  const [moduleAnswers, setModuleAnswers] = useState<Record<string, string>>({});

  const [step, setStep] = useState(0);
  const modules: Module[] = leadId ? pickModules(services, goal) : [];
  // steps: 0 start · 1 profile · 2 goal · 3 model · 4 services · 5 budget · 6 timeline · 7 decision · 8.. modules · done
  const totalSteps = 8 + modules.length;
  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  async function startScrape(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/audit/scrape", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(noWebsite ? { noWebsite: true, businessName: url, email } : { url, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setLeadId(data.leadId);
      setScrapeOk(data.scraped.ok);
      setInferred(data.inferred);
      if (data.inferred) {
        setProfile((p) => ({ ...p, business_name: data.inferred.business_name ?? "", sells: data.inferred.sells ?? "", serves: data.inferred.serves ?? "", industry: data.inferred.industry ?? "" }));
      }
      setStep(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/audit/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId, profile,
          intake: { goal, businessModel, services, budget, timeline, decision, competitors, teamSize: profile.teamSize, stage: profile.stage, presenceLinks: profile.presenceLinks },
          moduleAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setReportToken(data.token ?? null);
      setStep(totalSteps); // done screen
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const moduleIndex = step - 8;
  const currentModule = moduleIndex >= 0 && moduleIndex < modules.length ? modules[moduleIndex] : null;
  const isLastQuestionStep = step === totalSteps - 1;

  const card = "card mx-auto w-full max-w-[640px]";
  const h = "mb-2 text-[22px] font-bold tracking-[-0.01em] text-white";
  const sub = "mb-6 text-[14px] leading-[1.6] text-[var(--color-muted)]";

  // ---------- screens ----------
  if (step === 0) {
    return (
      <form onSubmit={startScrape} className={card} id="start">
        <h2 className={h}>Start your free Growth Audit</h2>
        <p className={sub}>{noWebsite ? "No website is fine — we'll build the audit from your answers instead." : "Enter your website and email. We read your site first so you answer fewer questions."}</p>
        <label className="label mb-1.5 block">{noWebsite ? "Business name" : "Website URL"}</label>
        <input className="field mb-3" required placeholder={noWebsite ? "Your business name" : "yourbusiness.com"} value={url} onChange={(e) => setUrl(e.target.value)} />
        <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--color-muted)]">
          <input type="checkbox" checked={noWebsite} onChange={(e) => setNoWebsite(e.target.checked)} className="h-4 w-4 accent-[#A855F7]" />
          I don&apos;t have a website yet
        </label>
        <label className="label mb-1.5 block">Email (your report is delivered here)</label>
        <input className="field mb-6" required type="email" placeholder="you@yourbusiness.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="mb-4 text-[13.5px] text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? (noWebsite ? "Setting things up…" : "Reading your site — this takes a moment…") : <>Start the audit <Icon name="arrow_forward" className="text-[19px]" /></>}
        </button>
        <p className="mt-4 text-center text-[12.5px] text-[var(--color-faint)]">Free. About 5 minutes. Reviewed by a human before it reaches you.</p>
      </form>
    );
  }

  if (step >= totalSteps) {
    return (
      <div className={`${card} text-center`}>
        <span className="icon-grad mx-auto mb-5 h-14 w-14 text-[28px]"><Icon name="mark_email_read" /></span>
        <h2 className={h}>That&apos;s everything — thank you.</h2>
        <p className={sub}>
          We&apos;re now analysing your answers{noWebsite ? "" : " alongside what we found on your site"}. A member of our
          team reviews every report before release. Yours will be ready within 1 business day at this link:
        </p>
        {reportToken && (
          <>
            <a href={`/growth-audit/report/${reportToken}`} className="btn-primary mb-4 w-full">
              View my report page <Icon name="arrow_forward" className="text-[18px]" />
            </a>
            <p className="text-[12.5px] text-[var(--color-faint)]">
              Bookmark it — the page shows your report the moment it&apos;s approved, and you can save it as a PDF from there.
            </p>
          </>
        )}
      </div>
    );
  }

  const progress = Math.round((step / totalSteps) * 100);

  return (
    <div className={card}>
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-[12px] text-[var(--color-faint)]">
          <span>Step {step} of {totalSteps - 1}</span><span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {step === 1 && (
        <>
          <h2 className={h}>{scrapeOk && inferred ? "Here's what we understood — correct anything we got wrong" : "Tell us about your business"}</h2>
          {scrapeOk && inferred && <p className={sub}>Pulled from your website. Edit any card that&apos;s off.</p>}
          {!scrapeOk && !noWebsite && <p className={sub}>We couldn&apos;t read your site automatically, so a few basics first.</p>}
          {noWebsite && <p className={sub}>A few basics so the audit fits where you are today.</p>}
          {([["business_name", "Business name"], ["sells", "What you sell or provide"], ["serves", "Who you serve"], ["industry", "Industry"]] as const).map(([k, label]) => (
            <div key={k} className="mb-4">
              <label className="label mb-1.5 block">{label}</label>
              <input className="field" value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
            </div>
          ))}
          <label className="label mb-1.5 block">Team size</label>
          <Choice options={TEAM_SIZES} value={profile.teamSize} onPick={(v) => setProfile({ ...profile, teamSize: v })} />
          {noWebsite && (
            <>
              <label className="label mb-1.5 mt-4 block">Where is the business today?</label>
              <Choice options={["Idea", "Trading offline", "Recently launched"]} value={profile.stage} onPick={(v) => setProfile({ ...profile, stage: v })} />
              <label className="label mb-1.5 mt-4 block">Any online presence already? (Google Business Profile, Instagram, Facebook — paste links, optional)</label>
              <textarea className="field min-h-[60px]" value={profile.presenceLinks} onChange={(e) => setProfile({ ...profile, presenceLinks: e.target.value })} />
            </>
          )}
          {inferred?.maturity_notes && <p className="mt-4 text-[12.5px] italic text-[var(--color-faint)]">From your site: {inferred.maturity_notes}</p>}
        </>
      )}

      {step === 2 && (<><h2 className={h}>What&apos;s your primary goal right now?</h2><Choice options={GOALS} value={goal} onPick={(v) => { setGoal(v); }} /></>)}
      {step === 3 && (<><h2 className={h}>Who do you sell to?</h2><Choice options={["B2B", "B2C", "Both"]} value={businessModel} onPick={setBusinessModel} /></>)}

      {step === 4 && (
        <>
          <h2 className={h}>Which areas are you interested in?</h2>
          <p className={sub}>Select all that apply.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FAMILIES.map((f) => {
              const on = services.includes(f.slug);
              return (
                <button key={f.slug} type="button"
                  onClick={() => setServices(on ? services.filter((s) => s !== f.slug) : [...services, f.slug])}
                  className={`rounded-xl border px-3.5 py-3 text-left text-[13.5px] font-medium transition-colors ${
                    on ? "border-[rgba(168,85,247,0.6)] bg-[rgba(124,58,237,0.18)] text-white" : "border-[var(--color-line)] bg-[rgba(255,255,255,0.03)] text-[var(--color-fg)] hover:border-[rgba(168,85,247,0.35)]"
                  }`}>
                  {f.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 5 && (<><h2 className={h}>Rough monthly marketing budget?</h2><p className={sub}>A range is enough — this shapes what we recommend, nothing else.</p><Choice options={BUDGETS} value={budget} onPick={setBudget} /></>)}
      {step === 6 && (<><h2 className={h}>When do you want to start?</h2><Choice options={TIMELINES} value={timeline} onPick={setTimeline} /></>)}
      {step === 7 && (
        <>
          <h2 className={h}>Who decides on engagements like this?</h2>
          <Choice options={DECISIONS} value={decision} onPick={setDecision} />
          <label className="label mb-1.5 mt-5 block">Which competitors do you watch, if any? (optional — we&apos;ll research them either way)</label>
          <textarea className="field min-h-[56px]" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Names or websites" />
        </>
      )}

      {currentModule && (
        <>
          <h2 className={h}>{currentModule.title}</h2>
          <p className={sub}>A few specifics so the report is actually about your situation.</p>
          {currentModule.questions.map((q) => (
            <div key={q.id} className="mb-4">
              <label className="label mb-1.5 block">{q.label}{q.required && " *"}</label>
              {q.type === "select" ? (
                <select className="field" value={moduleAnswers[q.id] ?? ""} onChange={(e) => setModuleAnswers({ ...moduleAnswers, [q.id]: e.target.value })}>
                  <option value="">Choose…</option>
                  {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <textarea className="field min-h-[76px]" value={moduleAnswers[q.id] ?? ""} onChange={(e) => setModuleAnswers({ ...moduleAnswers, [q.id]: e.target.value })} />
              )}
            </div>
          ))}
        </>
      )}

      {error && <p className="mt-4 text-[13.5px] text-red-400">{error}</p>}

      <div className="mt-7 flex items-center justify-between">
        <button type="button" onClick={back} className="btn-ghost px-5 py-2.5 text-sm" disabled={step <= 1 || busy}>Back</button>
        <button type="button" disabled={busy ||
            (step === 1 && (!profile.business_name || (noWebsite && !profile.stage))) || (step === 2 && !goal) || (step === 3 && !businessModel) ||
            (step === 4 && services.length === 0) || (step === 5 && !budget) || (step === 6 && !timeline) || (step === 7 && !decision) ||
            (currentModule ? currentModule.questions.some((q) => q.required && !(moduleAnswers[q.id] ?? "").trim()) : false)}
          onClick={() => (isLastQuestionStep ? submitAll() : next())}
          className="btn-primary px-6 py-3 text-sm">
          {busy ? "Submitting…" : isLastQuestionStep ? "Finish & generate my report" : "Continue"} {!busy && <Icon name="arrow_forward" className="text-[17px]" />}
        </button>
      </div>
    </div>
  );
}
