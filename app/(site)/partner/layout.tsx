import Link from "next/link";
import { currentActor } from "@/lib/partner/auth";
import LogoutButton from "./LogoutButton";

export const metadata = { robots: { index: false } };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  // Chrome only, never a gate. This layout wraps /partner/login, so redirecting
  // from here would send that page to itself — which is exactly what happened
  // to anyone signed in as an admin in the same browser. Each page guards
  // itself (see partnerPage), and every mutation re-checks server-side.
  const isPartner = actor?.role === "partner" && Boolean(actor.partnerId);
  if (!isPartner) return <>{children}</>;

  return (
    <>
      <div className="border-b border-[var(--color-line)] bg-[var(--color-bg-2)]">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-3">
          <nav className="flex items-center gap-5 text-[13.5px] font-medium">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Partner</span>
            <Link href="/partner" className="text-[var(--color-muted)] hover:text-white">Dashboard</Link>
            <Link href="/partner/deals" className="text-[var(--color-muted)] hover:text-white">Deals</Link>
            <Link href="/partner/earnings" className="text-[var(--color-muted)] hover:text-white">Earnings</Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-[12.5px] text-[var(--color-faint)]">{actor.email}</span>
            <LogoutButton />
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
