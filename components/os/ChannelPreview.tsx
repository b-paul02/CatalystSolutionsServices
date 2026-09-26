// WP-20 · per-channel preview shaped like the platform's own card, with the format's limits (characters, media
// count, aspect) shown as live counters. Server-safe (no client JS). Nothing here is what gets published — the
// adapter renders the final body; this is the editor's mirror of it.
import { formatSpec, type FormatSpec } from "@/lib/os/channels";

export type PreviewVariant = { channel: string; format: string; title: string | null; body: string; parts: string[]; cta: string | null; link: string | null; media: { id: string; kind: string; name: string }[] };
export type Limit = { label: string; used: number; max: number | null; ok: boolean };

/** Pure: the limit rows a preview shows (characters, parts, media count, aspect note). */
export function previewLimits(v: PreviewVariant, spec: FormatSpec | null): Limit[] {
  if (!spec) return [];
  const out: Limit[] = [];
  const chars = [...(v.format === "thread" ? "" : v.body)].length;
  if (spec.maxChars && v.format !== "thread") out.push({ label: "characters", used: chars, max: spec.maxChars, ok: chars <= spec.maxChars });
  if (spec.parts) { const longest = Math.max(0, ...v.parts.map((p) => [...p].length)); out.push({ label: "posts", used: v.parts.length, max: spec.parts.max, ok: v.parts.length >= spec.parts.min && v.parts.length <= spec.parts.max }); out.push({ label: "longest post", used: longest, max: spec.parts.maxChars, ok: longest <= spec.parts.maxChars }); }
  if (spec.maxTitle) { const t = [...(v.title ?? "")].length; out.push({ label: "title", used: t, max: spec.maxTitle, ok: t <= spec.maxTitle && (!spec.titleRequired || t > 0) }); }
  if (spec.media) out.push({ label: `${spec.media.kind === "any" ? "media" : spec.media.kind} files`, used: v.media.length, max: spec.media.max, ok: v.media.length >= spec.media.min && v.media.length <= spec.media.max });
  return out;
}

export const ASPECT_NOTE: Record<string, string> = { instagram: "1:1 or 4:5 images; 9:16 reels", x: "16:9 or 1:1 images", linkedin: "1.91:1 links, 1:1 or 4:5 images", facebook: "1.91:1 links, 1:1 images", youtube: "16:9 (shorts 9:16)", blog: "1.91:1 cover" };

export default function ChannelPreview({ v }: { v: PreviewVariant }) {
  const spec = formatSpec(v.channel, v.format);
  const limits = previewLimits(v, spec);
  const images = v.media.filter((m) => m.kind === "image");
  const Media = () => images.length === 0 ? null : (
    <div className={`mt-2 grid gap-1 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{images.slice(0, 4).map((m) => <img key={m.id} src={`/api/os/assets/${m.id}`} alt={m.name} className={`w-full rounded-lg object-cover ${v.channel === "instagram" ? "aspect-square" : "aspect-video"}`} />)}</div>
  );
  const Head = ({ name, sub }: { name: string; sub: string }) => (<div className="flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-[var(--los-surface-2)]" aria-hidden /><div><div className="text-[13px] font-semibold">{name}</div><div className="text-[11px] text-[var(--los-faint)]">{sub}</div></div></div>);
  const linkedinCut = v.channel === "linkedin" && v.body.length > 210;
  return (
    <div className="rounded-xl border border-[var(--los-line)] bg-[var(--los-surface-2)] p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--los-faint)]"><span>Preview · {spec?.label ?? v.format}</span><span className="normal-case tracking-normal">{ASPECT_NOTE[v.channel] ?? ""}</span></div>
      <div className="rounded-lg bg-[var(--los-surface)] p-3 text-[13.5px]">
        {v.channel === "x" && (<><Head name="Your account" sub="@handle · now" />{v.format === "thread" ? <ol className="mt-2 space-y-2">{v.parts.map((p, i) => <li key={i} className="whitespace-pre-wrap border-l-2 border-[var(--los-line)] pl-2">{p}</li>)}</ol> : <p className="mt-2 whitespace-pre-wrap">{v.body}{v.link ? ` ${v.link}` : ""}</p>}<Media /></>)}
        {v.channel === "linkedin" && (<><Head name="Your name or page" sub="1st · now" />{v.title && v.format === "document" && <div className="mt-2 font-bold">{v.title}</div>}<p className="mt-2 whitespace-pre-wrap">{linkedinCut ? `${v.body.slice(0, 210)}… ` : v.body}{linkedinCut && <span className="text-[var(--los-muted)]">…more</span>}</p>{v.link && <div className="mt-2 rounded-lg border border-[var(--los-line)] p-2 text-[12px] text-[var(--los-muted)]">{v.link}</div>}<Media /></>)}
        {v.channel === "facebook" && (<><Head name="Your Page" sub="Just now · 🌐" /><p className="mt-2 whitespace-pre-wrap">{v.body}</p>{v.link && <div className="mt-2 rounded-lg border border-[var(--los-line)] p-2 text-[12px] text-[var(--los-muted)]">{v.link}</div>}<Media /></>)}
        {v.channel === "instagram" && (<><Head name="yourhandle" sub="" /><div className="mt-2">{images.length ? <Media /> : <div className="flex aspect-square items-center justify-center rounded-lg bg-[var(--los-surface-2)] text-[12px] text-[var(--los-faint)]">{spec?.video ? "Finished video from Assets" : "Image from Assets"}</div>}</div><p className="mt-2 whitespace-pre-wrap"><b>yourhandle</b> {v.body}</p>{v.link && <p className="text-[12px] text-[var(--los-faint)]">Links are not clickable in captions — “link in bio”.</p>}</>)}
        {v.channel === "youtube" && (<><div className="flex aspect-video items-center justify-center rounded-lg bg-[var(--los-surface-2)] text-[12px] text-[var(--los-faint)]">{v.media.find((m) => m.kind === "video")?.name ?? "Finished video from Assets"}</div><div className="mt-2 font-bold">{v.title || <span className="text-[var(--los-faint)]">Title</span>}</div><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-[var(--los-muted)]">{v.body}</p></>)}
        {v.channel === "email" && (<><div className="rounded-t-lg border-b border-[var(--los-line)] pb-2 text-[12px] text-[var(--los-muted)]"><div><b>Subject:</b> {v.title || <span className="text-[var(--los-faint)]">Subject line</span>}</div><div><b>From:</b> your workspace · <b>To:</b> everyone who agreed to the newsletter (decided at send time)</div></div><Media /><p className="mt-2 whitespace-pre-wrap">{v.body}</p>{v.parts.map((p, i) => <p key={i} className="mt-2 whitespace-pre-wrap">{p}</p>)}<p className="mt-3 text-[11px] text-[var(--los-faint)]">— Reply STOP or use the unsubscribe link (added automatically).</p></>)}
        {v.channel === "blog" && (<><h3 className="text-[18px] font-extrabold leading-tight">{v.title || <span className="text-[var(--los-faint)]">Headline</span>}</h3><Media /><p className="mt-2 line-clamp-6 whitespace-pre-wrap">{v.body}</p></>)}
        {!["x", "linkedin", "facebook", "instagram", "youtube", "blog", "email"].includes(v.channel) && <p className="whitespace-pre-wrap">{v.body}</p>}
        {v.cta && <p className="mt-2 font-medium">{v.cta}</p>}
      </div>
      {limits.length > 0 && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">{limits.map((l) => <li key={l.label} className={l.ok ? "text-[var(--los-faint)]" : "font-semibold text-[var(--los-danger)]"}>{l.label}: {l.used}{l.max !== null ? ` / ${l.max}` : ""}</li>)}</ul>}
    </div>
  );
}
