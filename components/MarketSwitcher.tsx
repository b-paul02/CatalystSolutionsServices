"use client";

import { useMarket, useMarketChoice, setMarket, type MarketChoice } from "./Market";

// Lets a visitor pick which price book they see. Defaults to "auto", which is
// the timezone/locale detection — so the switcher only ever overrides, never
// replaces, the default behaviour.
const OPTIONS: { value: MarketChoice; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "in", label: "India (₹)" },
  { value: "us", label: "United States ($)" },
];

export default function MarketSwitcher() {
  const choice = useMarketChoice();
  const resolved = useMarket();

  return (
    <span className="flex items-center gap-2">
      <label htmlFor="market-switcher" className="text-[12.5px] text-[#6b6b7a]">Prices in</label>
      <select
        id="market-switcher"
        value={choice}
        onChange={(e) => setMarket(e.target.value as MarketChoice)}
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-2)] px-2 py-1 text-[12.5px] text-[var(--color-muted)] hover:text-white focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#13101f]">
            {o.value === "auto" && resolved ? `Auto-detect (${resolved === "in" ? "₹" : "$"})` : o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
