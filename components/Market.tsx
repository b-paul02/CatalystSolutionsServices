"use client";

import { useEffect, useState, type ReactNode } from "react";

// Indian visitors see the ₹ price book, everyone else sees $ — never both,
// never converted. ponytail: pure-function detection, no context/provider —
// every instance resolves to the same answer on mount.
function detectIndia(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return true;
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs.some((l) => /-IN$/i.test(l ?? ""));
  } catch {
    return false;
  }
}

export function useMarket(): "in" | "us" | null {
  const [m, setM] = useState<"in" | "us" | null>(null);
  useEffect(() => setM(detectIndia() ? "in" : "us"), []);
  return m; // null until mounted, so the wrong price book never flashes
}

/** Renders the market-appropriate variant. Reserves layout with the US variant (invisible) until resolved. */
export default function Market({ in: inr, us }: { in: ReactNode; us: ReactNode }) {
  const m = useMarket();
  if (!m) return <span className="invisible">{us}</span>;
  return <>{m === "in" ? inr : us}</>;
}

/** Renders children only for the given market (e.g. India-only seasonal notes). */
export function MarketOnly({ market, children }: { market: "in" | "us"; children: ReactNode }) {
  const m = useMarket();
  return m === market ? <>{children}</> : null;
}
