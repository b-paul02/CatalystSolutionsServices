// Pure SVG score dial (0–100). No client JS; works in server and client components.
export default function ScoreDial({ pct, color = "#6d28d9", size = 160, label }: { pct: number; color?: string; size?: number; label?: string }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Score ${v} out of 100${label ? `, ${label}` : ""}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" fontSize="28" fontWeight="800" fill="currentColor">{v}</text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">out of 100</text>
    </svg>
  );
}
