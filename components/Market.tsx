"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Indian visitors see the ₹ price book, everyone else sees $ — never both,
// never converted. Detected from timezone/locale by default; the footer lets a
// visitor override that, and the choice sticks.
//
// ponytail: module-level store + useSyncExternalStore, no context provider.
// Every <Market> on the page re-reads the same value the moment it changes.

export type MarketCode = "in" | "us";
export type MarketChoice = MarketCode | "auto";

const KEY = "catalyst-market";
const listeners = new Set<() => void>();

let detected: MarketCode | null = null;
let choice: MarketChoice | null = null; // null = not read from storage yet

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

function readChoice(): MarketChoice {
  if (choice) return choice;
  try {
    const stored = localStorage.getItem(KEY);
    choice = stored === "in" || stored === "us" ? stored : "auto";
  } catch {
    choice = "auto"; // private mode or storage disabled — fall back to detection
  }
  return choice;
}

/** Resolved market: the visitor's explicit choice, else what we detect. */
function snapshot(): MarketCode {
  const c = readChoice();
  if (c !== "auto") return c;
  if (!detected) detected = detectIndia() ? "in" : "us";
  return detected;
}

function choiceSnapshot(): MarketChoice {
  return readChoice();
}

function notify() {
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  choice = null; // re-read on next snapshot, so other tabs stay in step
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Set from the footer switcher. "auto" clears the override and returns to detection. */
export function setMarket(next: MarketChoice) {
  choice = next;
  try {
    if (next === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
  notify();
}

/** null until mounted, so the wrong price book never flashes. */
export function useMarket(): MarketCode | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** What the visitor picked — "auto" when they have not chosen. */
export function useMarketChoice(): MarketChoice {
  return useSyncExternalStore(subscribe, choiceSnapshot, () => "auto" as MarketChoice);
}

/** Renders the market-appropriate variant. Reserves layout with the US variant (invisible) until resolved. */
export default function Market({ in: inr, us }: { in: ReactNode; us: ReactNode }) {
  const m = useMarket();
  if (!m) return <span className="invisible">{us}</span>;
  return <>{m === "in" ? inr : us}</>;
}

/** Renders children only for the given market (e.g. India-only seasonal notes). */
export function MarketOnly({ market, children }: { market: MarketCode; children: ReactNode }) {
  const m = useMarket();
  return m === market ? <>{children}</> : null;
}
