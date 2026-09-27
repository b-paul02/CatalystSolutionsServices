"use client";

import { useEffect, useRef } from "react";

// WP-43 · dots on a canvas over the screenshot; percent coordinates scale with the image.
export default function Heatmap({ src, clicks }: { src: string | null; clicks: { x: number; y: number; tag: string | null }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current, c = canvas.current; if (!el || !c) return;
    const draw = () => { const w = el.clientWidth, h = el.clientHeight || 400; c.width = w; c.height = h; const ctx = c.getContext("2d"); if (!ctx) return; ctx.clearRect(0, 0, w, h); for (const k of clicks) { const g = ctx.createRadialGradient((k.x / 100) * w, (k.y / 100) * h, 0, (k.x / 100) * w, (k.y / 100) * h, 18); g.addColorStop(0, "rgba(255,60,0,0.55)"); g.addColorStop(1, "rgba(255,60,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc((k.x / 100) * w, (k.y / 100) * h, 18, 0, Math.PI * 2); ctx.fill(); } };
    draw(); const ro = new ResizeObserver(draw); ro.observe(el); return () => ro.disconnect();
  }, [clicks, src]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg border border-[var(--los-line)] bg-[var(--los-surface-2)]" style={src ? undefined : { height: 400 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="Page screenshot" className="block w-full" />}
      <canvas ref={canvas} className="pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
