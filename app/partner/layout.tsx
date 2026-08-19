import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/partner/auth";
import LogoutButton from "./LogoutButton";

export const metadata = { robots: { index: false } };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  // Shell-level gate for navigation only — every mutation re-checks server-side.
  if (!actor) return <>{children}</>; // login page — no chrome
  if (actor.role !== "partner" || !actor.partnerId) redirect("/partner/login");

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
