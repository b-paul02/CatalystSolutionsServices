// WP-19/22 · templated graphics with next/og ImageResponse (built into Next). Server-side only. Fields are plain
// strings; brand colours come from the workspace. Output is PNG (ponytail: PNG only — WebP needs sharp).
// Tests swap the renderer, because satori/resvg need the Node runtime and fonts.
import { createElement } from "react";
import { ImageResponse } from "next/og";

export type TemplateKey = "quote_card" | "carousel_slide" | "blog_cover" | "scorecard_share";
export type TemplateFields = { title: string; body?: string; brand?: string; color?: string; index?: number; total?: number; width?: number; height?: number };
export const TEMPLATES: Record<TemplateKey, { label: string; width: number; height: number; fields: (keyof TemplateFields)[] }> = {
  quote_card: { label: "Quote card (square)", width: 1080, height: 1080, fields: ["title", "body", "brand", "color"] },
  carousel_slide: { label: "Carousel slide (portrait)", width: 1080, height: 1350, fields: ["title", "body", "brand", "color", "index", "total"] },
  blog_cover: { label: "Blog cover (landscape)", width: 1200, height: 630, fields: ["title", "brand", "color"] },
  scorecard_share: { label: "Scorecard share card", width: 1200, height: 630, fields: ["title", "body", "brand", "color"] },
};

const h = createElement;
const safeColor = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#6d28d9");

/** The template as a React element tree (satori subset: flex, absolute, text). */
export function templateElement(key: TemplateKey, f: TemplateFields) {
  const t = TEMPLATES[key], color = safeColor(f.color), brand = (f.brand ?? "").slice(0, 60), title = (f.title ?? "").slice(0, 160), body = (f.body ?? "").slice(0, 400);
  const base = { display: "flex", flexDirection: "column" as const, width: "100%", height: "100%", padding: 72, background: "#ffffff", color: "#111111", fontFamily: "sans-serif" };
  if (key === "scorecard_share") return h("div", { style: { ...base, justifyContent: "center", alignItems: "center", textAlign: "center", background: "#ffffff", borderTop: `24px solid ${color}` } }, h("div", { style: { fontSize: 24, color, letterSpacing: 2, textTransform: "uppercase" } }, brand), h("div", { style: { fontSize: 88, fontWeight: 800, lineHeight: 1.05, marginTop: 12 } }, title), h("div", { style: { fontSize: 30, color: "#555555", marginTop: 20 } }, body), h("div", { style: { fontSize: 20, color: "#999999", marginTop: 28 } }, "Self-reported assessment · not a verified audit"));
  if (key === "blog_cover") return h("div", { style: { ...base, justifyContent: "flex-end", background: `linear-gradient(135deg, ${color} 0%, #111111 100%)`, color: "#ffffff" } }, h("div", { style: { fontSize: 22, opacity: 0.85, letterSpacing: 2, textTransform: "uppercase" } }, brand), h("div", { style: { fontSize: 64, fontWeight: 800, lineHeight: 1.1, marginTop: 16 } }, title));
  if (key === "carousel_slide") return h("div", { style: { ...base, justifyContent: "space-between" } }, h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 26, color } }, h("span", null, brand), h("span", null, f.index && f.total ? `${f.index} / ${f.total}` : "")), h("div", { style: { display: "flex", flexDirection: "column" } }, h("div", { style: { fontSize: 60, fontWeight: 800, lineHeight: 1.1 } }, title), h("div", { style: { fontSize: 34, marginTop: 28, color: "#333333", lineHeight: 1.35 } }, body)), h("div", { style: { height: 14, width: 180, background: color, borderRadius: 7 } }));
  return h("div", { style: { ...base, justifyContent: "center", borderLeft: `28px solid ${color}` } }, h("div", { style: { fontSize: 56, fontWeight: 800, lineHeight: 1.15 } }, `“${title}”`), body ? h("div", { style: { fontSize: 32, marginTop: 32, color: "#444444" } }, body) : null, h("div", { style: { fontSize: 26, marginTop: 48, color } }, brand));
}

// ── signed URLs for the /api/os/graphics/[template] route (WP-22) ─────────────
import { createHmac, timingSafeEqual } from "node:crypto";
const FIELD_KEYS = ["title", "body", "brand", "color", "index", "total"] as const;
const secret = () => { const s = process.env.LEADOS_SECRET; if (!s) throw new Error("LEADOS_SECRET is required."); return s; };
const sign = (params: URLSearchParams) => createHmac("sha256", secret()).update([...params.entries()].filter(([k]) => k !== "sig").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&")).digest("hex").slice(0, 32);
export function signedGraphicUrl(key: TemplateKey, f: TemplateFields): string {
  const params = new URLSearchParams();
  for (const k of FIELD_KEYS) if (f[k] !== undefined && f[k] !== null && f[k] !== "") params.set(k, String(f[k]));
  params.set("sig", sign(params));
  return `/api/os/graphics/${key}?${params.toString()}`;
}
export function verifyGraphicParams(params: URLSearchParams): TemplateFields | null {
  const sig = params.get("sig") ?? "";
  const expected = sign(params);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { title: params.get("title") ?? "", body: params.get("body") ?? undefined, brand: params.get("brand") ?? undefined, color: params.get("color") ?? undefined, index: params.get("index") ? Number(params.get("index")) : undefined, total: params.get("total") ? Number(params.get("total")) : undefined };
}

type Renderer = (key: TemplateKey, f: TemplateFields) => Promise<Buffer>;
let renderer: Renderer = async (key, f) => {
  const t = TEMPLATES[key];
  const res = new ImageResponse(templateElement(key, f), { width: f.width ?? t.width, height: f.height ?? t.height });
  return Buffer.from(await res.arrayBuffer());
};
export const setTemplateRendererForTests = (r: Renderer) => { renderer = r; };

/** PNG bytes for a template. */
export const renderTemplate = (key: TemplateKey, f: TemplateFields): Promise<Buffer> => renderer(key, f);
