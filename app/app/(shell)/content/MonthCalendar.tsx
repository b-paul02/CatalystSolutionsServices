"use client";

// WP-20 · month calendar of scheduled publications with drag-to-reschedule (native HTML5 drag; no library).
// Dropping a card on another day keeps its local time and calls the server, which cancels + reschedules
// through the same rules as the form (approval, zone, DST notes).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicationDrag } from "../_os/v2";

export type CalPub = { id: string; day: string; time: string; title: string; channel: string; status: string; href: string; draggable: boolean };

export default function MonthCalendar({ month, pubs, tz }: { month: string; pubs: CalPub[]; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const q = (mm: string) => { const u = new URLSearchParams(window.location.search); u.set("view", "month"); u.set("month", mm); return `?${u}`; };
  const drop = (id: string, day: string) => start(async () => {
    const r = await publicationDrag({}, (() => { const f = new FormData(); f.set("id", id); f.set("day", day); return f; })());
    setNotice(r.error ?? r.ok ?? null); router.refresh();
  });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[13px]"><a className="rounded-lg border border-[var(--los-line)] px-3 py-1" href={q(prev)}>‹ {prev}</a><b>{first.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} · {tz}</b><a className="rounded-lg border border-[var(--los-line)] px-3 py-1" href={q(next)}>{next} ›</a></div>
      {notice && <p role="status" className="mb-2 text-[12.5px] text-[var(--los-muted)]">{notice}</p>}
      <div className="grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1 text-[11px] font-semibold text-[var(--los-faint)]">{d}</div>)}
        {Array.from({ length: (first.getUTCDay() + 6) % 7 }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, "0")}`;
          const mine = pubs.filter((p) => p.day === day);
          return (
            <div key={day} onDragOver={(e) => { e.preventDefault(); setOver(day); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/publication"); if (id && !pending) drop(id, day); }}
              className={`min-h-[92px] rounded-lg border p-1 ${over === day ? "border-[var(--los-brand)] bg-[var(--los-brand-soft)]" : "border-[var(--los-line)]"}`}>
              <div className="text-[11px] text-[var(--los-faint)]">{i + 1}</div>
              {mine.map((p) => (
                <a key={p.id} href={p.href} draggable={p.draggable} onDragStart={(e) => { e.dataTransfer.setData("text/publication", p.id); e.dataTransfer.effectAllowed = "move"; }} title={p.draggable ? "Drag to another day to reschedule" : "Published or in progress — cannot move"}
                  className={`mb-1 block rounded-md px-1.5 py-1 text-[11.5px] ${p.status === "published" ? "bg-[var(--los-success-soft)]" : p.status === "scheduled" ? "bg-[var(--los-surface-2)] cursor-grab" : "bg-[var(--los-danger-soft)]"}`}>
                  <div className="truncate font-medium">{p.title}</div><div className="text-[10.5px] text-[var(--los-faint)]">{p.time} · {p.channel} · {p.status}</div>
                </a>
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--los-faint)]">Only scheduled posts move. The time of day is kept; the server re-checks the approval and the zone.</p>
    </div>
  );
}
