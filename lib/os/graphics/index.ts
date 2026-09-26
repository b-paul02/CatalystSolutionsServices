// WP-19/22 · templated graphics with next/og ImageResponse (built into Next). Server-side only. Fields are plain
// strings; brand colours come from the workspace. Output is PNG (ponytail: PNG only — WebP needs sharp).
// Tests swap the renderer, because satori/resvg need the Node runtime and fonts.
import { createElement } from "react";
import { ImageResponse } from "next/og";

export type TemplateKey = "quote_card" | "carousel_slide" | "blog_cover";
export type TemplateFields = { title: string; body?: string; brand?: string; color?: string; index?: number; total?: number; width?: number; height?: number };
export const TEMPLATES: Record<TemplateKey, { label: string; width: number; height: number; fields: (keyof TemplateFields)[] }> = {
  quote_card: { label: "Quote card (square)", width: 1080, height: 1080, fields: ["title", "body", "brand", "color"] },
  carousel_slide: { label: "Carousel slide (portrait)", width: 1080, height: 1350, fields: ["title", "body", "brand", "color", "index", "total"] },
  blog_cover: { label: "Blog cover (landscape)", width: 1200, height: 630, fields: ["title", "brand", "color"] },
};

const h = createElement;
const safeColor = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#6d28d9");

/** The template as a React element tree (satori subset: flex, absolute, text). */
export function templateElement(key: TemplateKey, f: TemplateFields) {
  const t = TEMPLATES[key], color = safeColor(f.color), brand = (f.brand ?? "").slice(0, 60), title = (f.title ?? "").slice(0, 160), body = (f.body ?? "").slice(0, 400);
  const base = { display: "flex", flexDirection: "column" as const, width: "100%", height: "100%", padding: 72, background: "#ffffff", color: "#111111", fontFamily: "sans-serif" };
  if (key === "blog_cover") return h("div", { style: { ...base, justifyContent: "flex-end", background: `linear-gradient(135deg, ${color} 0%, #111111 100%)`, color: "#ffffff" } }, h("div", { style: { fontSize: 22, opacity: 0.85, letterSpacing: 2, textTransform: "uppercase" } }, brand), h("div", { style: { fontSize: 64, fontWeight: 800, lineHeight: 1.1, marginTop: 16 } }, title));
  if (key === "carousel_slide") return h("div", { style: { ...base, justifyContent: "space-between" } }, h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 26, color } }, h("span", null, brand), h("span", null, f.index && f.total ? `${f.index} / ${f.total}` : "")), h("div", { style: { display: "flex", flexDirection: "column" } }, h("div", { style: { fontSize: 60, fontWeight: 800, lineHeight: 1.1 } }, title), h("div", { style: { fontSize: 34, marginTop: 28, color: "#333333", lineHeight: 1.35 } }, body)), h("div", { style: { height: 14, width: 180, background: color, borderRadius: 7 } }));
  return h("div", { style: { ...base, justifyContent: "center", borderLeft: `28px solid ${color}` } }, h("div", { style: { fontSize: 56, fontWeight: 800, lineHeight: 1.15 } }, `“${title}”`), body ? h("div", { style: { fontSize: 32, marginTop: 32, color: "#444444" } }, body) : null, h("div", { style: { fontSize: 26, marginTop: 48, color } }, brand));
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
