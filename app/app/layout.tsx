import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "CatalystGrowthOS — Catalyst Solutions", template: "%s — CatalystGrowthOS" },
  // Keep the app subdomain out of search until launch (remove at go-live).
  robots: { index: false },
};

// CatalystGrowthOS app shell. Signed-in navigation arrives with Phase 1 auth; this
// layout provides the scoped light theme and full-height ground.
export default function LeadosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-leados className="min-h-dvh">
      {children}
    </div>
  );
}
