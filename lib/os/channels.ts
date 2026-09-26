// Channel + format rules for content variants (GrowthOS v2, brief §F/§H). Pure: used by the
// server, the browser preview and tests. Limits are the platforms' published limits at the time
// of writing; each adapter re-validates at publish time and the provider has the last word.
import { createHash } from "node:crypto";

export type MediaKind = "image" | "video" | "document";
export type FormatSpec = {
  label: string;
  maxChars?: number; // body / caption
  maxTitle?: number; titleRequired?: boolean;
  parts?: { min: number; max: number; maxChars: number }; // thread
  media?: { kind: MediaKind | "any"; min: number; max: number };
  maxDurationSec?: number;
  linkInBody: boolean; // false ⇒ links in the caption are not clickable (say so in the preview)
  video: boolean; // needs a produced video file — a script is not enough
};
export type ChannelSpec = { label: string; provider: string; accountTypes: string[]; formats: Record<string, FormatSpec>; medium: string };

export const CHANNELS: Record<string, ChannelSpec> = {
  x: {
    label: "X", provider: "x", accountTypes: ["user"], medium: "social",
    formats: {
      post: { label: "Post", maxChars: 280, media: { kind: "any", min: 0, max: 4 }, linkInBody: true, video: false },
      thread: { label: "Thread", parts: { min: 2, max: 25, maxChars: 280 }, media: { kind: "any", min: 0, max: 4 }, linkInBody: true, video: false }, // media rides on the first post
    },
  },
  linkedin: {
    label: "LinkedIn", provider: "linkedin", accountTypes: ["member", "organization"], medium: "social",
    formats: {
      post: { label: "Post", maxChars: 3000, media: { kind: "image", min: 0, max: 1 }, linkInBody: true, video: false },
      multi_image: { label: "Multi-image post", maxChars: 3000, media: { kind: "image", min: 2, max: 20 }, linkInBody: true, video: false },
      // the "carousel" people know from the feed: a PDF / PPTX / DOCX (≤100 MB, ≤300 pages) designed by a person
      document: { label: "Document (carousel)", maxChars: 3000, maxTitle: 100, titleRequired: true, media: { kind: "document", min: 1, max: 1 }, linkInBody: true, video: false },
      video: { label: "Video", maxChars: 3000, media: { kind: "video", min: 1, max: 1 }, maxDurationSec: 1800, linkInBody: true, video: true },
    },
  },
  facebook: {
    label: "Facebook Page", provider: "meta", accountTypes: ["page"], medium: "social",
    formats: {
      post: { label: "Page post", maxChars: 5000, media: { kind: "image", min: 0, max: 1 }, linkInBody: true, video: false },
      // a finished MP4 from Assets (a script is not a video). ponytail: 500 MB cap because the file is buffered in memory; stream it if larger files matter
      video: { label: "Page video", maxChars: 5000, maxTitle: 255, titleRequired: true, media: { kind: "video", min: 1, max: 1 }, linkInBody: true, video: true },
    },
  },
  instagram: {
    label: "Instagram", provider: "meta", accountTypes: ["ig_business"], medium: "social",
    formats: {
      post: { label: "Image post", maxChars: 2200, media: { kind: "image", min: 1, max: 1 }, linkInBody: false, video: false },
      carousel: { label: "Carousel", maxChars: 2200, media: { kind: "any", min: 2, max: 10 }, linkInBody: false, video: false },
      reel: { label: "Reel", maxChars: 2200, media: { kind: "video", min: 1, max: 1 }, maxDurationSec: 900, linkInBody: false, video: true },
    },
  },
  youtube: {
    label: "YouTube", provider: "youtube", accountTypes: ["channel"], medium: "video",
    formats: {
      long_video: { label: "Long-form video", maxTitle: 100, titleRequired: true, maxChars: 5000, media: { kind: "video", min: 1, max: 1 }, linkInBody: true, video: true },
      short: { label: "Short", maxTitle: 100, titleRequired: true, maxChars: 5000, media: { kind: "video", min: 1, max: 1 }, maxDurationSec: 180, linkInBody: false, video: true },
    },
  },
  blog: {
    label: "Blog", provider: "wordpress", accountTypes: ["site"], medium: "blog",
    formats: { article: { label: "Article", maxTitle: 200, titleRequired: true, media: { kind: "image", min: 0, max: 1 }, linkInBody: true, video: false } },
  },
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);
export const formatSpec = (channel: string, format: string): FormatSpec | null => CHANNELS[channel]?.formats[format] ?? null;

export type VariantContent = { title?: string | null; body: string; parts: string[]; cta?: string | null; destinationUrl?: string | null; mediaAssetIds: string[] };

/** Approvals bind to this. Copy, media, CTA and destination are material; nothing else is. */
export function variantHash(v: VariantContent): string {
  return createHash("sha256").update(JSON.stringify([v.title?.trim() ?? "", v.body.trim(), v.parts.map((p) => p.trim()), v.cta?.trim() ?? "", v.destinationUrl?.trim() ?? "", v.mediaAssetIds])).digest("hex");
}

// X counts every URL as 23 characters.
const xLength = (s: string) => [...s.replace(/https?:\/\/\S+/g, "x".repeat(23))].length;
const length = (channel: string, s: string) => (channel === "x" ? xLength(s) : [...s].length);

export type MediaInfo = { id: string; kind: string; status: string; durationSec?: number | null };

/** problems block approval/publishing; warnings are shown and do not block. */
export function validateVariant(channel: string, format: string, v: VariantContent, media: MediaInfo[]): { problems: string[]; warnings: string[] } {
  const spec = formatSpec(channel, format);
  if (!spec) return { problems: [`${channel} does not support the "${format}" format.`], warnings: [] };
  const problems: string[] = [], warnings: string[] = [];
  const label = `${CHANNELS[channel].label} ${spec.label.toLowerCase()}`;
  if (spec.titleRequired && !v.title?.trim()) problems.push(`${label} needs a title.`);
  if (spec.maxTitle && v.title && [...v.title].length > spec.maxTitle) problems.push(`Title is ${[...v.title].length} characters — the limit is ${spec.maxTitle}.`);
  if (spec.parts) {
    const parts = v.parts.filter((p) => p.trim());
    if (parts.length < spec.parts.min) problems.push(`A thread needs at least ${spec.parts.min} posts.`);
    if (parts.length > spec.parts.max) problems.push(`A thread can have at most ${spec.parts.max} posts.`);
    parts.forEach((p, i) => { const n = length(channel, p); if (n > spec.parts!.maxChars) problems.push(`Post ${i + 1} is ${n} characters — the limit is ${spec.parts!.maxChars}.`); });
  } else {
    if (!v.body.trim() && !spec.video) problems.push("The copy is empty.");
    const n = length(channel, v.body);
    if (spec.maxChars && n > spec.maxChars) problems.push(`Copy is ${n} characters — the limit is ${spec.maxChars}.`);
  }
  if (spec.media) {
    const found = v.mediaAssetIds.map((id) => media.find((m) => m.id === id));
    if (found.some((m) => !m)) problems.push("An attached asset no longer exists.");
    const ok = found.filter((m): m is MediaInfo => Boolean(m));
    if (ok.length < spec.media.min) problems.push(spec.video ? `${label} needs a finished video file from Assets — a script or storyboard is not a video.` : `${label} needs ${spec.media.kind === "document" ? "a PDF, PowerPoint or Word file from Assets" : spec.media.min === 1 ? "an image" : `at least ${spec.media.min} images/videos`}.`);
    if (ok.length > spec.media.max) problems.push(`${label} allows at most ${spec.media.max} media file(s).`);
    if (spec.media.kind !== "any" && ok.some((m) => m.kind !== spec.media!.kind)) problems.push(`${label} accepts ${spec.media.kind} files only.`);
    if (ok.some((m) => m.status !== "approved")) warnings.push("Attached media is not approved in Assets yet.");
    if (spec.maxDurationSec) for (const m of ok) {
      if (m.durationSec == null) warnings.push("Video duration is unknown — check it fits the format before publishing.");
      else if (m.durationSec > spec.maxDurationSec) problems.push(`Video is ${m.durationSec}s — ${spec.label} allows ${spec.maxDurationSec}s.`);
    }
  }
  if (v.destinationUrl && !/^https:\/\/[^\s]+$/i.test(v.destinationUrl)) problems.push("Destination link must be a full https:// address.");
  if (v.destinationUrl && !spec.linkInBody) warnings.push(`Links in ${label} captions are not clickable — point people to the profile link or use the platform's link feature.`);
  return { problems, warnings };
}

/**
 * Campaign-tagged destination built from STABLE ids: utm_campaign = campaign code (never renamed),
 * utm_content = variant id. Existing utm_* on the URL are replaced so tags never contradict.
 */
export function taggedUrl(destinationUrl: string, opts: { campaignCode: string; channel: string; variantId: string; paid?: boolean }): string {
  const url = new URL(destinationUrl);
  for (const k of [...url.searchParams.keys()]) if (k.toLowerCase().startsWith("utm_")) url.searchParams.delete(k);
  url.searchParams.set("utm_source", opts.channel);
  url.searchParams.set("utm_medium", opts.paid ? `paid_${CHANNELS[opts.channel]?.medium ?? "social"}` : CHANNELS[opts.channel]?.medium ?? "social");
  url.searchParams.set("utm_campaign", opts.campaignCode);
  url.searchParams.set("utm_content", opts.variantId);
  return url.toString();
}

/** Body as it will actually be sent: copy + CTA + tagged link (when the format carries links in the copy). */
export function renderBody(channel: string, format: string, v: VariantContent, link: string | null): string {
  const spec = formatSpec(channel, format);
  const tail = [v.cta?.trim(), spec?.linkInBody ? link : null].filter(Boolean).join(" ");
  return [v.body.trim(), tail].filter(Boolean).join("\n\n");
}

/** Normalised fingerprint for duplicate-content checks (case, whitespace, URLs and punctuation ignored). */
export function copyFingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm.length < 20 ? "" : createHash("sha1").update(norm).digest("hex");
}
