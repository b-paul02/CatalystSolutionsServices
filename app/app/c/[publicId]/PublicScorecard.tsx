"use client";

// WP-10a · public scorecard: one question per screen, progress bar, email gate (or results first), result with dial,
// band copy, per-category bars and a share link. The score shown before submission is computed with the same pure
// function the server uses; the server's score is what is stored.
import { useEffect, useRef, useState } from "react";
import type { FormSpec } from "@/lib/leados/campaigns";
import { scoreAnswers, type ScorecardSpec, type ScoreResult } from "@/lib/leados/scorecard";
import ScoreDial from "@/components/os/ScoreDial";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void } } }

function useTurnstile(siteKey: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!siteKey || !slot.current) return;
    const render = () => { if (window.turnstile && slot.current && slot.current.childElementCount === 0) window.turnstile.render(slot.current, { sitekey: siteKey, callback: setToken, "expired-callback": () => setToken(null) }); };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = render; document.head.appendChild(s);
  }, [siteKey]);
  return { token, slot };
}

export function ResultView({ spec, score, brandColor, shareUrl, orgName }: { spec: ScorecardSpec; score: ScoreResult; brandColor: string; shareUrl: string | null; orgName: string }) {
  const band = spec.bands[score.bandIndex] ?? spec.bands.at(-1);
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <ScoreDial pct={score.pct} color={brandColor} label={band?.label} />
        <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: brandColor }}>{band?.label}</div>
        <h2 className="mt-1 text-[22px] font-extrabold leading-tight">{band?.headline}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--los-muted)]">{band?.body}</p>
        {band?.ctaLabel && band.ctaHref && <a href={band.ctaHref} className="mt-4 inline-block rounded-lg px-4 py-2.5 text-[14px] font-bold text-white" style={{ background: brandColor }}>{band.ctaLabel}</a>}
      </div>
      <div className="mt-5 space-y-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--los-faint)]">By category · self-reported</div>
        {score.categories.map((c) => (
          <div key={c.key}>
            <div className="flex justify-between text-[13px]"><span>{c.label}</span><span className="font-semibold">{c.pct}%</span></div>
            <div className="h-2 rounded bg-[var(--los-surface-2)]" role="progressbar" aria-valuenow={c.pct} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}><div className="h-2 rounded" style={{ width: `${c.pct}%`, background: brandColor }} /></div>
          </div>
        ))}
      </div>
      {shareUrl && <p className="mt-4 break-all text-center text-[12px] text-[var(--los-faint)]">Your result link: <a className="underline" href={shareUrl}>{shareUrl}</a></p>}
      <p className="mt-3 text-center text-[11.5px] text-[var(--los-faint)]">Based on your own answers to {orgName}&apos;s assessment. Not a verified audit.</p>
    </div>
  );
}

export default function PublicScorecard(props: { publicId: string; formSpec: FormSpec; spec: ScorecardSpec; cta: string; brandColor: string; trackingCode: string | null; utm: Record<string, string>; turnstileSiteKey: string | null; orgName: string }) {
  const { spec, formSpec } = props;
  const [i, setI] = useState(0); // question index; spec.questions.length = contact step
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: ScoreResult; resultUrl: string | null } | null>(null);
  const [started, setStarted] = useState(false);
  const turnstile = useTurnstile(props.turnstileSiteKey);
  const total = spec.questions.length;
  const inputCls = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2.5 text-[15px]";

  const start = () => { if (started) return; setStarted(true); fetch(`/api/leados/public/forms/${props.publicId}/start`, { method: "POST" }).catch(() => undefined); };
  const preview = scoreAnswers(spec, answers);

  if (result) return <ResultView spec={spec} score={result.score} brandColor={props.brandColor} shareUrl={result.resultUrl ? `${window.location.origin}${result.resultUrl}` : null} orgName={props.orgName} />;

  if (i < total) {
    const q = spec.questions[i];
    return (
      <div className="mt-5">
        <div className="mb-3 h-1.5 rounded bg-[var(--los-surface-2)]" role="progressbar" aria-valuenow={i} aria-valuemin={0} aria-valuemax={total} aria-label="Progress"><div className="h-1.5 rounded transition-all" style={{ width: `${(i / total) * 100}%`, background: props.brandColor }} /></div>
        <div className="text-[12px] text-[var(--los-faint)]">Question {i + 1} of {total}</div>
        <h2 className="mt-1 text-[19px] font-bold leading-snug">{q.text}</h2>
        <div className="mt-3 space-y-2">
          {q.answers.map((a, idx) => (
            <button key={idx} type="button" onClick={() => { start(); setAnswers({ ...answers, [q.key]: String(idx) }); setI(i + 1); }} className="block w-full rounded-lg border border-[var(--los-line)] px-4 py-3 text-left text-[14.5px] hover:border-[var(--los-brand)]" style={answers[q.key] === String(idx) ? { borderColor: props.brandColor } : undefined}>{a.label}</button>
          ))}
        </div>
        {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="mt-3 text-[13px] text-[var(--los-muted)] underline">← Back</button>}
      </div>
    );
  }

  // contact step (gate) — the result shows after the server stored the submission; gate "none" shows the score above the form
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        fd.forEach((v, k) => { if (typeof v === "string") values[k] = v; });
        for (const [k, v] of Object.entries(answers)) values[`sc_${k}`] = v;
        try {
          const res = await fetch(`/api/leados/public/forms/${props.publicId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, consentChecked: fd.get("__consent") === "on", utm: props.utm, trackingCode: props.trackingCode, website: values.website ?? "", turnstileToken: turnstile.token }) });
          const body = (await res.json()) as { error?: string; score?: ScoreResult; resultUrl?: string };
          if (!res.ok) setError(body.error ?? "Something went wrong. Try again.");
          else setResult({ score: body.score ?? preview, resultUrl: body.resultUrl ?? null });
        } catch { setError("Network problem — please try again."); } finally { setBusy(false); }
      }}
    >
      {spec.gate === "none" && <ResultView spec={spec} score={preview} brandColor={props.brandColor} shareUrl={null} orgName={props.orgName} />}
      <h2 className="text-[18px] font-bold">{spec.gate === "none" ? "Want the full breakdown by email?" : "Almost there — where should we send your result?"}</h2>
      {error && <div className="rounded-lg bg-[var(--los-danger-soft)] px-3 py-2 text-[13.5px] text-[var(--los-danger)]">{error}</div>}
      {[...formSpec.fields, ...formSpec.qualifying].map((f) => (
        <div key={f.key}>
          <label htmlFor={`sc-${f.key}`} className="mb-1 block text-[13px] font-medium">{f.label}{f.required && <span className="text-[var(--los-danger)]"> *</span>}</label>
          {f.kind === "select" ? <select id={`sc-${f.key}`} name={f.key} required={f.required} className={inputCls} defaultValue=""><option value="" disabled>Select…</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : f.kind === "textarea" ? <textarea id={`sc-${f.key}`} name={f.key} required={f.required} className={`${inputCls} h-20`} />
            : f.kind === "checkbox" ? <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name={f.key} value="yes" /> {f.label}</label>
            : <input id={`sc-${f.key}`} name={f.key} required={f.required} type={f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"} inputMode={f.kind === "phone" ? "tel" : undefined} className={inputCls} />}
        </div>
      ))}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="flex items-start gap-2 rounded-lg bg-[var(--los-surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--los-muted)]">
        <input type="checkbox" name="__consent" required className="mt-0.5" />
        <span>I agree to be contacted about <strong>{formSpec.consentPurposes.map((p) => p.replace(/_/g, " ")).join(", ")}</strong> via <strong>{formSpec.consentChannels.join(", ")}</strong>. I can withdraw at any time via the privacy page.</span>
      </label>
      {props.turnstileSiteKey && <div ref={turnstile.slot} className="flex justify-center" />}
      <button type="submit" disabled={busy || (Boolean(props.turnstileSiteKey) && !turnstile.token)} className="w-full rounded-lg px-4 py-3 text-[15px] font-bold text-white hover:opacity-90 disabled:opacity-50" style={{ background: props.brandColor }}>{busy ? "Sending…" : props.cta}</button>
      <button type="button" onClick={() => setI(total - 1)} className="block w-full text-center text-[13px] text-[var(--los-muted)] underline">← Change an answer</button>
    </form>
  );
}
