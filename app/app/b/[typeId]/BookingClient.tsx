"use client";

// Month grid + slots + form. The grid is plain links (server computes slots); the form posts once with an idempotency key.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/lib/os/booking";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void } } }

export default function BookingClient(props: { typeId: string; tz: string; month: string; day: string | null; weekdays: number[]; slots: { startAt: string; label: string }[]; questions: Question[]; turnstileSiteKey: string | null; live: boolean; manageToken?: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ startAt: string; manageUrl: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement | null>(null);
  const requestId = useMemo(() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""), []);
  // switch to the visitor's own zone once, unless the URL already carries one
  useEffect(() => { const mine = Intl.DateTimeFormat().resolvedOptions().timeZone; if (mine && mine !== props.tz && !new URLSearchParams(window.location.search).get("tz")) { const u = new URL(window.location.href); u.searchParams.set("tz", mine); router.replace(u.pathname + u.search); } }, [props.tz, router]);
  useEffect(() => {
    if (!props.turnstileSiteKey || !slot.current || !picked) return;
    const render = () => { if (window.turnstile && slot.current && slot.current.childElementCount === 0) window.turnstile.render(slot.current, { sitekey: props.turnstileSiteKey!, callback: setToken, "expired-callback": () => setToken(null) }); };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = render; document.head.appendChild(s);
  }, [props.turnstileSiteKey, picked]);

  const [y, m] = props.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const q = (patch: Record<string, string | null>) => { const u = new URLSearchParams(window.location.search); for (const [k, v] of Object.entries(patch)) { if (v === null) u.delete(k); else u.set(k, v); } return `?${u.toString()}`; };
  const inputCls = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2.5 text-[15px]";
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short", timeZone: props.tz });

  if (done) return (
    <div className="mt-5 rounded-xl bg-[var(--los-success-soft)] p-5">
      <div className="text-[16px] font-bold text-[var(--los-success)]">Booked: {fmt(done.startAt)}</div>
      <p className="mt-1 text-[13.5px]">A confirmation is on its way to your email. Need to change it? <a className="underline" href={done.manageUrl}>Reschedule or cancel</a>.</p>
    </div>
  );

  return (
    <div className="mt-5 grid gap-6 md:grid-cols-[280px_1fr]">
      <div>
        <div className="mb-2 flex items-center justify-between text-[13px]"><a className="underline" href={q({ month: prev, day: null })}>‹</a><b>{first.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</b><a className="underline" href={q({ month: next, day: null })}>›</a></div>
        <div className="grid grid-cols-7 gap-1 text-center text-[12px]">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-[var(--los-faint)]">{d}</div>)}
          {Array.from({ length: first.getUTCDay() }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => { const d = new Date(Date.UTC(y, m - 1, i + 1)); const iso = d.toISOString().slice(0, 10); const on = props.weekdays.includes(d.getUTCDay()) && iso >= today; return on ? <a key={iso} href={q({ day: iso })} aria-current={props.day === iso ? "date" : undefined} className={`rounded-md py-1.5 ${props.day === iso ? "bg-[var(--los-brand)] font-bold text-white" : "bg-[var(--los-surface-2)] hover:bg-[var(--los-brand-soft)]"}`}>{i + 1}</a> : <div key={iso} className="py-1.5 text-[var(--los-faint)]">{i + 1}</div>; })}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--los-faint)]">Times shown in {props.tz}</p>
      </div>
      <div>
        {!props.day && <p className="text-[13.5px] text-[var(--los-muted)]">Pick a day to see available times.</p>}
        {props.day && !picked && (props.slots.length === 0 ? <p className="text-[13.5px] text-[var(--los-muted)]">No free times that day — try another.</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{props.slots.map((s) => <button key={s.startAt} type="button" onClick={() => setPicked(s.startAt)} className="rounded-lg border border-[var(--los-line)] px-3 py-2 text-[14px] hover:border-[var(--los-brand)]">{s.label}</button>)}</div>)}
        {picked && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null);
            const fd = new FormData(e.currentTarget);
            const answers: Record<string, string> = {}; for (const qq of props.questions) answers[qq.key] = String(fd.get(`q_${qq.key}`) ?? "");
            try {
              const res = await fetch(`/api/os/book/${props.typeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startAt: picked, visitorTz: props.tz, name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"), answers, consent: fd.get("consent") === "on", requestId, website: fd.get("website"), turnstileToken: token, manageToken: props.manageToken }) });
              const body = (await res.json()) as { error?: string; startAt?: string; manageUrl?: string };
              if (!res.ok) { setError(body.error ?? "Something went wrong."); if (res.status === 409) setPicked(null); }
              else setDone({ startAt: body.startAt ?? picked, manageUrl: body.manageUrl ?? "" });
            } catch { setError("Network problem — please try again."); } finally { setBusy(false); }
          }}>
            <div className="flex items-center justify-between text-[13.5px]"><b>{fmt(picked)}</b><button type="button" className="text-[12.5px] underline" onClick={() => setPicked(null)}>change</button></div>
            {!props.live && <p className="rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[12.5px]">Preview: this page is not live yet, so bookings will be refused.</p>}
            {error && <div className="rounded-lg bg-[var(--los-danger-soft)] px-3 py-2 text-[13.5px] text-[var(--los-danger)]">{error}</div>}
            {!props.manageToken && <>
              <input name="name" required placeholder="Your name" className={inputCls} aria-label="Your name" />
              <input name="email" type="email" required placeholder="Email" className={inputCls} aria-label="Email" />
              <input name="phone" type="tel" placeholder="Phone (optional)" className={inputCls} aria-label="Phone" />
              {props.questions.map((qq) => <div key={qq.key}><label htmlFor={`q_${qq.key}`} className="mb-1 block text-[13px] font-medium">{qq.label}{qq.required && " *"}</label><input id={`q_${qq.key}`} name={`q_${qq.key}`} required={qq.required} className={inputCls} /></div>)}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <label className="flex items-start gap-2 text-[12.5px] text-[var(--los-muted)]"><input type="checkbox" name="consent" required className="mt-0.5" /><span>I agree to be contacted by email and phone about this booking.</span></label>
            </>}
            {props.turnstileSiteKey && <div ref={slot} className="flex justify-center" />}
            <button type="submit" disabled={busy || (Boolean(props.turnstileSiteKey) && !token)} className="w-full rounded-lg bg-[var(--los-brand)] px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50">{busy ? "Booking…" : props.manageToken ? "Move my booking here" : "Confirm booking"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
